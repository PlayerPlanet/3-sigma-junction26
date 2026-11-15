"""The demo page on Modal, plus a live GPU endpoint where the GRPO-trained Gemma 4 E2B plays Rulebound Battleship.

    GET  /                    the static demo/ folder
    POST /api/gemma/act       {"history": [[action, result], ...], "variant": "grpo"|"base"}
                              -> {"action": 0-47 | "stop", "text": raw model reply, "texts": [...], "ms": ...}
    GET  /api/gemma/health    {"ok": true} (CPU only, never starts the GPU)

The browser holds the hidden board and the noise (demo/src/engine.js, a verified port of bayesenv/battleship.py);
the server holds no game state. It rebuilds the exact posterior from the history with bayesenv/battleship.py,
renders the same prompt the model was evaluated with (bs_prompt.py; check with check_prompt.py), decodes greedily
(12 new tokens, as in the eval), and parses it the same way: one retry with the eval's retry line, then "stop".
Actions: 0-35 fire row*6+col, 36-41 scan row, 42-47 scan column (same ids as engine.js).

Model: google/gemma-4-E2B-it from the shared HF cache volume (bayesenv-hf-cache), LoRA adapter from the volume
battleship-live:/grpo-adapter, fp16 + eager attention as in the eval (vision/audio towers dropped, as in training).
"base" runs the same weights with the adapter disabled.

Cost guards: GPU L4 (A10G fallback), min_containers=0, max_containers=1, one input at a time, scaledown after 180 s idle, 60 s
timeouts; the web function is one small CPU container with a per-IP limit (30 moves/min), a global limit,
a 4 kB body cap and at most 4 requests waiting on the GPU.

    M="uv run --no-project --with modal modal"   # PYTHONIOENCODING=utf-8 PYTHONUTF8=1 on Windows
    $M deploy --env 3-sigma-submission deploy_modal/app.py
    $M app stop --env 3-sigma-submission battleship-live
Pushes to main that touch demo/, deploy_modal/, paper/3sigma-whitepaper.pdf or bayesenv/battleship.py redeploy
automatically (.github/workflows/deploy-demo.yml; needs repo secrets MODAL_TOKEN_ID and MODAL_TOKEN_SECRET).
Adapter upload (once): MSYS_NO_PATHCONV=1 $M volume put --env 3-sigma-submission battleship-live <adapter dir> /grpo-adapter
"""
import asyncio
import time
from collections import defaultdict, deque
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
APP = "battleship-live"
HF = "google/gemma-4-E2B-it"
ADAPTER = "/live/grpo-adapter"
MAX_NEW = 12          # MAXNEW["bship"] in the eval
GPU = ["L4", "A10G"]     # L4 first; A10G (24 GB) when no L4 is free

app = modal.App(APP)

web_image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("fastapi[standard]==0.121.0", "numpy==2.3.4")
    .add_local_file(str(ROOT / "bayesenv" / "battleship.py"), "/root/battleship.py")
    .add_local_file(str(HERE / "bs_prompt.py"), "/root/bs_prompt.py")
    .add_local_dir(str(ROOT / "demo"), "/root/demo", ignore=["node_modules", "**/__pycache__", "tools"])
    # the paper's own build, so the demo's link never serves a stale copy of demo/assets/
    .add_local_file(str(ROOT / "paper" / "3sigma-whitepaper.pdf"), "/root/demo/assets/3sigma-whitepaper.pdf")
)
# same pins as train/modal_curve.py and bench-pressure/deploy/app.py
gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("torch==2.15.0", "transformers==5.23.0", "peft==0.21.3", "accelerate", "timm",
                    "huggingface_hub", "numpy==2.3.4", "sentencepiece", "protobuf", "pillow")
    .env({"TOKENIZERS_PARALLELISM": "false", "HF_HUB_OFFLINE": "1"})
    .add_local_file(str(ROOT / "bayesenv" / "battleship.py"), "/root/battleship.py")
    .add_local_file(str(HERE / "bs_prompt.py"), "/root/bs_prompt.py")
)
hf_cache = modal.Volume.from_name("bayesenv-hf-cache")
live_vol = modal.Volume.from_name("battleship-live")


@app.cls(gpu=GPU, image=gpu_image, volumes={"/root/.cache/huggingface": hf_cache, "/live": live_vol},
         cpu=2.0, memory=24576, timeout=60, startup_timeout=600, scaledown_window=180,
         min_containers=0, max_containers=1)
