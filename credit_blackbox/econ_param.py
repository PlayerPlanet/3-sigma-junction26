"""Economics of calibration: for validation desks, value of the fixed-n reference (n sandbox draws per
(segment, check) cell, Dirichlet tables, DP) under the true model, per applicant; plus guessed-Gaussian and
one-step baselines. usage: python econ.py <desk a:b> <n applicants> <out.json>"""
import sys, json
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, "template/environment/mcp-server")
import credit_core as cc
import bbpub as P
import bbsecret as Z

NS = [2, 4, 6, 10]
PR = 16.0


def work(arg):
    desk, j, nrep = arg
    model = Z.desk_model(desk); Tt = Z.true_tables(model)
    prior = cc.Inst(50_000 + 100 * desk + j).prior
    St = cc.Solver(P.TableInst(prior, Tt), "m", PR); V = St.solve(); nd = St.nodata()
    out = dict(desk=desk, j=j, V=V, nd=nd)
    Sg = cc.Solver(P.TableInst(prior, P.guessed_gaussian_tables()), "m", PR); Sg.solve()
    out["guess"] = St.evaluate(Sg.dp_policy())[0]
    for n in NS:
        vals, one = [], []
        for rep in range(nrep):
            r = np.random.default_rng(hash((desk, n, rep)) % 2**32)
            samples = {c: [(k, float(Z.draw_scores(model, c, k, r.random()))) for k in range(cc.K) for _ in range(n)] for c in Z.CHECKS}
            tab, _ = P.fit_samples(samples)
            Sf = cc.Solver(P.TableInst(prior, tab), "m", PR); Sf.solve()
            if n == 6:
                Sn = cc.Solver(P.TableInst(prior, P.naive_gaussian_fit(samples)), "m", PR); Sn.solve()
                out.setdefault("naive6", []).append(St.evaluate(Sn.dp_policy())[0])
            vals.append(St.evaluate(Sf.dp_policy())[0])
            if n == 6: one.append(St.evaluate(Sf.lookahead_policy(1))[0])
        out[f"n{n}"] = float(np.mean(vals))
        if one: out["onestep"] = float(np.mean(one))
    out["naive6"] = float(np.mean(out["naive6"]))
    return out


if __name__ == "__main__":
    a, b = map(int, sys.argv[1].split(":")); na = int(sys.argv[2])
    with Pool(14) as p:
        res = p.map(work, [(d, j, 2) for d in range(a, b) for j in range(na)])
    json.dump(res, open(sys.argv[3], "w"))
    print("per applicant means: V_true", np.mean([r["V"] for r in res]), "nodata", np.mean([r["nd"] for r in res]))
    for k in ["guess", "onestep", "naive6"] + [f"n{n}" for n in NS]:
        print(k, "gain/applicant", round(np.mean([r[k] - r["nd"] for r in res]), 1), "share", round(sum(r[k] - r["nd"] for r in res) / sum(r["V"] - r["nd"] for r in res), 3))
