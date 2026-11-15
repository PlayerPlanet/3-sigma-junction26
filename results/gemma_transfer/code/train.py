"""GRPO (beta=0, group-normalised advantages, LoRA r32/a64 on the language model) for Gemma 4 E2B in fp16 on
one V100, on the v2 black-box credit environment's decision + calibration prompts (benv.py, prep.py).
Port of gemma-myopia/credit_rl/capp.py (Modal) to plain Python, with:
  - online variance filtering: a prompt whose sampled group has zero reward variance is dropped from the pool
    for good (solved or hopeless); only groups with variance train (DAPO dynamic sampling);
  - calibration prompts mixed in once states/calib.jsonl exists;
  - checkpoint (adapter + logs) every 25 steps; resume from the last checkpoint.
usage: python train.py smoke | train STEPS [LR]
"""
import json, math, os, random, sys, time
from pathlib import Path

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
import numpy as np
import torch
import benv

HF = "google/gemma-4-E2B-it"
RUN = Path("run")
MAX_NEW = 10
TARGETS = r".*language_model.*\.(q_proj|k_proj|v_proj|o_proj|gate_proj|up_proj|down_proj)$"


class CPUEmb(torch.nn.Module):
    """wraps an embedding kept on the CPU (not a registered submodule, so .to()/PEFT never move it)"""

    def __init__(self, emb):
        super().__init__()
        emb.to("cpu")
        self.__dict__["inner"] = emb
        self.weight_dtype = emb.weight.dtype

    def forward(self, ids):
        with torch.no_grad():
            return self.inner(ids.cpu()).to(ids.device, non_blocking=True)


def load(adapter=None, train=False):
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(HF)
    tok.padding_side = "left"
    if tok.pad_token_id is None:
        tok.pad_token = tok.eos_token
    m = AutoModelForCausalLM.from_pretrained(HF, dtype=torch.float16, device_map={"": 0}, low_cpu_mem_usage=True,
                                             attn_implementation=os.environ.get("ATTN", "eager"))
    # V100 16 GB: text-only use, so drop the vision/audio towers, and keep the 2.35B-parameter per-layer
    # embedding table (a pure lookup) on the CPU.
    inner = m.model
    for n in ("vision_tower", "audio_tower", "embed_vision", "embed_audio"):
        if hasattr(inner, n):
            setattr(inner, n, None)
    lm = inner.language_model
    lm.embed_tokens_per_layer = CPUEmb(lm.embed_tokens_per_layer)
    torch.cuda.empty_cache()
    kw ={"enable_thinking": False} if "enable_thinking" in (tok.chat_template or "") else {}
    if adapter:
        from peft import PeftModel
        m = PeftModel.from_pretrained(m, adapter, is_trainable=train)
    return tok, m, kw


def render(tok, kw, msgs):
    return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, **kw)


def encode(tok, texts):
    return tok(texts, return_tensors="pt", padding=True, add_special_tokens=False).to("cuda")


def tail_logits(m, ids, att, start):
    inner = m.get_base_model() if hasattr(m, "get_base_model") else m
    h = inner.model(input_ids=ids, attention_mask=att, use_cache=False).last_hidden_state[:, start - 1:-1]
    logits = inner.lm_head(h).float()
    cfg = inner.config
    cap = getattr(cfg, "final_logit_softcapping", None) or getattr(getattr(cfg, "text_config", None),
                                                                   "final_logit_softcapping", None)
    if cap:
        logits = torch.tanh(logits / cap) * cap
    return logits


def logp(m, prompt_ids, comp, mask, temperature):
    n, p = comp.shape[0], prompt_ids.shape[1]
    ids = torch.cat([prompt_ids.expand(n, -1), comp], 1)
    att = torch.cat([torch.ones(n, p, dtype=mask.dtype, device=mask.device), mask], 1)
    lp = torch.log_softmax(tail_logits(m, ids, att, p) / temperature, -1).gather(-1, comp.unsqueeze(-1)).squeeze(-1)
    return (lp * mask).sum(1) / mask.sum(1).clamp(min=1)


