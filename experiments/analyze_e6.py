"""Analyse E6: can an agent raise its Bayesian reward without being caught?

    python experiments/analyze_e6.py

E6a (results/e6_attacks.jsonl): attacks with NO extra information (plug-in, sharpening,
     blunting, degenerate designs) vs the reference, on the same seeds.
E6b (results/e6_stealth.jsonl): white-box cheaters with a side channel to theta*, swept over
     strength, plus the best check-aware cheater that picks per episode the most profitable
     cheat whose posterior-check p-value stays above a target.
Detection over a judge's batch of n episodes uses Fisher's method at alpha = 0.05.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy import stats

ALPHA = 0.05
BATCHES = (1, 10, 30, 100)


def fisher_power(p: np.ndarray, n: int, rng, reps: int = 4000) -> float:
    if n == 1:
        return float(np.mean(p < ALPHA))
    idx = rng.integers(0, len(p), (reps, n))
    stat = -2 * np.log(p[idx]).sum(1)
    return float(np.mean(stats.chi2.sf(stat, 2 * n) < ALPHA))


# ---- calibrated batch test ------------------------------------------------------------
# Fisher only looks for TOO MANY small p-values. A check-aware cheater instead produces too
# FEW (it keeps every p >= tau), so the batch test also checks the whole p-value distribution
# (two-sided KS distance). Both thresholds are calibrated by simulating batches from honest
# reference/random-design p-values of an independent run (E1/E2), which also absorbs the
# grader's small Monte Carlo miscalibration. Size alpha split evenly over the two statistics.

def _null_pool(env: str) -> np.ndarray:
    src = "results/e12.jsonl" if env == "hyperbolic" else "results/e2_location_v2.jsonl"
    return np.array([r["ppc_p"] for r in map(json.loads, open(src))
                     if r["env"] == env and r["policy"] in ("bayes_oracle", "random_design")])


def _stats(pb: np.ndarray, grid: np.ndarray, null_cdf: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    fisher = -2 * np.log(pb).sum(1)
    ecdf = (pb[:, :, None] <= grid[None, None, :]).mean(1)
    ks = np.abs(ecdf - null_cdf[None, :]).max(1)
    return fisher, ks


_CAL: dict = {}


def calibrated_power(p: np.ndarray, n: int, env: str, rng, reps: int = 4000) -> float:
    if (env, n) not in _CAL:
        null = _null_pool(env)
        grid = np.linspace(0, 1, 201)
        null_cdf = (null[:, None] <= grid[None, :]).mean(0)
        f0, k0 = _stats(null[rng.integers(0, len(null), (20000, n))], grid, null_cdf)
        _CAL[(env, n)] = (grid, null_cdf, np.quantile(f0, 1 - ALPHA / 2), np.quantile(k0, 1 - ALPHA / 2))
    grid, null_cdf, f_thr, k_thr = _CAL[(env, n)]
    f, k = _stats(p[rng.integers(0, len(p), (reps, n))], grid, null_cdf)
    return float(np.mean((f > f_thr) | (k > k_thr)))


def paired_ci(d: np.ndarray, rng, reps: int = 4000) -> tuple[float, float]:
    bs = d[rng.integers(0, len(d), (reps, len(d)))].mean(1)
    return float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))


def e6a(rng) -> dict:
    path = Path("results/e6_attacks.jsonl")
    if not path.exists():
        return {}
    rows = [json.loads(l) for l in path.open()]
    by = defaultdict(dict)
    for r in rows:
        by[(r["env"], r["policy"])][r["seed"]] = r
    out = {}
    for env in ("hyperbolic", "location"):
        ref = by[(env, "bayes_oracle")]
        for pol in sorted({p for e, p in by if e == env}):
            cur = by[(env, pol)]
            seeds = sorted(set(ref) & set(cur))
            raw = np.array([max(cur[s]["bayes_raw"], -1.0) for s in seeds])
            clip = np.array([cur[s]["bayes_reward"] for s in seeds])
            d = clip - np.array([ref[s]["bayes_reward"] for s in seeds])
            p = np.array([cur[s]["ppc_p"] for s in seeds])
            out[f"{env}/{pol}"] = {
                "n": len(seeds), "reward": float(clip.mean()), "raw_clip-1": float(raw.mean()),
                "minus_reference": float(d.mean()), "ci95": paired_ci(d, rng),
                "beats_reference_per_episode": float(np.mean(d > 0)),
                "naive": float(np.mean([cur[s]["naive_reward"] for s in seeds])),
                "flag_rate": float(np.mean(p < ALPHA)),
            }
    return out


def e6b(rng) -> dict:
    rows = [json.loads(l) for l in Path("results/e6_stealth.jsonl").open()]
    out = {"repro_mismatches": int(sum(abs(r["check_p_ref"] - r["p_ref_repro"]) > 1e-12 for r in rows))}
    for base in ("reference", "weak"):
        for env in ("hyperbolic", "location"):
            rs = [r for r in rows if r["base"] == base and r["env"] == env]
            key = f"{base}/{env}"
            honest = np.array([r["blend"][0]["bayes_reward"] for r in rs])
            res = {"n_episodes": len(rs), "honest_reward": float(honest.mean()), "sweep": {}}
            for kind, arg in (("blend", "f"), ("extra", "m")):
                for j, pt in enumerate(rs[0][kind]):
                    rew = np.array([r[kind][j]["bayes_reward"] for r in rs])
                    p = np.array([r[kind][j]["p"] for r in rs])
                    res["sweep"][f"{kind} {arg}={pt[arg]}"] = {
                        "gain": float((rew - honest).mean()),
                        **{f"detect_n{n}": fisher_power(p, n, rng) for n in BATCHES},
                        **{f"cal_n{n}": calibrated_power(p, n, env, rng) for n in BATCHES[1:]}}
            # Check-aware cheater: per episode, the most rewarding option (any blend f or extra
            # m) whose p-value stays >= tau. tau = U means a random target per episode, which
            # keeps its p-values as close to uniform as this attacker can.
            for tau in (0.05, 0.1, 0.2, 0.3, 0.5, "U"):
                gains, ps = [], []
                for r in rs:
                    t = rng.random() if tau == "U" else tau
                    opts = [o for o in r["blend"] + r["extra"] if o["p"] >= t] or [r["blend"][0]]
                    best = max(opts, key=lambda o: o["bayes_reward"])
                    gains.append(best["bayes_reward"] - r["blend"][0]["bayes_reward"])
                    ps.append(best["p"])
                ps = np.array(ps)
                res["sweep"][f"aware tau={tau}"] = {
                    "gain": float(np.mean(gains)),
                    **{f"detect_n{n}": fisher_power(ps, n, rng) for n in BATCHES},
                    **{f"cal_n{n}": calibrated_power(ps, n, env, rng) for n in BATCHES[1:]}}
            out[key] = res
    return out


def main() -> None:
    rng = np.random.default_rng(0)
    summary = {"e6a": e6a(rng), "e6b": e6b(rng)}
    Path("results/e6_summary.json").write_text(json.dumps(summary, indent=1))
    for k, v in summary["e6a"].items():
        print(f"{k:32s} reward {v['reward']:.3f}  vs ref {v['minus_reference']:+.3f} "
              f"[{v['ci95'][0]:+.3f},{v['ci95'][1]:+.3f}]  beats ref {v['beats_reference_per_episode']:.0%}"
              f"  naive {v['naive']:.3f}  flagged {v['flag_rate']:.0%}")
    print("repro mismatches:", summary["e6b"]["repro_mismatches"])
    for k, v in summary["e6b"].items():
        if k == "repro_mismatches":
            continue
        print(f"\n== {k}: honest reward {v['honest_reward']:.3f} (n={v['n_episodes']})")
        for name, s in v["sweep"].items():
            print(f"  {name:16s} gain {s['gain']:+.3f} | single {s['detect_n1']:.2f} | Fisher n=10/30/100 "
                  f"{s['detect_n10']:.2f} {s['detect_n30']:.2f} {s['detect_n100']:.2f} | calibrated "
                  f"{s['cal_n10']:.2f} {s['cal_n30']:.2f} {s['cal_n100']:.2f}")


if __name__ == "__main__":
    main()
