"""Calibrate the Virtual Chemistry Lab: reference (greedy EIG + exact posterior) vs random
designs (+ exact posterior) vs prior, on the same seeds (paired), with bootstrap CIs.

    uv run --no-project --with numpy --with scipy python scripts/chem_calibrate.py --seeds 4000
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
from bayesenv import chem_lab as C  # noqa: E402

POLICIES = ("reference", "random", "prior")
FIELDS = ("reward", "design", "inference", "accuracy", "n_experiments")


def one(seed: int) -> list:
    row = []
    for p in POLICIES:
        r = C.run_policy(p, seed, salt="calibration").result
        row.append([r[f] for f in FIELDS] + [C.NAMES.index(r["hidden"])])
    return row


def boot_ci(x: np.ndarray, rng, b: int = 5000) -> tuple[float, float]:
    m = x[rng.integers(0, len(x), (b, len(x)))].mean(1)
    return float(np.quantile(m, 0.025)), float(np.quantile(m, 0.975))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=4000)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--out", default="results/chem_calibration.json")
    a = ap.parse_args()
    t0 = time.time()
    with Pool(a.workers) as pool:
        rows = np.array(pool.map(one, range(a.seeds), chunksize=20))  # (S, P, F+1)
    rng = np.random.default_rng(0)
    out = {"seeds": a.seeds, "seconds": round(time.time() - t0, 1), "policies": {}}
    hid = rows[:, 0, -1].astype(int)
    for j, p in enumerate(POLICIES):
        d = {f: float(rows[:, j, i].mean()) for i, f in enumerate(FIELDS)}
        d["reward_ci"] = boot_ci(rows[:, j, 0], rng)
        d["accuracy_by_hypothesis"] = {
            n: float(rows[hid == k, j, 3].mean()) for k, n in enumerate(C.NAMES)}
        out["policies"][p] = d
    for j, p in enumerate(POLICIES[1:], 1):
        diff = rows[:, 0, 0] - rows[:, j, 0]
        out[f"reference_minus_{p}"] = {"mean": float(diff.mean()), "ci": boot_ci(diff, rng),
                                       "accuracy_diff": float((rows[:, 0, 3] - rows[:, j, 3]).mean()),
                                       "reference_wins_frac": float((diff > 0).mean())}
    out["hidden_frequency"] = {n: float((hid == k).mean()) for k, n in enumerate(C.NAMES)}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
