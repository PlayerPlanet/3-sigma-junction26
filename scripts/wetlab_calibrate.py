"""Calibrate the Wetlab on paired seeds: reference (greedy EIG + SBI), random designs + SBI,
fixed hand-made design + SBI, three "competent coder" proxies (fixed design + ODE fits, see
bayesenv/wetlab_baselines.py) and the prior, with bootstrap CIs.

    uv run --no-project --with numpy --with scipy python scripts/wetlab_calibrate.py --seeds 300
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bayesenv import wetlab as W  # noqa: E402
from bayesenv import wetlab_baselines as WB  # noqa: E402
from bayesenv.wetlab_reward import score  # noqa: E402

POLICIES = ("reference", "random", "fixed", "coder_marg", "coder_bic", "coder_bic_s", "prior")
SALT = "calibration"


def one(seed: int) -> dict:
    out = {}
    t0 = time.perf_counter()
    ref = W.run_policy("reference", seed, SALT)
    out["reference_seconds"] = time.perf_counter() - t0
    labs = {"reference": ref, "random": W.run_policy("random", seed, SALT),
            "fixed": W.run_policy("fixed", seed, SALT), "prior": W.run_policy("prior", seed, SALT)}
    h = W.NAMES.index(ref.hidden)
    out["hidden"] = h
    for p, lab in labs.items():
        r = lab.result
        out[p] = [r["reward"], r["accuracy"], r["n_runs"], r["budget_used"]]
    fx = labs["fixed"].result
    for p, q in WB.coder_posteriors(labs["fixed"].readings).items():
        s = score(q, h)
        out[p] = [s["reward"], s["accuracy"], fx["n_runs"], fx["budget_used"]]
    return out


def boot_ci(x: np.ndarray, rng, b: int = 5000) -> list[float]:
    m = x[rng.integers(0, len(x), (b, len(x)))].mean(1)
    return [float(np.quantile(m, 0.025)), float(np.quantile(m, 0.975))]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=300)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--out", default="results/wetlab_calibration.json")
    a = ap.parse_args()
    t0 = time.time()
    with Pool(a.workers) as pool:
        rows = pool.map(one, range(a.seeds), chunksize=2)
    rng = np.random.default_rng(0)
    hid = np.array([r["hidden"] for r in rows])
    data = {p: np.array([r[p] for r in rows]) for p in POLICIES}
    secs = [r["reference_seconds"] for r in rows]
    out = {"seeds": a.seeds, "salt": SALT, "seconds": round(time.time() - t0, 1),
           "workers": a.workers,
           "reference_seconds_per_episode_mean": float(np.mean(secs)),
           "reference_seconds_per_episode_max": float(np.max(secs)),
           "policies": {}}
    for p in POLICIES:
        d = data[p]
        out["policies"][p] = {
            "reward": float(d[:, 0].mean()), "reward_ci": boot_ci(d[:, 0], rng),
            "reward_median": float(np.median(d[:, 0])),
            "accuracy": float(d[:, 1].mean()), "accuracy_ci": boot_ci(d[:, 1], rng),
            "n_runs": float(d[:, 2].mean()), "budget_used": float(d[:, 3].mean()),
            "frac_reward_below_minus_2": float((d[:, 0] < -2).mean()),
            "accuracy_by_mechanism": {n: float(d[hid == k, 1].mean()) if (hid == k).any() else None
                                      for k, n in enumerate(W.NAMES)}}
    for p in POLICIES[1:]:
        diff = data["reference"][:, 0] - data[p][:, 0]
        acc = data["reference"][:, 1] - data[p][:, 1]
        out[f"reference_minus_{p}"] = {
            "mean": float(diff.mean()), "ci": boot_ci(diff, rng),
            "accuracy_diff": float(acc.mean()), "accuracy_diff_ci": boot_ci(acc, rng),
            "reference_wins_frac": float((diff > 0).mean())}
    diff = data["fixed"][:, 0] - data["coder_marg"][:, 0]   # same data: inference only
    out["fixed_sbi_minus_coder_marg_same_data"] = {"mean": float(diff.mean()),
                                                   "ci": boot_ci(diff, rng)}
    out["hidden_frequency"] = {n: float((hid == k).mean()) for k, n in enumerate(W.NAMES)}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
