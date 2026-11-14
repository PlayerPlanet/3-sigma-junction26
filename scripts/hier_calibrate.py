"""Calibrate the hierarchical lab (bayesenv.hier): the reference against random experiments
and against the three shortcut inferences (no pooling, complete pooling, plug-in), on the same
seeds (paired: same hidden draws, same noise stream), with bootstrap 95% CIs.

    PY="uv run --no-project --with numpy --with scipy python"
    $PY scripts/hier_calibrate.py --seeds 40            # small local run, single process
    $PY scripts/hier_calibrate.py --norm                # re-estimate the reward constants

The full run (1,000 seeds) goes to Modal CPU: experiments/hier_modal.py::calibrate, which calls
exactly `bayesenv.hier.evaluate_seed` and `summarise` below.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bayesenv import hier as H  # noqa: E402

SALT = "calibration"
COLS = ("raw", "raw_a", "raw_b", "clipped")


def boot_ci(x: np.ndarray, rng, b: int = 4000) -> list[float]:
    m = x[rng.integers(0, len(x), (b, len(x)))].mean(1)
    return [float(np.quantile(m, 0.025)), float(np.quantile(m, 0.975))]


def _stat(x: np.ndarray, rng) -> dict:
    return {"mean": float(x.mean()), "ci": boot_ci(x, rng)}


def summarise(rows: list[dict]) -> dict:
    """rows: one evaluate_seed() dict per seed. Means, CIs, paired reference-minus-X."""
    rng = np.random.default_rng(0)
    names = [k for k in rows[0] if not k.startswith("_")]
    arr = {k: np.array([r[k] for r in rows]) for k in names}          # (S, 4)
    out = {"seeds": len(rows), "policies": {}, "reference_minus": {}}
    for k in names:
        out["policies"][k] = {c: _stat(arr[k][:, i], rng) for i, c in enumerate(COLS)}
        out["policies"][k]["raw_above_1_frac"] = float((arr[k][:, 0] > 1).mean())
        out["policies"][k]["raw_below_0_frac"] = float((arr[k][:, 0] < 0).mean())
        out["policies"][k]["raw_median"] = float(np.median(arr[k][:, 0]))
    for k in names:
        if k == "reference":
            continue
        d = arr["reference"] - arr[k]
        out["reference_minus"][k] = {c: _stat(d[:, i], rng) for i, c in enumerate(COLS)}
        out["reference_minus"][k]["reference_better_frac"] = float((d[:, 0] > 0).mean())
    if "random_unit_eig_design" in arr and "random" in arr:
        tot = arr["reference"][:, 0] - arr["random"][:, 0]
        alloc = arr["reference"][:, 0] - arr["random_unit_eig_design"][:, 0]
        des = arr["random_unit_eig_design"][:, 0] - arr["random"][:, 0]
        out["reference_minus_random_decomposition"] = {
            "total": _stat(tot, rng),
            "unit_allocation": _stat(alloc, rng),      # reference - (random unit, reference design)
            "design_given_unit": _stat(des, rng),      # (random unit, reference design) - random
            "allocation_share": float(alloc.mean() / tot.mean()) if tot.mean() else None}
    info = [r["_info"] for r in rows if r.get("_info")]
    if info:
        alloc = np.array([sorted(i["alloc"], reverse=True) for i in info])
        tau, ptau = np.array([i["tau"] for i in info]), np.array([i["plugin_tau"] for i in info])
        out["reference_behaviour"] = {
            "experiments_per_unit_sorted_mean": alloc.mean(0).round(2).tolist(),
            "units_tested_mean": float((alloc > 0).sum(1).mean()),
            "plugin_tau_at_lower_bound_frac": float((ptau < 1.05 * ptau.min()).mean()),
            "plugin_tau_below_true_frac": float((ptau < tau).mean())}
    return out


def table(s: dict) -> str:
    head = ("policy", "raw", "(a)", "(b)", "clipped")
    lines = ["%-28s %7s %7s %7s %8s  >1  <0   ref - policy: raw [95%% CI], (a), (b), clipped" % head]
    for k, v in s["policies"].items():
        d = s["reference_minus"].get(k)
        tail = "" if d is None else "   %+.3f [%+.3f, %+.3f]  a %+.3f  b %+.3f  c %+.3f [%+.3f, %+.3f]" % (
            d["raw"]["mean"], *d["raw"]["ci"], d["raw_a"]["mean"], d["raw_b"]["mean"],
            d["clipped"]["mean"], *d["clipped"]["ci"])
        lines.append("%-28s %7.3f %7.3f %7.3f %8.3f %.2f %.2f%s" % (
            k, v["raw"]["mean"], v["raw_a"]["mean"], v["raw_b"]["mean"], v["clipped"]["mean"],
            v["raw_above_1_frac"], v["raw_below_0_frac"], tail))
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=40)
    ap.add_argument("--out", default="")
    ap.add_argument("--norm", action="store_true", help="re-estimate NORM_A / NORM_B and exit")
    a = ap.parse_args()
    model = H.get_model()
    if a.norm:
        za, zb = H.estimate_norm(model, 400_000)
        print(f"NORM_A = {za:.5f}\nNORM_B = {zb:.5f}")
        return
    t0 = time.time()
    rows = [H.evaluate_seed(s, SALT, model) for s in range(a.seeds)]
    s = summarise(rows)
    s["meta"] = {"runner": "local", "seconds": round(time.time() - t0, 1),
                 "config": dict(model.cfg.__dict__), "norm_a": model.norm[0],
                 "norm_b": model.norm[1], "salt": SALT}
    print(table(s))
    if a.out:
        Path(a.out).write_text(json.dumps(s, indent=1))


if __name__ == "__main__":
    main()
