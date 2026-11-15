"""Desk screening table + selection rule (transparent; every screened desk is listed).
Rule: reference reward SD <= 0.15, P(reference reward < 0.5) <= 0.05, and each of guess / naive / onestep has
expected normalised reward <= 0.8 (i.e. at least 0.2 below the reference's ~1). Selected = the first N passing
desks in numeric order. usage: python screen_table.py <modal json> [N] [rule e.g. Aboot:12]"""
import json, sys
import numpy as np

d = json.load(open(sys.argv[1]))
N = int(sys.argv[2]) if len(sys.argv) > 2 else 6
rule, n0 = (sys.argv[3] if len(sys.argv) > 3 else "Aboot:12").split(":"); n0 = int(n0)
meta, res = d["meta"], d["results"]
rows, sel = [], []
hdr = "| desk | true DP | ref mean | ref SD | ref reward SD | P(ref<0.5) | guess | naive | one-step | MLE | over | medfix | pass |"
print(hdr); print("|" + "---|" * (hdr.count("|") - 1))
for desk in sorted(meta, key=int):
    m = meta[desk]; nd = m["V_nodata"]
    v = np.array([r["value"] for r in res if str(r["desk"]) == desk and r["rule"] == rule and r["n0"] == n0])
    if not len(v):
        continue
    ref = v.mean(); den = ref - nd
    rew = np.clip((v - nd) / den, 0, 1)
    b = {}
    for bl in ("guess", "naive", "onestep", "mle", "over", "medfix"):
        x = [r["value"] for r in res if str(r["desk"]) == desk and r["rule"] == bl]
        b[bl] = float(np.mean(np.clip((np.array(x) - nd) / den, 0, 1))) if x else float("nan")
    ok = rew.std() <= 0.15 and (rew < 0.5).mean() <= 0.05 and all(b[k] <= 0.8 for k in ("guess", "naive", "onestep"))
    if ok and len(sel) < N:
        sel.append(int(desk))
    row = dict(desk=int(desk), true_dp=m["V_true_dp"], nodata=nd, ref_mean=float(ref), ref_sd=float(v.std()), n=int(len(v)),
               ref_reward_mean=float(rew.mean()), ref_reward_sd=float(rew.std()), p_below_half=float((rew < 0.5).mean()),
               baselines_expected_reward=b, passes=bool(ok))
    rows.append(row)
    print(f"| {desk} | {m['V_true_dp']:.0f} | {ref:.0f} | {v.std():.0f} | {rew.std():.3f} | {(rew < 0.5).mean():.3f} | "
          + " | ".join(f"{b[k]:.2f}" for k in ("guess", "naive", "onestep", "mle", "over", "medfix")) + f" | {'yes' if ok else 'no'} |")
print("selected:", sel)
json.dump(dict(rule=f"{rule}:{n0}", selected=sel, rows=rows), open(sys.argv[1].replace(".json", "_table.json"), "w"), indent=1)
