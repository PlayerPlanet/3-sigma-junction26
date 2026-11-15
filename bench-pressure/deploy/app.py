"""Bench Pressure live demo on Modal: the game page plus three AI lab partners.

    GET  /                 the game (static HTML)
    GET  /api/status       which partners are configured (the page uses it to detect same-origin /api)
    POST /api/gemini       Gemini (live API, same prompt + JSON schema as the recorded runs)
    POST /api/nemotron     NVIDIA Nemotron (live API, same prompt, JSON asked for in the prompt)
    POST /api/gemma        our GRPO-trained Gemma 4 (LoRA on Modal GPU) picks the experiment;
                           a stated rule decides publish / which grant
    POST /api/gemma/warm   start the Gemma GPU container (the page calls it when Gemma is selected)

Request body for the decision endpoints: {"game": "<client game id>", "state": {...compact game state...}}.
Response: {"action": "run"|"publish"|"wait", "ticket", "experiment", "why", "by", "model", "ms", ...}.
Failures, timeouts and rate limits all come back as HTTP 200 {"action": "wait", "why": ..., "status": ...}.

Deploy:   modal deploy --env 3-sigma-submission app.py
Warm GPU: modal run --env 3-sigma-submission app.py::warm --on      (min_containers=1; --off to undo)
Stop:     modal app stop --env 3-sigma-submission bench-pressure
GEMMA=E4B modal deploy ...  serves the lighter E4B GRPO adapter on an L40S instead of 26B-A4B.
"""


import os
import time
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
APP = "bench-pressure"
app = modal.App(APP)

GEMINI_MODEL = "gemini-4-argon"
NEMOTRON_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b"

# Gemma: (HF id, GPU, adapter on the bayesenv-curve volume). 26B-A4B needs ~59 GB at bf16 (peak in the
# training eval), more than an L40S's 48 GB, so it runs on the RTX PRO 6000 it was trained on.
GEMMAS = {
    "26B-A4B": ("google/gemma-4-26B-A4B-it", "RTX-PRO-6000", "runs/full/26B-A4B/grpo/adapter"),
    "E4B": ("google/gemma-4-E4B-it", "L40S", "runs/full/E4B/grpo/adapter"),
}
GEMMA = os.environ.get("GEMMA", "26B-A4B")
GEMMA_HF, GEMMA_GPU, GEMMA_ADAPTER = GEMMAS[GEMMA]
PREFILL = "<observe>["

web_image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("fastapi[standard]==0.121.0", "httpx==0.28.1")
    .add_local_file(str(HERE / "prompts.py"), "/root/prompts.py")
    .add_local_file(str(HERE / "index.html"), "/root/index.html")
)
# Same packages and pins as train/modal_curve.py, so the adapter runs on the stack it was trained with.
gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("torch==2.15.0", "transformers==5.23.0", "peft==0.21.3", "accelerate", "timm",
                    "huggingface_hub[hf_transfer]", "numpy==2.3.4", "scipy==1.16.3", "pyyaml==6.0.2",
                    "sentencepiece", "protobuf", "pillow")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "TOKENIZERS_PARALLELISM": "false",
          "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True", "HF_HUB_OFFLINE": "1"})
    .add_local_file(str(HERE / "prompts.py"), "/root/prompts.py")
)
curve_vol = modal.Volume.from_name("bayesenv-curve")
hf_cache = modal.Volume.from_name("bayesenv-hf-cache")


# ---------------------------------------------------------------------------- Gemma on GPU
@app.cls(gpu=GEMMA_GPU, image=gpu_image, volumes={"/vol": curve_vol, "/root/.cache/huggingface": hf_cache},
         cpu=4.0, memory=65536, timeout=120, startup_timeout=1200, scaledown_window=600, max_containers=1, min_containers=0)