def greedy(tok, m, kw, msgs_list, bs=24):
    texts = [render(tok, kw, ms) for ms in msgs_list]
    order = sorted(range(len(texts)), key=lambda i: -len(texts[i]))
    out = [None] * len(texts)
    for s in range(0, len(order), bs):
        ch = order[s:s + bs]
        enc = encode(tok, [texts[i] for i in ch])
        with torch.inference_mode():
            g = m.generate(**enc, max_new_tokens=MAX_NEW, do_sample=False, pad_token_id=tok.pad_token_id)
        for k, i in enumerate(ch):
            out[i] = tok.decode(g[k, enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()
    return out


def row_reward(r, text):
    a = benv.parse(text, r["allowed"])
    if r["kind"] == "cal":
        if a is None:
            return -0.5, a
        mean = {int(k): v for k, v in r["mean"].items()}
        lo, hi = min(mean.values()), max(mean.values())
        return (mean[int(a.split("_")[1])] - lo) / max(hi - lo, 1e-9), a
    ai = None if a is None else benv.ACTIONS.index(a)
    return benv.step_reward(r["Q"], r["V"], ai), a


def load_rows(name):
    p = Path(f"states/{name}.jsonl")
    rows = [json.loads(l) for l in open(p)] if p.exists() else []
    for r in rows:
        r["prompt"][1]["content"] = benv.compact(r["prompt"][1]["content"])
    return rows


def state_eval(tok, m, kw, rows):
    outs = greedy(tok, m, kw, [r["prompt"] for r in rows])
    R, opt, val, adv, early, n_cont, mix = [], [], [], [], 0, 0, {}
    for r, o in zip(rows, outs):
        rew, a = row_reward(r, o)
        R.append(rew); val.append(a is not None); mix[a] = mix.get(a, 0) + 1
        ai = None if a is None else benv.ACTIONS.index(a)
        adv.append(r["V"] - (r["Q"][ai] if ai is not None else 0.0))
        opt.append(ai is not None and r["V"] - r["Q"][ai] <= 1e-6)
        if r["n"] < 8 and max(r["Q"][:3]) > max(r["Q"][3], 0) + 1e-6:
            n_cont += 1; early += ai is not None and ai >= 3
    return dict(reward=float(np.mean(R)), optimal=float(np.mean(opt)), valid=float(np.mean(val)),
                adv_lost_mean=float(np.mean(adv)), adv_lost_median=float(np.median(adv)),
                stop_when_dp_continues=early / max(1, n_cont), action_mix={str(k): v / len(rows) for k, v in mix.items()})


def smoke():
    t0 = time.time()
    tok, m, kw = load()
    print(type(m).__name__, "loaded", round(time.time() - t0), "s; GPU GB", torch.cuda.memory_allocated() / 1e9, flush=True)
    held = load_rows("heldout") or load_rows("train")
    print("rows", len(held))
    rows = held[:48]
    print("prompt tokens", len(tok(render(tok, kw, rows[0]["prompt"]))["input_ids"]))
    t = time.time()
    outs = greedy(tok, m, kw, [r["prompt"] for r in rows])
    print("greedy 48:", round(time.time() - t, 1), "s", outs[:12], flush=True)
    print(state_eval(tok, m, kw, rows))
    cal = load_rows("calib")
    if cal:
        print("calib greedy", greedy(tok, m, kw, [r["prompt"] for r in cal[:4]]))
    # sampling + backward timing
    from peft import LoraConfig, get_peft_model
    m.gradient_checkpointing_enable()
    pm = get_peft_model(m, LoraConfig(r=32, lora_alpha=64, lora_dropout=0.0, target_modules=TARGETS, task_type="CAUSAL_LM"))
    pm.print_trainable_parameters()
    texts = [render(tok, kw, r["prompt"]) for r in rows[:8]]
    t = time.time()
    enc = encode(tok, texts[:1])
    with torch.no_grad():
        g = pm.generate(**enc, max_new_tokens=MAX_NEW, do_sample=True, temperature=1.15, top_k=0, top_p=1.0,
                        num_return_sequences=8, pad_token_id=tok.pad_token_id)
    torch.cuda.synchronize(); print("sample 8x8:", round(time.time() - t, 1), "s", flush=True)
    comp = g[:8, enc["input_ids"].shape[1]:]
    print([tok.decode(c, skip_special_tokens=True) for c in comp])
    ids = encode(tok, [texts[0]])["input_ids"]
    t = time.time()
    pm.train()
    lp = logp(pm, ids, comp, torch.ones_like(comp), 1.15)
    (-lp.sum()).backward()
    torch.cuda.synchronize()
    print("logp", lp.detach().cpu().numpy(), "backward:", round(time.time() - t, 1), "s; peak GPU GB",
          torch.cuda.max_memory_allocated() / 1e9, flush=True)


def train(steps, lr=5e-6, prompts_per_step=8, num_gen=8, temperature=1.15, dyn_max_rounds=3, ckpt_every=25,
          n_curve=240, chunk=8, seed=0, cal_every=4, inject=2, min_std=0.1):
    from peft import LoraConfig, get_peft_model, PeftModel
    RUN.mkdir(exist_ok=True)
    t_start = time.time()
    ckpts = sorted(RUN.glob("ckpt-*"), key=lambda p: int(p.name.split("-")[1]))
    start = int(ckpts[-1].name.split("-")[1]) if ckpts else 0
    tok, base, kw = load()
    base.gradient_checkpointing_enable()
    if start:
        m = PeftModel.from_pretrained(base, str(ckpts[-1]), is_trainable=True)
        print("resumed from", ckpts[-1], flush=True)
    else:
        m = get_peft_model(base, LoraConfig(r=32, lora_alpha=64, lora_dropout=0.0, target_modules=TARGETS,
                                            task_type="CAUSAL_LM"))
    params = [p for p in m.parameters() if p.requires_grad]
    for p in params:
        p.data = p.data.float()
    opt = torch.optim.AdamW(params, lr=lr, weight_decay=0.0)
    if start and (ckpts[-1] / "opt.pt").exists():
        opt.load_state_dict(torch.load(ckpts[-1] / "opt.pt"))
    rows = load_rows("train")
    n_loaded = len(rows)
    random.Random(seed).shuffle(rows)
    dead_ids = set(json.load(open(RUN / "dead.json"))) if (RUN / "dead.json").exists() else set()
    pool = [i for i in range(len(rows)) if i not in dead_ids]
    held = load_rows("heldout")
    random.Random(1).shuffle(held)
    hs = [r for r in held if max(r["Q"][3], 0) >= r["V"] - 1e-6]
    hc = [r for r in held if max(r["Q"][3], 0) < r["V"] - 1e-6]
    held = hs[:n_curve // 2] + hc[:n_curve // 2]
    cal = load_rows("calib")
    rng = random.Random(seed + start)
    torch.manual_seed(seed + start)
    eos_cfg = m.generation_config.eos_token_id
    eos = sorted({i for i in (eos_cfg if isinstance(eos_cfg, list) else [eos_cfg]) + [tok.eos_token_id] if i is not None})
    cfg = dict(model=HF, dtype="fp16 base, fp32 LoRA", steps=steps, lr=lr, prompts_per_step=prompts_per_step,
               num_gen=num_gen, temperature=temperature, dyn_max_rounds=dyn_max_rounds, train_rows=len(rows),
               heldout_rows=len(held), reward="dec: 0.5exp(-adv/4)+0.5exp(-adv/40), adv=V_true-Q_true(a); cal: (V(n0)-min)/(max-min); invalid -0.5",
               lora="r32 a64 language-model linear", start=start, sampling="stratified 50% DP-stop / 35% DP-check n>0 / 15% n=0",
               inject=inject, min_std=min_std)
    (RUN / "config.json").write_text(json.dumps(cfg, indent=1))
    print(cfg, flush=True)
    log = open(RUN / "train_log.jsonl", "a")
    curve = open(RUN / "curve.jsonl", "a")

    def do_curve(step):
        m.eval()
        with torch.no_grad():
            c = state_eval(tok, m, kw, held)
            if cal:
                outs = greedy(tok, m, kw, [r["prompt"] for r in cal])
                c["calib_reward"] = float(np.mean([row_reward(r, o)[0] for r, o in zip(cal, outs)]))
                c["calib_choices"] = outs
        c["step"] = step
        curve.write(json.dumps(c) + "\n"); curve.flush()
        print("CURVE", {k: v for k, v in c.items() if k != "calib_choices"}, flush=True)

    if start == 0:
        do_curve(0)
    PHASE2 = int(os.environ.get("PHASE2_FROM", "100000"))

    def cls(r):
        if max(r["Q"][3], 0) >= r["V"] - 1e-6:
            return 3 if (r["Q"][3] > 0 and r["Q"][3] >= r["V"] - 1e-6) else 0   # DP approves (3) / declines (0)
        return 1 if r["n"] > 0 else 2     # DP checks (later state / first step)

    def strat_sample(pool_, k):
        by = {0: [], 1: [], 2: [], 3: []}
        for i in pool_:
            by[cls(rows[i])].append(i)
        if step < PHASE2:                 # phase 1: 50% DP-stop (approve+decline pooled) / 35% / 15%
            by[0] += by.pop(3); probs = [(0, 0.5), (1, 0.35), (2, 0.15)]
        else:                             # phase 2: approve-optimal states were 6% of rows and never learnt
            probs = [(3, 0.3), (0, 0.25), (1, 0.3), (2, 0.15)]
        out = []
        for _ in range(k):
            u, acc, c = rng.random(), 0.0, probs[-1][0]
            for cc_, p_ in probs:
                acc += p_
                if u < acc:
                    c = cc_; break
            if not by[c]:
                c = max(by, key=lambda z: len(by[z]))
            out.append(by[c].pop(rng.randrange(len(by[c]))))
        return out

    for step in range(start, steps):
        t0 = time.time()
        if step % ckpt_every == 0 and step > start:
            if not cal:
                cal = load_rows("calib")
            more = load_rows("train")
            if len(more) > n_loaded:
                new = more[n_loaded:]
                random.Random(seed + step).shuffle(new)
                pool += list(range(len(rows), len(rows) + len(new)))
                rows += new
                print("loaded", len(new), "more train rows", flush=True)
                n_loaded = len(more)
        groups, R1, sampled, zero, rounds, inj_total, zero_on = [], [], 0, 0, 0, 0, 0
        while len(groups) < prompts_per_step and rounds < dyn_max_rounds:
            rounds += 1
            rb = [rows[i] for i in strat_sample(pool, prompts_per_step)]
            idx_b = None
            if cal and step % cal_every == 0 and rounds == 1:
                rb[0] = rng.choice(cal)
            texts = [render(tok, kw, r["prompt"]) for r in rb]
            m.eval()
            for j, r in enumerate(rb):
                enc1 = encode(tok, [texts[j]])
                with torch.no_grad():
                    g1 = m.generate(**enc1, max_new_tokens=MAX_NEW, do_sample=True, temperature=temperature, top_k=0,
                                    top_p=1.0, num_return_sequences=num_gen, pad_token_id=tok.pad_token_id)
                comp = g1[:, enc1["input_ids"].shape[1]:]
                del g1
                is_eos = torch.isin(comp, torch.tensor(eos, device=comp.device))
                mask = ((is_eos.cumsum(1) - is_eos.long()) == 0).long()
                seqs = [c[k.bool()].tolist() for c, k in zip(comp, mask)]
                outs = [tok.decode(s_, skip_special_tokens=True).strip() for s_ in seqs]
                n_inj = 0
                if inject and r["kind"] == "dec" and r["n"] < 8:
                    # exploration: the base policy never samples a check here; replace up to `inject` samples
                    # with check actions (off-policy, advantage-weighted like the rest of the group)
                    have = sum(o.startswith("check_") for o in outs)
                    picks = rng.sample(benv.ACTIONS[:3], 3)[:max(0, inject - have)]
                    picks += [a_ for a_ in ("decline", "approve") if a_ not in outs]
                    for q_, a_ in enumerate(picks):
                        seqs[-1 - q_] = tok.encode(a_, add_special_tokens=False)
                        outs[-1 - q_] = a_
                        n_inj += 1
                inj_total += n_inj
                L = max(1, max(len(s_) for s_ in seqs))
                comp = torch.full((num_gen, L), tok.pad_token_id, dtype=torch.long, device="cuda")
                mask = torch.zeros((num_gen, L), dtype=torch.long, device="cuda")
                for q_, s_ in enumerate(seqs):
                    if s_:
                        comp[q_, :len(s_)] = torch.tensor(s_, device="cuda"); mask[q_, :len(s_)] = 1
                rew = [row_reward(r, o)[0] for o in outs]
                if rounds == 1 and r["kind"] == "dec":
                    R1 += rew[:num_gen - n_inj]
                zero_on += float(np.std(rew[:num_gen - n_inj])) <= 1e-6
                sampled += 1
                rt = torch.tensor(rew, device=comp.device)
                if float(rt.std(unbiased=False)) > 1e-6:
                    adv = (rt - rt.mean()) / max(float(rt.std(unbiased=False)), min_std)
                    groups.append((enc1["input_ids"], comp, mask, adv))
                else:
                    zero += 1
                    if r["kind"] == "dec":
                        r["_dead"] = True
                if step < 2 and j == 0 and rounds == 1:
                    print("SAMPLE", r["kind"], r.get("n"), outs, [round(x, 3) for x in rew], flush=True)
        # permanently drop zero-variance decision prompts from the pool
        pool = [i for i in pool if not rows[i].get("_dead")]
        groups = groups[:prompts_per_step]
        norm = num_gen * max(len(groups), 1)
        loss_sum = 0.0
        opt.zero_grad(set_to_none=True)
        m.train()
        for ids, comp, mask, adv in groups:
            for s in range(0, num_gen, chunk):
                lp = logp(m, ids, comp[s:s + chunk], mask[s:s + chunk], temperature)
                loss = -(adv[s:s + chunk] * lp).sum() / norm
                loss.backward()
                loss_sum += float(loss.detach())
        m.eval()
        gn = float(torch.nn.utils.clip_grad_norm_(params, 1.0))
        if groups and math.isfinite(gn):
            opt.step()
        rec = dict(step=step + 1, reward=round(float(np.mean(R1)), 4) if R1 else None, groups=len(groups),
                   sampled=sampled, rounds=rounds, injected=inj_total, no_signal=round(zero / sampled, 3), no_signal_onpolicy=round(zero_on / sampled, 3), pool=len(pool),
                   loss=round(loss_sum, 5), grad_norm=round(gn, 4), seconds=round(time.time() - t0, 2),
                   wall=round(time.time() - t_start))
        log.write(json.dumps(rec) + "\n"); log.flush()
        print(rec, flush=True)
        if (step + 1) % ckpt_every == 0 or step + 1 == steps:
            d = RUN / f"ckpt-{step + 1}"
            m.save_pretrained(str(d))
            torch.save(opt.state_dict(), d / "opt.pt")
            json.dump([i for i in range(len(rows)) if rows[i].get("_dead")] + list(dead_ids), open(RUN / "dead.json", "w"))
            do_curve(step + 1)
    m.save_pretrained(str(RUN / "adapter"))
    (RUN / "done.json").write_text(json.dumps(dict(steps=steps, seconds=round(time.time() - t_start))))


if __name__ == "__main__":
    if sys.argv[1] == "smoke":
        smoke()
    else:
        train(int(sys.argv[2]), lr=float(sys.argv[3]) if len(sys.argv) > 3 else 5e-6)