class Gemma:
    @modal.enter()
    def load(self):
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer

        t0 = time.time()
        self.tok = AutoTokenizer.from_pretrained(HF)
        self.tok.padding_side = "left"
        if self.tok.pad_token_id is None:
            self.tok.pad_token = self.tok.eos_token
        m = AutoModelForCausalLM.from_pretrained(HF, dtype=torch.float16, device_map={"": 0},
                                                 low_cpu_mem_usage=True, attn_implementation="eager")
        for n in ("vision_tower", "audio_tower", "embed_vision", "embed_audio"):
            if hasattr(m.model, n):
                setattr(m.model, n, None)
        torch.cuda.empty_cache()
        self.m = PeftModel.from_pretrained(m, ADAPTER)
        self.m.eval()
        self.kw = {"enable_thinking": False} if "enable_thinking" in (self.tok.chat_template or "") else {}
        self.load_s = round(time.time() - t0, 1)
        self.gpu = torch.cuda.get_device_name(0)
        self._gen([{"role": "user", "content": "Say ok."}])  # warm the kernels
        print(f"loaded {HF} + GRPO adapter in {self.load_s}s", flush=True)

    def _gen(self, msgs):
        import torch
        text = self.tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, **self.kw)
        enc = self.tok([text], return_tensors="pt", add_special_tokens=False).to("cuda")
        with torch.inference_mode():
            g = self.m.generate(**enc, max_new_tokens=MAX_NEW, do_sample=False, pad_token_id=self.tok.pad_token_id)
        return self.tok.decode(g[0, enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()

    @modal.method()
    def act(self, history: list, variant: str = "grpo") -> dict:
        import contextlib
        import bs_prompt as P

        t0 = time.time()
        moves, spent = P.validate(history)
        remaining = 20 - spent
        if remaining <= 0:
            return {"action": "stop", "text": "", "texts": [], "ms": 0, "note": "budget spent"}
        b = P.belief_of(moves)
        ctx = self.m.disable_adapter() if variant == "base" else contextlib.nullcontext()
        texts, action = [], None
        with ctx:
            for retry in (False, True):         # eval: invalid -> one retry with the retry line -> "stop"
                out = self._gen(P.messages(b, moves, spent, retry))
                texts.append(out)
                action = P.bs_parse(out, remaining)
                if action is not None:
                    break
        return {"action": "stop" if action is None else action, "text": texts[-1], "texts": texts,
                "fallback": action is None, "variant": variant, "load_s": self.load_s, "gpu": self.gpu,
                "ms": int((time.time() - t0) * 1000)}


# ---------------------------------------------------------------------------- web
PER_IP, GLOBAL, WINDOW, MAX_BODY, MAX_WAITING = 30, 240, 60.0, 4096, 4


@app.function(image=web_image, cpu=0.25, memory=512, min_containers=0, max_containers=1,
              scaledown_window=300, timeout=60)
@modal.concurrent(max_inputs=32)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles

    import bs_prompt as P

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    hits: dict[str, deque] = defaultdict(deque)
    all_hits: deque = deque()
    waiting = {"n": 0}
    gemma = Gemma()

    def limited(ip: str) -> bool:
        now = time.time()
        for q in (hits[ip], all_hits):
            while q and now - q[0] > WINDOW:
                q.popleft()
        if len(hits[ip]) >= PER_IP or len(all_hits) >= GLOBAL:
            return True
        hits[ip].append(now)
        all_hits.append(now)
        if len(hits) > 5000:
            hits.clear()
        return False

    def err(status, msg):
        return JSONResponse({"error": msg}, status_code=status)

    @api.get("/api/gemma/health")
    async def health():
        return {"ok": True, "model": HF, "adapter": "GRPO LoRA r32", "gpu": "/".join(GPU)}

    @api.post("/api/gemma/act")
    async def act(request: Request):
        ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
        if int(request.headers.get("content-length") or 0) > MAX_BODY:
            return err(413, "body too large")
        body = await request.body()
        if len(body) > MAX_BODY:
            return err(413, "body too large")
        if limited(ip):
            return err(429, "rate limit: at most 30 moves per minute")
        try:
            import json
            req = json.loads(body)
            if not isinstance(req, dict) or set(req) - {"history", "variant"}:
                raise ValueError("expected {history, variant}")
            variant = req.get("variant", "grpo")
            if variant not in ("grpo", "base"):
                raise ValueError("variant must be grpo or base")
            moves, _ = P.validate(req.get("history"))
            P.belief_of(moves)
        except Exception as e:  # noqa: BLE001
            return err(400, f"bad request: {e}"[:200])
        if waiting["n"] >= MAX_WAITING:
            return err(503, "busy, try again in a few seconds")
        waiting["n"] += 1
        try:
            t0 = time.time()
            res = await asyncio.wait_for(gemma.act.remote.aio([list(m) for m in moves], variant), timeout=58)
            res["wall_ms"] = int((time.time() - t0) * 1000)
            return res
        except asyncio.TimeoutError:
            return err(504, "the GPU did not answer in time (cold start?); try again")
        except Exception as e:  # noqa: BLE001
            return err(502, f"model error: {type(e).__name__}")
        finally:
            waiting["n"] -= 1

    api.mount("/", StaticFiles(directory="/root/demo", html=True), name="demo")
    return api
