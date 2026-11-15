import sys, json, time, torch, numpy as np
import train as TR, tasks as X, suite as S, run_gpu as G
tok, m, kw = TR.load(sys.argv[1]); m.eval()
P = {}
P["diag_free"] = [e.prompt() for e in S.diag_episodes("diag_free")[:6]]
P["diag_random"] = [e.prompt() for e in S.diag_episodes("diag_random")[:24:4]]
P["bship"] = [e.prompt() for e in S.bs_episodes()[:6]]
b = S.diag_bank()
P["bank_diag"] = [x.prompt() for x in b[::40]]
rows = [json.loads(l) for l in open("data_bs_rows.jsonl")][:6]
P["bs_rows"] = [r["prompt"] for r in rows]
print("tokens", {k: len(tok(TR.render(tok, kw, v[0]))["input_ids"]) for k, v in P.items()}, flush=True)
for arm in ("base", "trained"):
    ctx = m.disable_adapter() if arm == "base" else torch.no_grad()
    with ctx:
        gen = G.make_gen(tok, m, kw, 8)
        for k, v in P.items():
            t = time.time()
            print(arm, k, gen(v, 128 if k == "bs_rows" else 16), round(time.time() - t, 1), "s", flush=True)
