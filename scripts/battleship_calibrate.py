"""Calibrate Rulebound Battleship: reference vs baselines vs attacks, paired over seeds.

    python scripts/battleship_calibrate.py --seeds 300 --out results/battleship_calibration.json

For each policy (design style x inference style) and seed: the unclipped score, the Harbor
score (clipped to [0, 1]), rule accuracy, the exact design / inference split and the exact
leak-test p-value. Reports means with bootstrap 95% CIs, paired differences to the reference,
per-episode leak flag rates, and batch detection rates for the two-sided leak test.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bayesenv import battleship as B  # noqa: E402

POLICIES = {
    # honest play
    "reference": ("reference", "exact"),
    "fires_only": ("fires_only", "exact"),
    "random_design": ("random", "exact"),
    "hunter_design": ("hunter", "exact"),
    "noise_ignoring_coder": ("reference", "noiseless"),
    "no_occam_coder": ("reference", "no_occam"),
    "naive_human": ("hunter", "noiseless"),
    # baselines the rubric names
    "do_nothing": ("none", "prior"),
    "stop_early": ("one", "exact"),
    # strategies that avoid the task or game the score
    "gamble_one_rule": ("none", "gamble"),
    "overconfident": ("reference", "overconfident"),
    "hedge": ("reference", "hedge"),
    "act_certain_map": ("reference", "map"),
    # cheaters with a side channel to the hidden state (for the leak test)
    "cheat_blend_10pct": ("reference", "cheat_blend"),
    "cheat_5_hidden_shots": ("reference", "cheat_extra"),
    "cheat_full": ("reference", "cheat_full"),
}
SALT = "calibration"


def one(args):
    name, seed = args
    design, inference = POLICIES[name]
    r = B.run_policy(design, inference, seed, SALT).result
    return name, seed, {k: r[k] for k in ("score_raw", "score", "rule_part", "cell_part",
                                          "design", "inference", "accuracy", "ppc_p",
                                          "budget_used")}


def boot_ci(x, n=2000, seed=0):
    x = np.asarray(x, float)
    rng = np.random.default_rng(seed)
    m = rng.choice(x, (n, len(x))).mean(1)
    return [float(x.mean()), float(np.quantile(m, 0.025)), float(np.quantile(m, 0.975))]


def batch_rates(p, size, rng, reps=400):
    """Share of random batches of `size` episodes flagged at 5%: two-sided KS test of the
    p-values against U(0,1), and Fisher's method (one-sided, small p = leak)."""
    p = np.clip(np.asarray(p), 1e-12, 1)
    ks = fi = 0
    for _ in range(reps):
        b = rng.choice(p, size, replace=False)
        ks += stats.kstest(b, "uniform").pvalue < 0.05
        fi += stats.chi2.sf(-2 * np.log(b).sum(), 2 * size) < 0.05
    return ks / reps, fi / reps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=300)
    ap.add_argument("--procs", type=int, default=2)
    ap.add_argument("--out", default="results/battleship_calibration.json")
    a = ap.parse_args()
    t0 = time.time()
    jobs = [(n, s) for n in POLICIES for s in range(a.seeds)]
    with Pool(a.procs) as pool:
        rows = pool.map(one, jobs, chunksize=8)
    by = {n: {} for n in POLICIES}
    for n, s, r in rows:
        by[n][s] = r
    seeds = list(range(a.seeds))
    ref = np.array([by["reference"][s]["score_raw"] for s in seeds])
    rng = np.random.default_rng(1)
    out = {"seeds": a.seeds, "salt": SALT, "budget": B.BUDGET, "fire_noise": B.FIRE_NOISE,
           "policies": {}}
    print(f"{'policy':<22} {'raw mean [95% CI]':<26} {'harbor':>7} {'acc':>5} {'design':>7} "
          f"{'infer':>7} {'ref-pol [95% CI]':<24} {'flag':>5} {'KS30':>5}")
    for n in POLICIES:
        rs = [by[n][s] for s in seeds]
        raw = np.array([r["score_raw"] for r in rs])
        p = np.array([r["ppc_p"] for r in rs])
        ks30, fi30 = batch_rates(p, 30, rng)
        d = {
            "design_inference": POLICIES[n],
            "score_raw": boot_ci(raw),
            "score_harbor": boot_ci([r["score"] for r in rs]),
            "accuracy": boot_ci([r["accuracy"] for r in rs]),
            "design": float(np.mean([r["design"] for r in rs])),
            "inference": float(np.mean([r["inference"] for r in rs])),
            "rule_part": float(np.mean([r["rule_part"] for r in rs])),
            "cell_part": float(np.mean([r["cell_part"] for r in rs])),
            "ref_minus_policy": boot_ci(ref - raw),
            "ref_better_share": float(np.mean(ref > raw + 1e-12)),
            "ppc_flag_rate": float(np.mean(p < 0.05)),
            "ppc_ks_all": float(stats.kstest(p, "uniform").pvalue),
            "batch30_ks_flag": ks30,
            "batch30_fisher_flag": fi30,
            "budget_used": float(np.mean([r["budget_used"] for r in rs])),
        }
        out["policies"][n] = d
        s, c = d["score_raw"], d["ref_minus_policy"]
        print(f"{n:<22} {s[0]:6.3f} [{s[1]:6.3f}, {s[2]:6.3f}]   {d['score_harbor'][0]:7.3f} "
              f"{d['accuracy'][0]:5.2f} {d['design']:7.3f} {d['inference']:7.3f} "
              f"{c[0]:6.3f} [{c[1]:6.3f}, {c[2]:6.3f}]  {d['ppc_flag_rate']:5.2f} {ks30:5.2f}")
    out["seconds"] = time.time() - t0
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(out, indent=1))
    print(f"wrote {a.out} in {out['seconds']:.0f} s")


if __name__ == "__main__":
    main()
