"""Model-size curve: trained vs untrained score on held-out design rows.

    modal volume get --env 3-sigma-submission bayesenv-curve runs/full results/curve/
    python scripts/analyze_curve.py --runs results/curve/full [--out results/curve/full]

Reads <runs>/<model>/<arm>/eval_rows.jsonl (written by train/modal_curve.py and
scripts/eval_design_rows.py) and prints, per model and split: mean reward of each arm, the chance
level (expected reward of a uniformly random valid candidate, from the rows' own `eig`), the
valid-answer rate, and paired bootstrap 95% intervals for grpo - base and grpo - control. The
bootstrap resamples task instances (`env`), not rows: one instance contributes up to 4 rows.
Only rows present in both arms of a comparison are used. Chart: reward vs model size per split.

Splits are whatever the result files contain: the two held-out splits plus any extra evaluation
file (`--extra-eval name=file` in the evaluators). Where rows carry a per-candidate `value`
(expected final reward under optimal continuation), the same table and intervals are also
printed for the reward computed from `value` (shown as split `<name> [value]`).
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

SIZE = {"E2B": 2, "E4B": 4, "12B": 12, "26B-A4B": 26, "31B": 31}  # nominal, billions of parameters
ARMS = ("base", "control", "sft", "grpo")
SPLITS = ("heldout_instance", "heldout_family")


def load(runs: Path) -> dict:
    """{model: {arm: {row id: result}}}"""
    out = defaultdict(dict)
    for f in sorted(runs.glob("*/*/eval_rows.jsonl")):
        rs = [json.loads(l) for l in open(f, encoding="utf-8")]
        out[f.parent.parent.name][f.parent.name] = {r["id"]: r for r in rs}
    return out


def paired_ci(a: dict, b: dict, split: str, key: str = "reward", n_boot: int = 5000, seed: int = 0):
    """Mean of reward(a) - reward(b) over shared rows, with a cluster bootstrap over task instances."""
    ids = sorted(i for i in a if i in b and a[i]["split"] == split and key in a[i] and key in b[i])
    if not ids:
        return None
    env = defaultdict(list)
    for i in ids:
        env[a[i]["env"]].append(a[i][key] - b[i][key])
    sums = np.array([sum(v) for v in env.values()])
    cnts = np.array([len(v) for v in env.values()])
    pick = np.random.default_rng(seed).integers(len(sums), size=(n_boot, len(sums)))
    boot = sums[pick].sum(1) / cnts[pick].sum(1)
    lo, hi = np.percentile(boot, [2.5, 97.5])
    return float(sums.sum() / cnts.sum()), float(lo), float(hi), len(ids), len(sums)


def splits_of(data: dict) -> list[str]:
    found = {r["split"] for arms in data.values() for rs in arms.values() for r in rs.values()}
    return [s for s in SPLITS if s in found] + sorted(found - set(SPLITS))


def table(data: dict) -> list[dict]:
    """One record per (model, split), plus one per (model, split) scored on `value` where present."""
    recs = []
    for model in sorted(data, key=lambda m: (SIZE.get(m, 1e9), m)):
        for split in splits_of(data):
            for key, chance, label in (("reward", "chance", split), ("value_reward", "value_chance", f"{split} [value]")):
                arms = {a: [r for r in rs.values() if r["split"] == split and key in r]
                        for a, rs in data[model].items()}
                arms = {a: v for a, v in arms.items() if v}
                if not arms:
                    continue
                ref = next(iter(arms.values()))
                rec = {"model": model, "split": label, "n": len(ref),
                       "chance": float(np.mean([r[chance] for r in ref]))}
                for a, v in arms.items():
                    rec[a] = float(np.mean([r[key] for r in v]))
                    rec[f"{a}_valid"] = float(np.mean([r["valid"] for r in v]))
                for x, y in (("grpo", "base"), ("grpo", "control"), ("control", "base"), ("sft", "base")):
                    if x in data[model] and y in data[model]:
                        rec[f"{x}-{y}"] = paired_ci(data[model][x], data[model][y], split, key)
                recs.append(rec)
    return recs


def show(recs: list[dict]) -> None:
    arms = [a for a in ARMS if any(a in r for r in recs)] + \
           sorted({k for r in recs for k in r if k.endswith("_valid")} - {f"{a}_valid" for a in ARMS})
    arms = [a.removesuffix("_valid") for a in arms]
    f = lambda v: "   -  " if v is None else f"{v:6.3f}"
    for split in dict.fromkeys(r["split"] for r in sorted(recs, key=lambda r: r["split"] not in SPLITS)):
        print(f"\n{split}: mean reward (valid-answer rate)")
        print(f"{'model':9s} {'n':>4s} {'chance':>6s} " + " ".join(f"{a:>14s}" for a in arms))
        for r in (r for r in recs if r["split"] == split):
            print(f"{r['model']:9s} {r['n']:4d} {f(r['chance'])} " + " ".join(
                f"{f(r.get(a))} ({r[a + '_valid']:.2f})" if a in r else f"{'-':>14s}" for a in arms))
        print("paired differences, 95% cluster-bootstrap interval over task instances:")
        for r in (r for r in recs if r["split"] == split):
            parts = [f"{k} {v[0]:+.3f} [{v[1]:+.3f}, {v[2]:+.3f}] (n={v[3]}, {v[4]} instances)"
                     for k in ("grpo-base", "grpo-control", "control-base", "sft-base") if (v := r.get(k))]
            if parts:
                print(f"  {r['model']:9s} " + "; ".join(parts))


def chart(recs: list[dict], out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
    COL = {"base": "#a9a8a2", "control": "#eb6834", "grpo": "#2a78d6", "sft": "#52514e"}
    NAME = {"base": "untrained", "control": "trained, reward for any valid answer", "grpo": "trained, information-gain reward",
            "sft": "supervised on the best candidate"}
    plt.rcParams.update({
        "font.family": "DejaVu Sans", "font.size": 12, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
        "xtick.color": INK2, "ytick.color": INK, "figure.facecolor": SURFACE, "axes.facecolor": SURFACE,
        "savefig.facecolor": SURFACE, "axes.spines.top": False, "axes.spines.right": False,
    })
    panels = list(dict.fromkeys(r["split"] for r in sorted(recs, key=lambda r: r["split"] not in SPLITS)))
    fig, axes = plt.subplots(1, len(panels), figsize=(6 * max(len(panels), 2), 5.4), sharey=True, squeeze=False)
    axes = axes[0]
    fig.subplots_adjust(left=0.14 / max(len(panels), 2), right=0.98, top=0.74, bottom=0.13, wspace=0.06)
    titles = {"heldout_instance": "New instances of the training families",
              "heldout_family": "Families never trained on"}
    for ax, split in zip(axes, panels):
        rs = [r for r in recs if r["split"] == split and r["model"] in SIZE]
        xs = [SIZE[r["model"]] for r in rs]
        for arm in ARMS:
            pts = [(SIZE[r["model"]], r[arm]) for r in rs if arm in r]
            if pts:
                ax.plot(*zip(*pts), color=COL[arm], linewidth=2.5, marker="o", markersize=8,
                        markeredgecolor=SURFACE, markeredgewidth=1.5, label=NAME[arm], zorder=3)
        if rs:
            ax.plot(xs, [r["chance"] for r in rs], color=INK2, linewidth=1, linestyle=(0, (4, 3)), zorder=1,
                    label="a random valid candidate")
        ax.set_xscale("log")
        ax.set_xticks(xs, [r["model"] for r in rs])
        ax.minorticks_off()
        ax.set_ylim(0, 1.0)
        ax.set_title(titles.get(split, split), fontsize=12, color=INK2, loc="left")
        ax.set_xlabel("Gemma 4 model (billions of parameters, log scale)")
        ax.yaxis.grid(True, color=GRID, linewidth=1)
        ax.set_axisbelow(True)
        ax.tick_params(length=0)
    axes[0].set_ylabel("Reward (information gain of the pick / best candidate's)")
    axes[0].legend(loc="lower left", bbox_to_anchor=(-0.02, 1.07), ncol=4, frameon=False, fontsize=10.5,
                   handletextpad=0.4, columnspacing=1.4)
    fig.text(0.02, 0.965, "Choosing the most informative experiment, by model size", fontsize=16,
             fontweight="bold", color=INK, va="top")
    n = max((r["n"] for r in recs), default=0)
    fig.text(0.02, 0.905, f"Held-out design rows, up to {n} per panel, the same rows for every model and arm; "
             "greedy decoding.", fontsize=11.5, color=INK2, va="top")
    out.mkdir(parents=True, exist_ok=True)
    fig.savefig(out / "size_curve.png", dpi=180)
    plt.close(fig)
    print("wrote", out / "size_curve.png")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--runs", default="results/curve/full")
    p.add_argument("--out", default="")
    p.add_argument("--no-chart", action="store_true")
    a = p.parse_args()
    recs = table(load(Path(a.runs)))
    if not recs:
        raise SystemExit(f"no eval_rows.jsonl under {a.runs}/<model>/<arm>/")
    show(recs)
    out = Path(a.out or a.runs)
    out.mkdir(parents=True, exist_ok=True)
    (out / "size_curve.json").write_text(json.dumps(recs, indent=1))
    if not a.no_chart:
        chart(recs, out)
