"""Episode-level value distribution of calibration rules over independent sandbox datasets (exact under truth).
usage: python robust.py <desks> <reps> <out>"""
import sys, json
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, "template/environment/mcp-server")
import credit_core as cc, bbpub as P, bbsecret as Z, bblab as L
META = json.load(open("build_meta_1000-1005.json"))
RULES = [("A", 8), ("Aboot", 8), ("A", 12), ("Aboot", 12), ("Aboot", 16)]


def samp(desk, rep, n):
    model = Z.desk_model(desk); r = np.random.default_rng([desk, rep, n, 99])
    return {c: [(k, float(Z.draw_scores(model, c, k, r.random()))) for k in range(cc.K) for _ in range(n)] for c in P.CHECKS}


def work(a):
    desk, seed, reps = a
    T = Z.true_tables(Z.desk_model(desk)); prior = cc.Inst(seed).prior
    St = cc.Solver(P.TableInst(prior, T), "m", L.PR); St.solve()
    out = {}
    for rep in range(reps):
        for est, n in RULES:
            s = samp(desk, rep, n)
            tab = P.fit_empirical(s)[0] if est == "A" else P.fit_empirical_boot(s)
            Sf = cc.Solver(P.TableInst(prior, tab), "m", L.PR); Sf.solve()
            out[f"{est}{n}|{rep}"] = St.evaluate(Sf.dp_policy())[0]
    return desk, out


if __name__ == "__main__":
    desks = [int(x) for x in sys.argv[1].split(",")]; reps = int(sys.argv[2])
    with Pool(16) as p:
        res = p.map(work, [(d, s, reps) for d in desks for s in META[str(d)]["seeds"]])
    tot = {}
    for d, o in res:
        for k, v in o.items():
            tot[(d, k)] = tot.get((d, k), 0.0) + v
    out = {}
    for d in desks:
        for est, n in RULES:
            vals = np.array([tot[(d, f"{est}{n}|{r}")] for r in range(reps)]) - L.SIM_PRICE * n * cc.E * cc.K
            out[f"{d}|{est}{n}"] = vals.tolist()
            print(d, f"{est}{n:<3d}", f"mean {vals.mean():7.1f} sd {vals.std():6.1f} min {vals.min():7.1f}  true {META[str(d)]['V_true_dp']:.0f}")
    json.dump(out, open(sys.argv[3], "w"))
