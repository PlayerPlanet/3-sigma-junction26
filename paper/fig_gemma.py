"""Gemma 4 E2B GRPO on the black-box credit desk: paper figure.

    python fig_gemma.py <gemma-run-dir>     # reads run/curve.jsonl, eval.json, refeval.json; writes fig_gemma.pdf/png
"""
import json
import pathlib
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = pathlib.Path(sys.argv[1])
curve = [json.loads(l) for l in open(G / "run" / "curve.jsonl")]
ev = json.load(open(G / "eval.json"))
ref = json.load(open(G / "refeval.json"))
desks = ["3004", "3005", "3008", "3016", "3017", "3019"]
pol = {(str(r["desk"]), r["policy"]): r for r in ref}

INK, MUTED, GRID = "#222222", "#777777", "#e6e6e6"
C_TR, C_BASE, C_ONE, C_REF = "#0072B2", "#999999", "#E69F00", "#222222"   # Okabe-Ito, fixed order

fig, (a, b) = plt.subplots(1, 2, figsize=(7.2, 2.9), gridspec_kw=dict(width_ratios=[1, 1.35]))

# (a) held-out decisions during training: money lost per decision vs the true-model DP
steps = [c["step"] for c in curve]
a.plot(steps, [c["adv_lost_mean"] for c in curve], color=C_TR, lw=2, marker="o", ms=5, mec="white", mew=1, zorder=3)
a.set_yscale("log")
a.set_ylim(4, 3000)
a.set_xlabel("GRPO step", color=INK)
a.set_ylabel("\\$ lost per decision\n(held-out states, log scale)", color=INK)
a.set_title("(a) Held-out decisions", fontsize=9, loc="left", color=INK)
a.annotate("\\$1,507", (0, curve[0]["adv_lost_mean"]), xytext=(8, -2), textcoords="offset points", fontsize=7.5, color=MUTED)
a.annotate(f"\\${curve[-1]['adv_lost_mean']:.0f}", (steps[-1], curve[-1]["adv_lost_mean"]), xytext=(0, -13),
           textcoords="offset points", fontsize=7.5, color=MUTED, ha="center")

# (b) full episodes on the six evaluation desks (20 sandbox datasets each)
x = list(range(len(desks) + 1))
labels = desks + ["all"]
def series(get, ci=None):
    return [get(d) for d in desks]
tr = [ev["trained"]["per_desk"][d]["reward_mean"] for d in desks]
trc = [ev["trained"]["per_desk"][d]["reward_ci95"] for d in desks]
base = [ev["base"]["per_desk"][d]["reward_mean"] for d in desks]
one = [pol[(d, "onestep")]["reward_mean"] for d in desks]
rf = [pol[(d, "ref")]["reward_mean"] for d in desks]
mean = lambda v: sum(v) / len(v)
tr_all = mean(tr)
tr_all_ci = ev["trained"].get("summary", {}).get("reward_ci95", 0.05)
for xs, ys, c, mk, lab, z in ((x, rf + [mean(rf)], C_REF, "_", "Reference", 2),
                              (x, one + [mean(one)], C_ONE, "D", "One-step lookahead", 3),
                              (x, base + [mean(base)], C_BASE, "s", "Gemma 4 E2B, untrained", 3)):
    b.scatter([v + (0.18 if lab != "Reference" else 0) * (1 if "One" in lab else -1 if "untrained" in lab else 0) for v in xs], ys,
              marker=mk, s=110 if mk == "_" else 26, color=c, lw=2 if mk == "_" else 0.6,
              edgecolor="white" if mk != "_" else None, zorder=z, label=lab)
b.errorbar(x, tr + [tr_all], yerr=trc + [tr_all_ci], fmt="o", ms=6, color=C_TR, mec="white", mew=1, elinewidth=1.4,
           capsize=0, zorder=4, label="Gemma 4 E2B, after GRPO")
b.axvline(len(desks) - 0.5, color=GRID, lw=1)
b.set_xticks(x, labels)
b.set_ylim(-0.05, 1.08)
b.set_xlabel("Evaluation desk", color=INK)
b.set_ylabel("Episode reward", color=INK)
b.set_title("(b) Full episodes, six evaluation desks", fontsize=9, loc="left", color=INK)
b.legend(fontsize=7, frameon=False, loc="center left", bbox_to_anchor=(1.0, 0.5))

for ax in (a, b):
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color(MUTED)
    ax.tick_params(colors=MUTED, labelsize=7.5)
    ax.grid(axis="y", color=GRID, lw=0.6, zorder=0)
    ax.set_axisbelow(True)
fig.tight_layout()
fig.savefig("fig_gemma.pdf")
fig.savefig("fig_gemma.png", dpi=180)
print("trained mean", round(tr_all, 3), "ci", tr_all_ci)
