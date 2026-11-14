"""Battleship-specific summary of a Harbor run directory (scripts/eval.sh calls it).

    python scripts/battleship_report.py jobs/<run-id>

Per job: trials graded, mean Harbor score (clipped to [0, 1]), mean UNCLIPPED score with a
bootstrap 95% CI, the exact design / inference split, rule accuracy, the paired gap to the
reference run on the same hidden board, and the leak test (share of trials with p < 0.05 and a
two-sided KS test of all p-values against uniform). Unclipped means are the numbers to compare:
per-trial clipping at 0 hides confident mistakes and favours gambling.
"""

import json
import sys
from pathlib import Path

import numpy as np


def ci(x, n=2000):
    x = np.asarray(x, float)
    if len(x) < 2:
        return float(x.mean()) if len(x) else float("nan"), float("nan"), float("nan")
    m = np.random.default_rng(0).choice(x, (n, len(x))).mean(1)
    return float(x.mean()), float(np.quantile(m, .025)), float(np.quantile(m, .975))


def ks_uniform(p):
    p = np.sort(np.asarray(p, float))
    n = len(p)
    if n == 0:
        return float("nan")
    d = max(np.max(np.arange(1, n + 1) / n - p), np.max(p - np.arange(n) / n))
    try:
        from scipy import stats
        return float(stats.kstwo.sf(d, n))
    except ImportError:  # asymptotic Kolmogorov tail
        lam = (np.sqrt(n) + 0.12 + 0.11 / np.sqrt(n)) * d
        return float(min(1.0, 2 * sum((-1) ** (k - 1) * np.exp(-2 * k * k * lam * lam)
                                      for k in range(1, 100))))


def main(run_dir: Path) -> None:
    jobs = {}
    for f in sorted(run_dir.glob("*/*/verifier/details.json")):
        try:
            d = json.loads(f.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if "score_raw" in d:
            jobs.setdefault(f.parents[2].name, []).append(d)
    if not jobs:
        print("no battleship trials found")
        return
    print(f"\n{'job':<14} {'n':>3} {'harbor':>7} {'unclipped [95% CI]':<26} {'design':>7} "
          f"{'infer':>7} {'rule acc':>8} {'gap to ref':>10} {'leak p<.05':>10} {'KS p':>6}")
    for job, ds in jobs.items():
        raw = [d["score_raw"] for d in ds]
        m, lo, hi = ci(raw)
        p = [d["ppc_p"] for d in ds if d.get("submitted")]
        print(f"{job:<14} {len(ds):>3} {np.mean([d['score'] for d in ds]):7.3f} "
              f"{m:6.3f} [{lo:6.3f}, {hi:6.3f}]   "
              f"{np.mean([d['design'] for d in ds]):7.3f} {np.mean([d['inference'] for d in ds]):7.3f} "
              f"{np.mean([d['accuracy'] for d in ds]):8.2f} "
              f"{np.mean([d['gap_to_reference'] for d in ds]):10.3f} "
              f"{(np.mean(np.array(p) < 0.05) if p else float('nan')):10.2f} {ks_uniform(p):6.3f}")
    print("\nunclipped = the proper score (prior 0, truth ~1); design = score of the exact "
          "posterior given the agent's own shots; infer = score - design (0 for exact Bayes); "
          "gap = score minus the reference on the same hidden board.")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
