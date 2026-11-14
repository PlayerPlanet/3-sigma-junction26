"""Model-size curve on Modal: train several Gemma 4 sizes on design rows, evaluate on held-out ones.

    M="uv run --no-project --with modal modal run --env 3-sigma-submission"   # PYTHONUTF8=1 on Windows
    $M train/modal_curve.py::upload --rows data/v1/rows.jsonl          # once: rows -> Volume
    $M train/modal_curve.py::one --model E2B --arm grpo --steps 10 --n-eval 100 --tag smoke
    $M --detach train/modal_curve.py::fanout                            # all models x arms
    modal volume get --env 3-sigma-submission bayesenv-curve runs/full results/curve/
    python scripts/analyze_curve.py --runs results/curve/full

Arms, each from the PLAIN base model (adapters are never stacked):
  base     no training
  grpo     GRPO, reward = datagen.design_reward (EIG of the chosen candidate / best candidate's)
  control  same prompts, seed and settings; reward 1.0 for any valid candidate, else 0.0
           ("valid" is defined in bayesenv/curve.py), so it isolates format/validity learning
  sft      one pass of supervised LoRA on the reference answer of the same train rows

The update is GRPO as train/grpo_predict.py ran it in TRL (beta=0, one policy update per batch of
samples, so the clipped ratio is 1 and the gradient is the group-normalised advantage times the
gradient of the mean token log-probability), written out here so that the prompt is rendered by
the same `render()` in training and evaluation, the adapter is evaluated in-process with PEFT on
the base it was trained on (no vLLM adapter serving), and each step logs reward, valid rate and
sample diversity. Recipe defaults: 8 generations, 2 prompts per optimiser step (TRL batch 8 x
accumulation 2), LoRA r=32 alpha=64 all-linear, lr 5e-6 linear decay, grad-norm clip 1.0,
temperature 1.0, 300 steps. Completions are capped at 128 new tokens, thinking off.

Ephemeral `modal run` only; nothing is deployed. Outputs: Volume `bayesenv-curve`,
runs/<tag>/<model>/<arm>/{eval_rows.jsonl, eval_summary.json, train_log.jsonl, samples.jsonl,
train_summary.json, adapter/, ckpt-<step>/}. Weights are cached in the Volume `bayesenv-hf-cache`.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App("bayesenv-curve")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("torch==2.15.0", "transformers==5.23.0", "peft==0.21.3", "accelerate", "timm",
                    "huggingface_hub[hf_transfer]", "numpy==2.3.4", "scipy==1.16.3", "pyyaml==6.0.2",
                    "sentencepiece", "protobuf", "pillow")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "TOKENIZERS_PARALLELISM": "false",
          "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"})
    .add_local_dir(str(ROOT / "bayesenv"), "/root/bayesenv", ignore=["__pycache__"])
    .add_local_dir(str(ROOT / "specs"), "/root/specs")
)
vol = modal.Volume.from_name("bayesenv-curve", create_if_missing=True)
hf_cache = modal.Volume.from_name("bayesenv-hf-cache", create_if_missing=True)
VOLS = {"/vol": vol, "/root/.cache/huggingface": hf_cache}

# name: (HF id, nominal size in B params, GPU, bf16 weight estimate GB, eval batch, sequences per
# backward pass). GPU = smallest Modal type that holds weights + a training step with headroom.
MODELS = {
    "E2B": ("google/gemma-4-E2B-it", 2, "L40S", 11, 32, 8),  # A10 (22 GB) runs out of memory in training
    "E4B": ("google/gemma-4-E4B-it", 4, "L40S", 17, 32, 8),
    "12B": ("google/gemma-4-12B-it", 12, "L40S", 25, 16, 4),
    "26B-A4B": ("google/gemma-4-26B-A4B-it", 26, "RTX-PRO-6000", 53, 16, 4),
    "31B": ("google/gemma-4-31B-it", 31, "H200", 63, 16, 4),
}
# approximate Modal list prices, USD per GPU-hour (for the cost estimate only)
PRICE = {"T4": 0.59, "L4": 0.80, "A10": 1.10, "L40S": 1.95, "A100-40GB": 2.10, "A100-80GB": 2.50,
         "RTX-PRO-6000": 3.03, "H100": 3.95, "H200": 4.54}
ARMS = ("base", "control", "grpo", "sft")
MAX_NEW = 128
# Optional answer prefill (--prefill "<observe>["), set per job by `_job`: the text is appended to
# the rendered prompt as the start of the model's turn, in training and evaluation alike, and
# put back in front of the completion before scoring. It forces an answer-only reply; without
# it the larger models write reasoning first (the system prompt asks for it) and run out of tokens.
PREFILL = ""


def run_dir(tag: str, model: str, arm: str) -> Path:
    return Path("/vol/runs") / tag / model / arm


def _rows(name: str) -> list[dict]:
    return [json.loads(l) for l in open(f"/vol/rows/{name}.jsonl", encoding="utf-8")]


# ---- model, prompt rendering, generation (shared by training and evaluation) --------

def load(model: str):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    hf_id = MODELS[model][0]
    tok = AutoTokenizer.from_pretrained(hf_id)
    tok.padding_side = "left"
    if tok.pad_token_id is None:
        tok.pad_token = tok.eos_token
    m = AutoModelForCausalLM.from_pretrained(hf_id, dtype=torch.bfloat16, device_map={"": 0})
    m.eval()
    hf_cache.commit()
    return tok, m


def template_kwargs(tok) -> dict:
    """Thinking off, if the chat template has the switch."""
    return {"enable_thinking": False} if "enable_thinking" in (tok.chat_template or "") else {}


def render(tok, messages: list[dict]) -> str:
    """THE prompt rendering: used for every training sample and every evaluation row."""
    return tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True,
                                   **template_kwargs(tok)) + PREFILL


def encode(tok, texts: list[str]):
    # the rendered text already carries <bos>; do not let the tokenizer add another
    return tok(texts, return_tensors="pt", padding=True, add_special_tokens=False).to("cuda")


def eos_ids(tok, m) -> list[int]:
    e = m.generation_config.eos_token_id
    ids = set(e if isinstance(e, list) else [e]) | {tok.eos_token_id}
    return sorted(i for i in ids if i is not None)


def evaluate_rows(tok, m, model: str, rows: list[dict], extra: dict, max_new: int = MAX_NEW) -> tuple[list[dict], dict]:
    """Batched greedy generation over `rows`; per-row results in input order."""
    import torch

    from bayesenv.curve import result_row, summarise

    bs = MODELS[model][4]
    texts = [render(tok, r["prompt"]) for r in rows]
    order = sorted(range(len(rows)), key=lambda i: -len(texts[i]))
    out: list = [None] * len(rows)
    torch.cuda.reset_peak_memory_stats()
    t0, n_tok = time.time(), 0
    for b in range(0, len(order), bs):
        idx = order[b:b + bs]
        enc = encode(tok, [texts[i] for i in idx])
        with torch.inference_mode():
            gen = m.generate(**enc, max_new_tokens=max_new, do_sample=False, pad_token_id=tok.pad_token_id)
        new = gen[:, enc["input_ids"].shape[1]:]
        for i, g in zip(idx, new):
            k = int((g != tok.pad_token_id).sum())
            n_tok += k
            out[i] = result_row(rows[i], PREFILL + tok.decode(g, skip_special_tokens=True).strip(),
                                new_tokens=k, prompt_tokens=int(enc["attention_mask"][idx.index(i)].sum()))
    secs = time.time() - t0
    summary = {**extra, "model": model, "hf_id": MODELS[model][0], "gpu": MODELS[model][2],
               "eval_seconds": round(secs, 1), "eval_rows_per_second": round(len(rows) / secs, 2),
               "eval_new_tokens_mean": round(n_tok / len(rows), 1),
               "eval_peak_gpu_gb": round(torch.cuda.max_memory_allocated() / 2**30, 2),
               "eval_truncated": round(sum(r["new_tokens"] >= max_new for r in out) / len(out), 4),
               "template_kwargs": template_kwargs(tok), "max_new_tokens": max_new, "prefill": PREFILL,
               "splits": summarise(out)}
    return out, summary


def write_eval(d: Path, results: list[dict], summary: dict) -> None:
    d.mkdir(parents=True, exist_ok=True)
    with open(d / "eval_rows.jsonl", "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r) + "\n")
    (d / "eval_summary.json").write_text(json.dumps(summary, indent=1))
    vol.commit()


def eval_set(n_eval: int, extra_eval: str = "") -> list[dict]:
    """The two held-out samples plus any extra files, "name=file.jsonl,...": all their rows. A
    path that does not start with / is relative to the Volume root (/vol); prefer that form,
    because Git Bash on Windows rewrites arguments that look like absolute paths."""
    from bayesenv.curve import load_extra

    extra_eval = ",".join(p if p.split("=", 1)[1].startswith("/") else p.replace("=", "=/vol/", 1)
                          for p in extra_eval.split(",") if p)

    return [r for s in ("heldout_instance", "heldout_family") for r in _rows(f"eval_{s}")[:n_eval]] + \
        load_extra(extra_eval)


def versions() -> dict:
    import peft
    import torch
    import transformers

    return {"torch": str(torch.__version__), "transformers": transformers.__version__, "peft": peft.__version__,
            "gpu_name": torch.cuda.get_device_name(0),
            "gpu_total_gb": round(torch.cuda.get_device_properties(0).total_memory / 2**30, 1)}


# ---- evaluate ------------------------------------------------------------------------

def evaluate(model: str, arm: str, tag: str = "full", n_eval: int = 500, adapter: str = "adapter",
             out_arm: str = "", max_new: int = MAX_NEW, extra_eval: str = "") -> dict:
    """Base model, plus the arm's adapter from the Volume (PEFT, not merged) unless arm == base."""
    t0 = time.time()
    tok, m = load(model)
    if arm != "base":
        from peft import PeftModel

        m = PeftModel.from_pretrained(m, str(run_dir(tag, model, arm) / adapter))
        m.eval()
    results, summary = evaluate_rows(tok, m, model, eval_set(n_eval, extra_eval),
                                     {"arm": arm, "tag": tag, "adapter": "" if arm == "base" else adapter,
                                      "loaded_from": "base" if arm == "base" else "volume", **versions()}, max_new)
    summary["load_seconds"] = round(time.time() - t0 - summary["eval_seconds"], 1)
    summary["gpu_seconds"] = round(time.time() - t0, 1)
    write_eval(run_dir(tag, model, out_arm or arm), results, summary)
    return summary


