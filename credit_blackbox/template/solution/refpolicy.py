"""Reference and baseline procedures, written against the agent's tools only (get_rules, simulate, run_check,
decide). `call(tool, args)` is an async function returning the tool's result dict.

ref      : FAIR reference. N0 sandbox draws for every (segment, check) cell up front, band tables from
           bbpub.fit_empirical (median location + pooled symmetrised residuals), exact DP per applicant.
mle      : informed upper line: same draws, but family MLE over {gauss, t3, cauchy} (bbpub.fit_samples).
naive    : Gaussian attractor: same draws, per-cell mean and pooled sd, Gaussian bands, DP.
medfix   : simple strategy: same draws, median location + fixed Gaussian sd 60 band table, DP.
onestep  : same tables as ref, one-step lookahead instead of the DP.
guess    : no calibration: guessed Gaussian model (bbpub.guessed_gaussian_tables), DP.
over     : over-calibration: spends the whole sandbox allowance (evenly over cells), then as ref.
decline  : decline everyone, no checks, no sandbox.
"""
import numpy as np
import credit_core as cc
import bbpub as P

N0 = 8


async def calibrate(call, n_per_cell):
    samples = {c: [] for c in P.CHECKS}
    for c in P.CHECKS:
        for k, s in enumerate(P.SEGMENTS):
            left = n_per_cell
            while left > 0:
                m = min(left, 50)
                r = await call("simulate", {"segment": s, "check": c, "n": m})
                samples[c] += [(k, float(v)) for v in r["scores"]]
                left -= m
    return samples


async def play(call, policy="ref", n0=N0):
    rules = await call("get_rules", {})
    PR = rules["payoff"]["loss_given_default"] / rules["payoff"]["margin_if_repaid"]
    if policy == "decline":
        for _ in rules["applicant_priors"]:
            await call("decide", {"decision": "decline"})
        return
    if policy == "guess":
        tab = P.guessed_gaussian_tables()
    else:
        n = n0 if policy != "over" else rules["sandbox"]["max_draws_per_episode"] // (len(P.CHECKS) * len(P.SEGMENTS))
        s = await calibrate(call, n)
        tab = {"ref": lambda: P.fit_empirical(s)[0], "onestep": lambda: P.fit_empirical(s)[0],
               "over": lambda: P.fit_empirical(s)[0], "mle": lambda: P.fit_samples(s)[0],
               "naive": lambda: P.naive_gaussian_fit(s), "medfix": lambda: P.median_fixed_gauss(s)}[policy]()
    for pr in rules["applicant_priors"]:
        prior = np.array([pr[s] for s in rules["segments"]], float)
        S = cc.Solver(P.TableInst(prior, tab), "m", PR)
        S.solve()
        one = S.lookahead_policy(1) if policy == "onestep" else None
        _, codes, _ = cc.enum()
        cnt = np.zeros((cc.E, cc.B), int)
        while True:
            nn = int(cnt.sum())
            an = S.analyse(cnt)
            stop = -1 if an["v_approve"] >= 0 else -2
            if one is not None:
                act = int(one[nn][int(np.searchsorted(codes[nn], cc.code_of(cnt)))])
            else:
                act = int(an["q_cont"].argmax()) if an["q_cont"].max() > max(an["v_approve"], 0) + cc.TOL else stop
            if act >= 0:
                r = await call("run_check", {"check": P.CHECKS[act]})
                cnt[act, r["band_index"]] += 1
                continue
            await call("decide", {"decision": "approve" if act == -1 else "decline"})
            break