class Gemma:
    @modal.enter()
    def load(self):
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer

        t0 = time.time()
        self.tok = AutoTokenizer.from_pretrained(GEMMA_HF)
        self.tok.padding_side = "left"
        if self.tok.pad_token_id is None:
            self.tok.pad_token = self.tok.eos_token
        base = AutoModelForCausalLM.from_pretrained(GEMMA_HF, dtype=torch.bfloat16, device_map={"": 0})
        self.m = PeftModel.from_pretrained(base, f"/vol/{GEMMA_ADAPTER}")
        self.m.eval()
        self.kw = {"enable_thinking": False} if "enable_thinking" in (self.tok.chat_template or "") else {}
        self.load_s = round(time.time() - t0, 1)
        print(f"loaded {GEMMA} + GRPO adapter in {self.load_s}s", flush=True)
        self._choose([{"role": "system", "content": "x"}, {"role": "user", "content": "Pick one: <observe>[1]</observe>"}])  # warm kernels

    @modal.method()
    def ping(self) -> dict:
        return {"ok": True, "model": GEMMA, "load_s": self.load_s}

    @modal.method()
    def choose(self, messages: list[dict]) -> dict:
        return self._choose(messages)

    def _choose(self, messages: list[dict]) -> dict:
        """Greedy completion of the rendered design prompt + PREFILL, exactly as in training/eval."""
        import torch

        t0 = time.time()
        text = self.tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, **self.kw) + PREFILL
        enc = self.tok([text], return_tensors="pt", add_special_tokens=False).to("cuda")
        with torch.inference_mode():
            gen = self.m.generate(**enc, max_new_tokens=48, do_sample=False, pad_token_id=self.tok.pad_token_id)
        out = PREFILL + self.tok.decode(gen[0, enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        return {"completion": out[:400], "gpu_ms": int((time.time() - t0) * 1000), "prompt_tokens": int(enc["input_ids"].shape[1])}


@app.local_entrypoint()
def warm(on: bool = False, off: bool = False):
    """Keep one Gemma GPU container warm during judging (--on) or let it scale to zero again (--off)."""
    g = modal.Cls.from_name(APP, "Gemma", environment_name="3-sigma-submission")()
    g.update_autoscaler(min_containers=1 if on and not off else 0)
    print("Gemma min_containers =", 1 if on and not off else 0)


# ---------------------------------------------------------------------------- web
@app.function(image=web_image, secrets=[modal.Secret.from_name("bench-gemini"), modal.Secret.from_name("bench-nvidia")],
              cpu=1.0, memory=1024, max_containers=1, scaledown_window=900, timeout=60)
@modal.concurrent(max_inputs=64)
@modal.asgi_app()
def web():
    """A single container (max_containers=1), so the in-memory rate limiter below is global."""
    import asyncio
    import collections
    import hashlib
    import json

    import httpx
    from fastapi import FastAPI, Request
    from fastapi.responses import HTMLResponse, JSONResponse, Response

    import prompts as P

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    page = Path("/root/index.html").read_bytes()
    client = httpx.AsyncClient(timeout=httpx.Timeout(28.0, connect=5.0))
    gemma_cls = modal.Cls.from_name(APP, "Gemma")

    # ---- abuse guards (all in-memory; one container) -------------------------------------
    MAX_BODY = 16 * 1024
    MIN_GAP = 2.0                  # seconds between decisions per IP (all partners)
    PER_GAME = 160                 # decisions per game id (a 180 s round needs ~40-80)
    PER_IP_HOUR = {"gemini": 300, "nemotron": 200, "gemma": 600, "warm": 30}
    GLOBAL_MIN = {"gemini": 40, "nemotron": 30, "gemma": 120, "warm": 20}   # per rolling minute, all players
    INFLIGHT = {"gemini": asyncio.Semaphore(6), "nemotron": asyncio.Semaphore(4), "gemma": asyncio.Semaphore(4)}
    last_ip: dict[str, float] = {}
    hits: dict[tuple, collections.deque] = collections.defaultdict(collections.deque)
    per_game: dict[str, int] = {}

    def ip_of(req: Request) -> str:
        return req.client.host if req.client else "?"

    def within(key: tuple, n: int, window: float) -> bool:
        q, now = hits[key], time.time()
        while q and q[0] < now - window:
            q.popleft()
        if len(q) >= n:
            return False
        q.append(now)
        return True

    def wait(why: str, status: str, **kw) -> JSONResponse:
        return JSONResponse({"action": "wait", "why": why, "status": status, **kw})

    async def admit(req: Request, partner: str):
        """Returns (state, game) or a ready response."""
        if int(req.headers.get("content-length") or 0) > MAX_BODY:
            return JSONResponse({"error": "too large"}, status_code=413)
        body = await req.body()
        if len(body) > MAX_BODY:
            return JSONResponse({"error": "too large"}, status_code=413)
        try:
            j = json.loads(body)
            state = P.clean_state(j.get("state"))
            game = str(j.get("game", ""))[:40] or "?"
        except (ValueError, AttributeError, TypeError) as e:
            return JSONResponse({"error": f"bad request: {str(e)[:80]}"}, status_code=400)
        ip, now = ip_of(req), time.time()
        if now - last_ip.get(ip, 0) < MIN_GAP:
            return wait("partner rate-limited (max 1 decision / 2 s)", "rate_limited")
        if per_game.get(game, 0) >= PER_GAME:
            return wait("partner rate-limited (decision cap for this game)", "rate_limited")
        if not within(("ip", partner, ip), PER_IP_HOUR[partner], 3600):
            return wait("partner rate-limited (hourly cap)", "rate_limited")
        if not within(("global", partner), GLOBAL_MIN[partner], 60):
            return wait("partner rate-limited (shared budget, try again shortly)", "rate_limited")
        last_ip[ip] = now
        per_game[game] = per_game.get(game, 0) + 1
        if len(per_game) > 20000:
            per_game.clear()
        if len(last_ip) > 50000:
            last_ip.clear()
        return state, game

    def log(partner: str, req: Request, d: dict, ms: int):
        ipid = hashlib.sha256(ip_of(req).encode()).hexdigest()[:8]
        print(json.dumps({"p": partner, "ip": ipid, "a": d.get("action"), "st": d.get("status", "ok"), "ms": ms}), flush=True)

    # ---- routes ---------------------------------------------------------------------------
    @api.get("/")
    async def index():
        return HTMLResponse(page, headers={"cache-control": "no-cache"})

    @api.get("/favicon.ico")
    async def favicon():
        return Response(status_code=204)

    @api.get("/api/status")
    async def status():
        return {"ok": True, "partners": {"gemini": GEMINI_MODEL, "nemotron": NEMOTRON_MODEL,
                                         "gemma": f"gemma-4-{GEMMA} + GRPO LoRA (ours)"}}

    async def gemini_ask(prompt: str):
        body = {"systemInstruction": {"parts": [{"text": P.SYSTEM}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json", "responseSchema": P.SCHEMA}}
        r = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                              json=body, headers={"x-goog-api-key": os.environ["GDM_API_KEY"]})
        if r.status_code != 200:
            raise RuntimeError(f"gemini HTTP {r.status_code}")
        j = r.json()
        txt = "".join(p.get("text", "") for p in (j.get("candidates") or [{}])[0].get("content", {}).get("parts", []))
        return P.coerce(json.loads(txt))

    async def nemotron_ask(prompt: str):
        body = {"model": NEMOTRON_MODEL, "temperature": 0, "max_tokens": 300,
                "chat_template_kwargs": {"enable_thinking": False},
                "messages": [{"role": "system", "content": P.SYSTEM},
                             {"role": "user", "content": prompt + "\n\nReply with the JSON object only."}]}
        r = await client.post("https://integrate.api.nvidia.com/v1/chat/completions", json=body,
                              headers={"authorization": f"Bearer {os.environ['NVIDIA_API_KEY']}"})
        if r.status_code == 429:
            raise PermissionError("nemotron 429")
        if r.status_code != 200:
            raise RuntimeError(f"nemotron HTTP {r.status_code}")
        txt = r.json()["choices"][0]["message"].get("content") or ""
        d = P.coerce(P.parse_json_object(txt))
        if not isinstance(d, dict) or d.get("action") not in ("run", "publish", "wait"):
            print("nemotron unparsed reply:", json.dumps(txt[:300]), flush=True)
        return d

    async def llm_partner(req: Request, partner: str, ask, model: str, budget: float):
        t0 = time.time()
        a = await admit(req, partner)
        if not isinstance(a, tuple):
            return a
        state, _ = a
        prompt = P.describe(state)
        d, status = None, "ok"
        try:
            async with INFLIGHT[partner]:
                d = await asyncio.wait_for(ask(prompt), budget)
                if not P.valid_decision(state, d) and time.time() - t0 < budget / 2:
                    # one corrective retry, as in the offline harness
                    d = await asyncio.wait_for(ask(prompt + f"\n\nYour previous answer {json.dumps(d)[:300]} was not a valid action here "
                                                   "(check the ticket id, the experiment number, and whether running is possible). Answer again."),
                                               budget - (time.time() - t0))
        except PermissionError:
            status = "rate_limited"
        except (asyncio.TimeoutError, httpx.TimeoutException):
            status = "timeout"
        except Exception as e:  # noqa: BLE001 - never surface upstream details
            print(f"{partner} error: {type(e).__name__}", flush=True)
            status = "error"
        ms = int((time.time() - t0) * 1000)
        if status != "ok":
            out = {"action": "wait", "why": "partner rate-limited" if status == "rate_limited" else "partner offline", "status": status}
        elif not P.valid_decision(state, d):
            print(f"{partner} invalid decision:", json.dumps(d)[:300], flush=True)
            out = {"action": "wait", "why": "(invalid answer, treated as wait)", "status": "invalid"}
        else:
            out = {**P.tidy(d), "status": "ok"}
        out.update(by=partner, model=model, ms=ms)
        if out["action"] == "run":
            t = next(t for t in state["tickets"] if t["id"] == out["ticket"])
            eigs = [P.eig(t["post"], e["lik"]) for e in t["exps"]]
            out.update(eig=round(eigs[out["experiment"]], 4), best_eig=round(max(eigs), 4))
        log(partner, req, out, ms)
        return JSONResponse(out)

    @api.post("/api/gemini")
    async def gemini(req: Request):
        return await llm_partner(req, "gemini", gemini_ask, GEMINI_MODEL, 28.0)

    @api.post("/api/nemotron")
    async def nemotron(req: Request):
        return await llm_partner(req, "nemotron", nemotron_ask, NEMOTRON_MODEL, 25.0)

    @api.post("/api/gemma/warm")
    async def gemma_warm(req: Request):
        if not within(("ip", "warm", ip_of(req)), PER_IP_HOUR["warm"], 3600) or not within(("global", "warm"), GLOBAL_MIN["warm"], 60):
            return {"ok": False, "status": "rate_limited"}
        t0 = time.time()
        call = await gemma_cls().ping.spawn.aio()
        try:
            r = await call.get.aio(timeout=2.0)
            return {"ok": True, "warm": True, "ms": int((time.time() - t0) * 1000), **r}
        except Exception as e:  # noqa: BLE001 - modal raises a TimeoutError while the container boots
            if "Timeout" not in type(e).__name__:
                return {"ok": False, "status": "error"}
            return {"ok": True, "warm": False, "status": "warming"}

    @api.post("/api/gemma")
    async def gemma(req: Request):
        t0 = time.time()
        a = await admit(req, "gemma")
        if not isinstance(a, tuple):
            return a
        state, _ = a
        model = f"gemma-4-{GEMMA}+GRPO"
        rule = P.gemma_rule(state)
        if rule["action"] != "run":
            out = {**rule, "by": "rule", "model": model, "status": "ok", "ms": int((time.time() - t0) * 1000)}
            log("gemma", req, out, out["ms"])
            return JSONResponse(out)
        t = next(t for t in state["tickets"] if t["id"] == rule["ticket"])
        msgs, cands = P.gemma_messages(t)
        status, res = "ok", None
        try:
            async with INFLIGHT["gemma"]:
                call = await gemma_cls().choose.spawn.aio(msgs)
                res = await call.get.aio(timeout=25.0)
        except Exception as e:  # noqa: BLE001
            if "Timeout" in type(e).__name__:
                status = "warming"   # cold start: the container keeps booting; the next request finds it warm
            else:
                status = "error"
                print(f"gemma error: {type(e).__name__}: {str(e)[:200]}", flush=True)
        ms = int((time.time() - t0) * 1000)
        if status != "ok":
            out = {"action": "wait", "why": "Gemma is warming up (GPU cold start)" if status == "warming" else "partner offline",
                   "status": status, "by": "gemma", "model": model, "ms": ms}
            log("gemma", req, out, ms)
            return JSONResponse(out)
        i = P.gemma_choice(res["completion"], cands)
        eigs = [P.eig(t["post"], e["lik"]) for e in t["exps"]]
        if i is None:
            out = {"action": "wait", "why": "(Gemma's answer matched no candidate, treated as wait)", "status": "invalid"}
        else:
            out = {"action": "run", "ticket": t["id"], "experiment": i, "status": "ok",
                   "why": f"Gemma picked E{i} {json.dumps(cands[i])} from {len(cands)} candidates: EIG {eigs[i]:.3f} of best {max(eigs):.3f} bits. Grant #{t['id']} chosen by the {rule['why']}",
                   "eig": round(eigs[i], 4), "best_eig": round(max(eigs), 4)}
        out.update(by="gemma", model=model, ms=ms, gpu_ms=res["gpu_ms"], rule=rule["why"],
                   completion=res["completion"][:120], n_candidates=len(cands))
        log("gemma", req, out, ms)
        return JSONResponse(out)

    return api