# ---- train ---------------------------------------------------------------------------

def _tail_logits(m, ids, att, start: int):
    """Logits that predict tokens start..end, i.e. positions start-1..end-1. The vocabulary has
    262k entries, so the full-sequence logits the model's own forward builds (8 x 1000 x 262k,
    several copies kept for backward) do not fit; the output head is applied to the completion
    positions only. `check_tail_logits` verifies this against the model's forward."""
    import torch

    inner = m.get_base_model() if hasattr(m, "get_base_model") else m
    h = inner.model(input_ids=ids, attention_mask=att, use_cache=False).last_hidden_state[:, start - 1:-1]
    logits = inner.lm_head(h)
    cfg = inner.config
    cap = getattr(cfg, "final_logit_softcapping", None) or         getattr(getattr(cfg, "text_config", None), "final_logit_softcapping", None)
    if cap:
        logits = torch.tanh(logits / cap) * cap
    return logits.float()


def check_tail_logits(tok, m, text: str) -> float:
    import torch

    enc = encode(tok, [text])
    ids, att = enc["input_ids"][:, :48], enc["attention_mask"][:, :48]
    with torch.no_grad():
        full = m(input_ids=ids, attention_mask=att).logits[:, 39:-1].float()
        mine = _tail_logits(m, ids, att, 40)
    lf, lm = torch.log_softmax(full, -1), torch.log_softmax(mine, -1)
    # compared on the tokens that matter (the forward's 20 most likely per position): over the
    # whole 262k vocabulary bf16 rounding alone moves far-tail log-probabilities by ~0.1
    top = lf.topk(20, -1).indices
    diff = float((lf.gather(-1, top) - lm.gather(-1, top)).abs().max())
    assert diff < 0.05, f"output-head shortcut disagrees with the model forward: {diff}"
    return diff


