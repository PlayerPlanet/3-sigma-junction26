"""Base vs trained (same prompts, same seeds, greedy) on the transfer suite.
usage: python run_gpu.py ADAPTER OUTDIR cond[,cond...]
conds: diag_free diag_priced diag_random credit bship bank_diag bank_credit bs_rows smoke"""
import json, os, sys, time
from pathlib import Path
import numpy as np
import torch
import train as TR
import tasks as X
import suite as S

MAXNEW = dict(diag_free=16, diag_priced=16, diag_random=12, credit=10, bship=12, bank_diag=16, bank_credit=10,
              bs_rows=128)
BS = dict(diag_free=12, diag_priced=12, diag_random=16, credit=32, bship=24, bank_diag=12, bank_credit=32, bs_rows=6)


def make_gen(tok, m, kw, bs):
    def gen(msgs_list, max_new):
        texts = [TR.render(tok, kw, ms) for ms in msgs_list]
        order = sorted(range(len(texts)), key=lambda i: -len(texts[i]))
        out = [None] * len(texts)
        for s in range(0, len(order), bs):
            ch = order[s:s + bs]
            enc = TR.encode(tok, [texts[i] for i in ch])
            with torch.inference_mode():
                g = m.generate(**enc, max_new_tokens=max_new, do_sample=False, pad_token_id=tok.pad_token_id)
            for k, i in enumerate(ch):
                out[i] = tok.decode(g[k, enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        return out
    return gen


def run_cond(cond, gen, log):
    t0 = time.time()
    mx = MAXNEW[cond]
    if cond in ("bank_diag", "bank_credit"):
        bank = S.diag_bank() if cond == "bank_diag" else S.credit_bank()
        raws = []

        def choose(L):
            outs = gen([b.prompt() for b in L], mx)
            raws.extend(outs)
            return [b.ep.parse(o) for b, o in zip(L, outs)]
        recs = S.bank_eval(bank, choose)
        return dict(records=recs, raw_sample=raws[:60], raw_counts=_counts(raws), seconds=round(time.time() - t0))
    if cond == "bs_rows":
        from bayesenv import battleship_rows as R
        rows = [json.loads(l) for l in open("data_bs_rows.jsonl")]
        outs = gen([r["prompt"] for r in rows], mx)
        recs = []
        for r, o in zip(rows, outs):
            rew = R.design_reward(r, o)
            m = R.OBS_RE.findall(R.THINK_RE.sub("", o))
            valid = False
            chosen = None
            if m:
                try:
                    x = [int(float(v)) for v in json.loads(m[-1])]
                    valid = x in r["candidates"]
                    chosen = x
                except Exception:
                    pass
            recs.append(dict(depth=r["depth"], source=r["source"], reward=rew, valid=valid,
                             chosen_scan=bool(chosen and chosen[0] == 1),
                             best_scan=bool(r["candidates"][int(np.argmax(r["eig"]))][0] == 1)))
        return dict(records=recs, raw_sample=outs[:60], raw_counts=_counts(outs), seconds=round(time.time() - t0))
    eps = S.episodes(cond)
    raws = X.run_model_episodes(eps, gen, mx, log=None)
    return dict(episodes=S.summarise(cond, eps), raw_sample=raws[:80], raw_counts=_counts(raws),
                seconds=round(time.time() - t0))


def _counts(raws):
    c = {}
    for r in raws:
        k = r[:40]
        c[k] = c.get(k, 0) + 1
    return dict(sorted(c.items(), key=lambda kv: -kv[1])[:40])


def main():
    adapter, outdir, conds = sys.argv[1], Path(sys.argv[2]), sys.argv[3].split(",")
    outdir.mkdir(parents=True, exist_ok=True)
    t = time.time()
    tok, m, kw = TR.load(adapter)
    m.eval()
    print("loaded", round(time.time() - t), "s", flush=True)
    for cond in conds:
        res = {}
        for arm in ("base", "trained"):
            ctx = m.disable_adapter() if arm == "base" else torch.no_grad()
            with ctx:
                gen = make_gen(tok, m, kw, BS[cond])
                res[arm] = run_cond(cond, gen, print)
            print(cond, arm, "done", res[arm]["seconds"], "s", list(res[arm]["raw_counts"].items())[:8], flush=True)
            json.dump(res, open(outdir / f"{cond}.json", "w"), default=float)
    print("ALL DONE", round(time.time() - t), "s", flush=True)


if __name__ == "__main__":
    main()
