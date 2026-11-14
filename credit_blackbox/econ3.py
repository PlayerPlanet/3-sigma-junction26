"""Fair reference A (median + pooled symmetrised empirical residuals) vs informed MLE vs baselines, exact values
under the true generator. Per applicant values; sandbox costs are added at episode level in the summary.
usage: python econ3.py <desk a:b> <n applicants> <reps> <out.json>"""
import sys, json
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, "template/environment/mcp-server")
import credit_core as cc
import bbpub as P
import bbsecret as Z
PR = 16.0
NS = [4, 6, 8, 12, 16]


def sample(model, n, r):
    return {c: [(k, float(Z.draw_scores(model, c, k, r.random()))) for k in range(cc.K) for _ in range(n)] for c in Z.CHECKS}


def work(arg):
    desk, j, nrep = arg
    model = Z.desk_model(desk); Tt = Z.true_tables(model)
    prior = cc.Inst(50_000 + 100 * desk + j).prior
    St = cc.Solver(P.TableInst(prior, Tt), "m", PR); V = St.solve(); nd = St.nodata()
    ev = lambda tab, one=False: (lambda S: (S.solve(), St.evaluate(S.lookahead_policy(1) if one else S.dp_policy())[0])[1])(cc.Solver(P.TableInst(prior, tab), "m", PR))
    out = dict(desk=desk, j=j, V=V, nd=nd, guess=ev(P.guessed_gaussian_tables()), true_onestep=St.evaluate(St.lookahead_policy(1))[0])
    for rep in range(nrep):
        r = np.random.default_rng([desk, j, rep])
        for n in NS:
            s = sample(model, n, r)
            out.setdefault(f"A{n}", []).append(ev(P.fit_empirical(s)[0]))
            if n in (6, 8):
                out.setdefault(f"MLE{n}", []).append(ev(P.fit_samples(s)[0]))
                out.setdefault(f"naive{n}", []).append(ev(P.naive_gaussian_fit(s)))
                out.setdefault(f"medfix{n}", []).append(ev(P.median_fixed_gauss(s)))
                out.setdefault(f"A1step{n}", []).append(ev(P.fit_empirical(s)[0], one=True))
    for k in list(out):
        if isinstance(out[k], list): out[k] = float(np.mean(out[k]))
    return out


if __name__ == "__main__":
    a, b = map(int, sys.argv[1].split(":")); na = int(sys.argv[2]); nrep = int(sys.argv[3])
    with Pool(16) as p:
        res = p.map(work, [(d, j, nrep) for d in range(a, b) for j in range(na)])
    json.dump(res, open(sys.argv[4], "w"))
    gain = lambda k: np.mean([r[k] - r["nd"] for r in res])
    print(f"true DP gain/applicant {gain('V'):.1f}   (applicants {len(res)})")
    for k in sorted(set(res[0]) - {"desk", "j", "V", "nd"}):
        print(f"{k:12s} gain/applicant {gain(k):7.1f}  share of true {gain(k) / gain('V'):.3f}")