def _logp(m, prompt_ids, comp, mask):
    """Mean token log-probability of each completion row given the (shared) prompt."""
    import torch

    n, p = comp.shape[0], prompt_ids.shape[1]
    ids = torch.cat([prompt_ids.expand(n, -1), comp], 1)
    att = torch.cat([torch.ones(n, p, dtype=mask.dtype, device=mask.device), mask], 1)
    lp = torch.log_softmax(_tail_logits(m, ids, att, p), -1).gather(-1, comp.unsqueeze(-1)).squeeze(-1)
    return (lp * mask).sum(1) / mask.sum(1).clamp(min=1)


def train(model: str, arm: str, steps: int = 300, seed: int = 0, tag: str = "full", n_eval: int = 500,
          num_generations: int = 8, prompts_per_step: int = 2, lr: float = 0.0, sft_batch: int = 8,
          max_new: int = MAX_NEW, extra_eval: str = "") -> dict:
    import numpy as np
    import torch
    from peft import LoraConfig, get_peft_model

    from bayesenv.curve import demo_completion, design_choice, row_id
    from bayesenv.datagen import design_reward

    assert arm in ("grpo", "control", "sft")
    t_start = time.time()
    d = run_dir(tag, model, arm)
    d.mkdir(parents=True, exist_ok=True)
    tok, base = load(model)
    sft = arm == "sft"
    lr = lr or (1e-4 if sft else 5e-6)  # train/sft_lora.py and train/grpo_predict.py
    # As in the TRL recipe. Without it the activations kept for backward are roughly 10 MB per
    # token (8 x 900 tokens ran out of memory on 48 GB even for E2B). Only active in train mode.
    base.gradient_checkpointing_enable()
    m = get_peft_model(base, LoraConfig(r=32, lora_alpha=64, lora_dropout=0.05 if sft else 0.0,
                                        target_modules="all-linear", task_type="CAUSAL_LM"))
    params = [p for p in m.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=lr, weight_decay=0.0)
    rows = _rows("design_train")
    np.random.default_rng(seed).shuffle(rows)  # same order for grpo and control at a given seed
    per_step = sft_batch if sft else prompts_per_step
    if sft and steps <= 0:
        steps = len(rows) // sft_batch  # one epoch
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: max(0.0, 1 - s / steps))
    torch.manual_seed(seed)
    eos, chunk = eos_ids(tok, m), MODELS[model][5]
    cfg = {"model": model, "arm": arm, "prefill": PREFILL, "steps": steps, "seed": seed, "lr": lr, "per_step": per_step,
           "num_generations": None if sft else num_generations, "train_rows": len(rows),
           "trainable_params": sum(p.numel() for p in params), "grad_chunk": chunk, "max_new_tokens": max_new}
    cfg["tail_logits_max_diff"] = round(check_tail_logits(tok, m, render(tok, rows[0]["prompt"])), 5)
    print(cfg, flush=True)
    log = open(d / "train_log.jsonl", "w", encoding="utf-8")
    samples = open(d / "samples.jsonl", "w", encoding="utf-8")
    torch.cuda.reset_peak_memory_stats()
    step_secs = []
    for step in range(steps):
        t0 = time.time()
        batch = [rows[(step * per_step + j) % len(rows)] for j in range(per_step)]
        rec = {"step": step + 1, "lr": sched.get_last_lr()[0]}
        opt.zero_grad(set_to_none=True)
        if sft:
            m.train()
            texts = [render(tok, r["prompt"]) for r in batch]
            fulls = [tok.apply_chat_template(r["prompt"] + [{"role": "assistant", "content": demo_completion(r)}],
                                             tokenize=False, **template_kwargs(tok)) for r in batch]
            assert all(f.startswith(t) for f, t in zip(fulls, texts)), "chat template: prompt is not a prefix"
            tok.padding_side = "right"
            enc = encode(tok, fulls)
            tok.padding_side = "left"
            plen = [len(tok(t, add_special_tokens=False)["input_ids"]) for t in texts]
            labels = enc["input_ids"].clone()
            labels[enc["attention_mask"] == 0] = -100
            for i, k in enumerate(plen):
                labels[i, :k] = -100
            start = min(plen)
            lg = _tail_logits(m, enc["input_ids"], enc["attention_mask"], start)
            loss = torch.nn.functional.cross_entropy(lg.reshape(-1, lg.shape[-1]), labels[:, start:].reshape(-1),
                                                     ignore_index=-100)
            loss.backward()
            rec.update(loss=float(loss.detach()), tokens=int((labels != -100).sum()))
        else:
            m.eval()
            R, V, T, distinct, distinct_choice, loss_sum, signal = [], [], 0, [], [], 0.0, 0
            t_gen = t_grad = 0.0
            for j, r in enumerate(batch):
                t1 = time.time()
                enc = encode(tok, [render(tok, r["prompt"])])
                with torch.no_grad():
                    gen = m.generate(**enc, max_new_tokens=max_new, do_sample=True, temperature=1.0,
                                     top_k=0, top_p=1.0, num_return_sequences=num_generations,
                                     pad_token_id=tok.pad_token_id)
                comp = gen[:, enc["input_ids"].shape[1]:]
                # tokens up to and including the first end-of-sequence token
                is_eos = torch.isin(comp, torch.tensor(eos, device=comp.device))
                mask = ((is_eos.cumsum(1) - is_eos.long()) == 0).long()
                texts = [PREFILL + tok.decode(c[k.bool()], skip_special_tokens=True).strip() for c, k in zip(comp, mask)]
                choice = [design_choice(r, t) for t in texts]
                true_r = [design_reward(r, t) for t in texts]
                valid = [float(c is not None) for c in choice]
                rew = torch.tensor(valid if arm == "control" else true_r, device=comp.device)
                adv = (rew - rew.mean()) / (rew.std(unbiased=False) + 1e-4)
                R += true_r
                V += valid
                T += int(mask.sum())
                distinct.append(len(set(texts)))
                distinct_choice.append(len(set(choice)))
                t_gen += time.time() - t1
                if step < 5 or (step + 1) % 25 == 0:
                    samples.write(json.dumps({"step": step + 1, "id": row_id(r), "completions": [t[:300] for t in texts],
                                              "choice": [-1 if c is None else c for c in choice],
                                              "reward": [round(x, 4) for x in rew.tolist()]}) + "\n")
                t1 = time.time()
                if float(adv.abs().max()) > 0:  # all rewards equal -> zero gradient, skip the pass
                    signal += 1
                    m.train()  # switches gradient checkpointing on; LoRA dropout is 0 in these arms
                    ch = max(1, min(chunk, chunk * 160 // comp.shape[1]))  # long completions: fewer per pass
                    for s in range(0, num_generations, ch):
                        lp = _logp(m, enc["input_ids"], comp[s:s + ch], mask[s:s + ch])
                        loss = -(adv[s:s + ch] * lp).sum() / (num_generations * per_step)
                        loss.backward()
                        loss_sum += float(loss.detach())
                    m.eval()
                t_grad += time.time() - t1
            n = len(R)
            rec.update(reward=round(sum(R) / n, 4), valid=round(sum(V) / n, 4), tokens=T,
                       tokens_mean=round(T / n, 1), distinct_completions=round(sum(distinct) / len(distinct), 2),
                       distinct_choices=round(sum(distinct_choice) / len(distinct_choice), 2),
                       prompts_with_signal=signal, loss=round(loss_sum, 5),
                       gen_seconds=round(t_gen, 2), grad_seconds=round(t_grad, 2))
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        opt.step()
        sched.step()
        rec["seconds"] = round(time.time() - t0, 2)
        rec["peak_gpu_gb"] = round(torch.cuda.max_memory_allocated() / 2**30, 2)
        step_secs.append(rec["seconds"])
        log.write(json.dumps(rec) + "\n")
        if step < 3 or (step + 1) % 10 == 0:
            print(rec, flush=True)
        if (step + 1) % 50 == 0 and step + 1 < steps:
            m.save_pretrained(str(d / f"ckpt-{step + 1}"))
            log.flush()
            samples.flush()
            vol.commit()
    log.close()
    samples.close()
    m.save_pretrained(str(d / "adapter"))
    train_peak = round(torch.cuda.max_memory_allocated() / 2**30, 2)
    vol.commit()
    m.eval()
    recs = [json.loads(l) for l in open(d / "train_log.jsonl")]
    mean = lambda k: round(sum(r[k] for r in recs) / len(recs), 4) if recs and k in recs[0] else None
    extra = {**cfg, "tag": tag, "adapter": "adapter", "loaded_from": "in-process", **versions(),
             "train_seconds": round(time.time() - t_start, 1),
             "seconds_per_step": round(sum(step_secs) / max(len(step_secs), 1), 2),
             "tokens_per_step": mean("tokens"), "train_peak_gpu_gb": train_peak,
             "train_reward_mean": mean("reward"), "train_valid_mean": mean("valid"),
             "distinct_completions_of_8": mean("distinct_completions"),
             "distinct_choices_of_8": mean("distinct_choices"),
             "prompts_with_signal_per_step": mean("prompts_with_signal")}
    (d / "train_summary.json").write_text(json.dumps(extra, indent=1))  # survives a later --eval-only
    results, summary = evaluate_rows(tok, m, model, eval_set(n_eval, extra_eval), extra, max_new)
    summary["gpu_seconds"] = round(time.time() - t_start, 1)
    write_eval(d, results, summary)
    return summary


# ---- Modal functions: one per GPU type ------------------------------------------------

def _job(spec: dict) -> dict:
    global PREFILL
    spec = dict(spec)
    kind = spec.pop("kind")
    PREFILL = spec.pop("prefill", "")
    try:
        return (train if kind == "train" else evaluate)(**spec)
    except Exception as e:  # report, do not take the fan-out down
        import traceback

        traceback.print_exc()
        return {"error": f"{type(e).__name__}: {e}"[:600], **spec}


KW = dict(image=image, volumes=VOLS, cpu=4.0, memory=49152)


@app.function(gpu="A10", timeout=4 * 3600, **KW)
def job_a10(spec: dict) -> dict:
    return _job(spec)


@app.function(gpu="L40S", timeout=6 * 3600, **KW)
def job_l40s(spec: dict) -> dict:
    return _job(spec)


@app.function(gpu="A100-80GB", timeout=8 * 3600, **KW)
def job_a100_80(spec: dict) -> dict:
    return _job(spec)


@app.function(gpu="RTX-PRO-6000", timeout=8 * 3600, **{**KW, "memory": 98304})
def job_rtxpro(spec: dict) -> dict:
    return _job(spec)


@app.function(gpu="H200", timeout=8 * 3600, **{**KW, "memory": 98304})
def job_h200(spec: dict) -> dict:
    return _job(spec)


BY_GPU = {"A10": job_a10, "L40S": job_l40s, "A100-80GB": job_a100_80, "RTX-PRO-6000": job_rtxpro,
          "H200": job_h200}


def _spec(model: str, arm: str, steps: int, seed: int, tag: str, n_eval: int, prompts_per_step: int,
          lr: float, max_new: int, extra_eval: str = "", eval_only: bool = False, prefill: str = "") -> dict:
    assert model in MODELS and arm in ARMS, (model, arm)
    if arm == "base" or eval_only:  # eval_only: the arm's adapter is loaded from the Volume
        return {"kind": "evaluate", "model": model, "arm": arm, "tag": tag, "n_eval": n_eval, "max_new": max_new,
                "extra_eval": extra_eval, "prefill": prefill}
    return {"kind": "train", "model": model, "arm": arm, "steps": 0 if arm == "sft" and steps == 300 else steps,
            "seed": seed, "tag": tag, "n_eval": n_eval, "prompts_per_step": prompts_per_step, "lr": lr,
            "max_new": max_new, "extra_eval": extra_eval, "prefill": prefill}


def _show(s: dict) -> None:
    if "error" in s:
        print("FAILED", s)
        return
    cost = s["gpu_seconds"] / 3600 * PRICE[s["gpu"]]
    keys = ("seconds_per_step", "tokens_per_step", "train_peak_gpu_gb", "eval_peak_gpu_gb", "train_reward_mean",
            "train_valid_mean", "distinct_completions_of_8", "distinct_choices_of_8",
            "prompts_with_signal_per_step", "eval_rows_per_second", "eval_new_tokens_mean", "eval_truncated",
            "max_new_tokens", "prefill", "template_kwargs",
            "torch", "transformers", "peft", "gpu_name", "gpu_total_gb")
    print(f"== {s['model']} {s['arm']} on {s['gpu']}: {s['gpu_seconds']:.0f} GPU-s, about ${cost:.2f}")
    print("  ", {k: s[k] for k in keys if s.get(k) is not None})
    for split, v in s["splits"].items():
        print(f"   {split:17s} n={v['n']:3d} reward={v['reward']:.3f} chance={v['chance']:.3f} "
              f"valid={v['valid']:.3f} best_pick={v['best_pick']:.3f}" +
              (f" value_reward={v['value_reward']:.3f} value_chance={v['value_chance']:.3f}" if "value_n" in v else ""))


@app.local_entrypoint()
def upload(rows: str = "data/v1/rows.jsonl"):
    """Filter the generated rows to the design rows this experiment uses and put them on the Volume."""
    import io
    import sys

    sys.path.insert(0, str(ROOT))
    from bayesenv.curve import EVAL_SPLITS, eval_sample, train_rows

    allrows = [r for r in map(json.loads, open(rows, encoding="utf-8")) if r["kind"] == "design"]
    files = {"design_train": train_rows(allrows), **{f"eval_{s}": eval_sample(allrows, s) for s in EVAL_SPLITS}}
    with vol.batch_upload(force=True) as b:
        for name, rs in files.items():
            b.put_file(io.BytesIO("".join(json.dumps(r) + "\n" for r in rs).encode()), f"rows/{name}.jsonl")
            print(name, len(rs), "rows;", len({r["env"] for r in rs}), "task instances;",
                  sorted({r["spec"] for r in rs}))


@app.local_entrypoint()
def one(model: str, arm: str, steps: int = 300, seed: int = 0, tag: str = "full", n_eval: int = 500,
        prompts_per_step: int = 2, lr: float = 0.0, reload: bool = False, gpu: str = "", max_new: int = MAX_NEW,
        extra_eval: str = "", eval_only: bool = False, prefill: str = ""):
    """One (model, arm). --reload: evaluate an already trained arm by loading its adapter from the
    Volume (written to <arm>_reload/, to check it against the in-process evaluation)."""
    fn = BY_GPU[gpu or MODELS[model][2]]
    if reload:
        _show(fn.remote({"kind": "evaluate", "model": model, "arm": arm, "tag": tag, "n_eval": n_eval,
                         "out_arm": f"{arm}_reload", "max_new": max_new, "extra_eval": extra_eval, "prefill": prefill}))
    else:
        _show(fn.remote(_spec(model, arm, steps, seed, tag, n_eval, prompts_per_step, lr, max_new, extra_eval, eval_only,
                              prefill)))


@app.local_entrypoint()
def fanout(models: str = "E2B,E4B,12B,26B-A4B,31B", arms: str = "base,control,grpo", pairs: str = "",
           skip: str = "31B:control,31B:grpo", steps: int = 300, seed: int = 0, tag: str = "full",
           n_eval: int = 500, prompts_per_step: int = 2, lr: float = 0.0, max_new: int = MAX_NEW,
           extra_eval: str = "", eval_only: bool = False, prefill: str = ""):
    """Every (model, arm) in its own container on that model's GPU. --pairs "E2B:grpo,12B:base"
    overrides models x arms; --skip removes pairs (default: 31B is evaluation-only).
    --extra-eval "lab_transfer=lab_rows.jsonl" also evaluates every row of that file (a JSONL
    of design rows at that path on the Volume `bayesenv-curve`) under the named split.
    --eval-only re-evaluates already trained arms from their saved adapters instead of training
    (it rewrites eval_rows.jsonl with the held-out splits plus the extra files)."""
    todo = [tuple(p.split(":")) for p in pairs.split(",") if p] or \
           [(m, a) for m in models.split(",") for a in arms.split(",")]
    todo = [p for p in todo if ":".join(p) not in skip.split(",")]
    calls = [(m, a, BY_GPU[MODELS[m][2]].spawn(_spec(m, a, steps, seed, tag, n_eval, prompts_per_step, lr, max_new, extra_eval, eval_only,
                                                     prefill)))
             for m, a in todo]
    print(f"spawned {len(calls)} jobs:", ", ".join(f"{m}:{a}" for m, a, _ in calls), flush=True)
    total = 0.0
    for m, a, c in calls:
        s = c.get()
        _show(s)
        total += s.get("gpu_seconds", 0) / 3600 * PRICE[MODELS[m][2]]
    print(f"total about ${total:.2f} of GPU time (list prices, excludes container start-up)")
