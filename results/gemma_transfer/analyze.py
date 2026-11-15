"""Metrics, paired bootstrap CIs and the figure. usage: python analyze.py"""
import json
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
G, B = HERE / "gpu_out", HERE / "base_out"
RNG = np.random.default_rng(12345)
NB = 4000


def load(d, c):
    p = d / f"{c}.json"
    return json.load(open(p)) if p.exists() else None


def boot_idx(n):
    return RNG.integers(0, n, size=(NB, n))


class R:
    """ratio metric: per item (numerator, denominator); value = sum num / sum den"""

    def __init__(self, f):
        self.f = f

    def arrays(self, E):
        nd = np.array([self.f(e) for e in E], float).reshape(len(E), 2)
        return nd[:, 0], nd[:, 1]

    def __call__(self, E):
        n, d = self.arrays(E)
        return float(n.sum() / d.sum()) if d.sum() > 0 else float("nan")


def _boot(f, E, idx):
    n, d = f.arrays(E)
    with np.errstate(invalid="ignore", divide="ignore"):
        return n[idx].sum(1) / d[idx].sum(1)


def ci(f, E, idx):
    bs = _boot(f, E, idx)
    return f(E), float(np.nanpercentile(bs, 2.5)), float(np.nanpercentile(bs, 97.5))


def paired(f, A, T, idx):
    bs = _boot(f, T, idx) - _boot(f, A, idx)
    return f(T) - f(A), float(np.nanpercentile(bs, 2.5)), float(np.nanpercentile(bs, 97.5))


def steps(E):
    return [s for e in E for s in e["steps"]]


def mean_or_nan(x):
    return float(np.mean(x)) if len(x) else float("nan")


def M_ep(key):           # mean over episodes of a field / function
    return R(lambda e: (key(e) if callable(key) else e[key], 1.0))


def M_step(val, cond=lambda s: True):   # pooled over steps
    return R(lambda e: (sum(val(s) for s in e["steps"] if cond(s)), sum(1 for s in e["steps"] if cond(s))))


INVALID = R(lambda e: (e["invalid"], len(e["steps"]) + e["invalid"]))


# ------------------------------------------------------------- metric definitions
def diag_metrics(priced):
    rk = "reward_priced" if priced else "reward"
    return {
        "expected_value_nats": M_ep("v_hat"),
        "realised_logscore": M_ep(rk),
        "adv_lost_per_decision": M_step(lambda s: s["adv"]),
        "share_dp_optimal": M_step(lambda s: s["adv"] <= 1e-6),
        "stop_when_dp_continues": M_step(lambda s: s["stop"], lambda s: s["dp_cont"]),
        "continue_when_dp_stops": M_step(lambda s: not s["stop"], lambda s: not s["dp_cont"]),
        "selection_loss_per_test": M_step(lambda s: s["sel_adv"], lambda s: s["sel_adv"] is not None),
        "tests_per_episode": M_ep("n_tests"),
        "budget_spent": M_ep("spent"),
        "gather_share_of_decisions": M_step(lambda s: not s["stop"]),
        "invalid_rate": INVALID,
    }


def credit_metrics():
    return {
        "reward_normalised": R(lambda e: (e["v_hat"] - e["nodata"], e["V_star"] - e["nodata"])),
        "dollars_lost_per_decision": M_step(lambda s: s["adv"]),
        "share_dp_optimal": M_step(lambda s: s["adv"] <= 1e-6),
        "stop_when_dp_continues": M_step(lambda s: s["stop"], lambda s: s["dp_cont"]),
        "continue_when_dp_stops": M_step(lambda s: not s["stop"], lambda s: not s["dp_cont"]),
        "approve_rate": M_ep(lambda e: e["final"] == "approve"),
        "checks_per_applicant": M_ep("checks"),
        "gather_share_of_decisions": M_step(lambda s: not s["stop"]),
        "invalid_rate": INVALID,
    }


def bs_metrics():
    return {
        "score_raw": M_ep("score_raw"),
        "rule_accuracy": M_ep("rule_acc"),
        "eig_ratio_per_action": M_step(lambda s: s["ratio"], lambda s: not s["stop"]),
        "budget_used": M_ep("budget_used"),
        "stop_before_budget_out": M_ep(lambda e: any(s["stop"] for s in e["steps"])),
        "scan_share_of_actions": M_step(lambda s: s["scan"], lambda s: not s["stop"]),
        "distinct_actions_per_game": M_ep(lambda e: len({s["a"] for s in e["steps"] if not s["stop"]})),
        "invalid_rate": INVALID,
    }


def bank_metrics(labels):
    m = {}
    for lab in labels:
        m[f"{lab}:adv"] = (lambda l: R(lambda r: (r["adv"] if r["label"] == l else 0.0, r["label"] == l)))(lab)
        m[f"{lab}:commit_share"] = (lambda l: R(lambda r: (r["stop"] and r["label"] == l, r["label"] == l)))(lab)
        m[f"{lab}:optimal"] = (lambda l: R(lambda r: (r["adv"] <= 1e-6 and r["label"] == l, r["label"] == l)))(lab)
        m[f"{lab}:commit_share_valid"] = (lambda l: R(lambda r: (r["stop"] and r["label"] == l and not r["invalid"],
                                                                 r["label"] == l and not r["invalid"])))(lab)
        m[f"{lab}:adv_valid"] = (lambda l: R(lambda r: (r["adv"] if (r["label"] == l and not r["invalid"]) else 0.0,
                                                        r["label"] == l and not r["invalid"])))(lab)
    m["invalid_rate"] = R(lambda r: (r["invalid"], 1))
    return m


def rows_metrics():
    return {"design_reward": R(lambda r: (r["reward"], 1)),
            "valid_rate": R(lambda r: (r["valid"], 1)),
            "scan_choice_share": R(lambda r: (r["chosen_scan"] and r["valid"], r["valid"])),
            "picked_best": R(lambda r: (r["reward"] >= 0.9999, 1))}


# ------------------------------------------------------------- run
def analyse():
    out = {}
    plan = [("diag_free", diag_metrics(False), "episodes"), ("diag_random", diag_metrics(False), "episodes"),
            ("diag_priced", diag_metrics(True), "episodes"), ("credit", credit_metrics(), "episodes"),
            ("bship", bs_metrics(), "episodes"),
            ("bank_diag", bank_metrics(["dp_stop", "dp_continue"]), "records"),
            ("bank_credit", bank_metrics(["dp_check", "dp_approve", "dp_decline"]), "records"),
            ("bs_rows", rows_metrics(), "records")]
    for cond, M, key in plan:
        g, b = load(G, cond), load(B, cond)
        if g is None or "trained" not in g:
            continue
        A, T = g["base"][key], g["trained"][key]
        assert len(A) == len(T)
        idx = boot_idx(len(A))
        res = {"n": len(A), "metrics": {}, "baselines": {}, "raw_sample": {arm: g[arm]["raw_sample"][:20] for arm in g},
               "raw_counts": {arm: g[arm]["raw_counts"] for arm in g}}
        for name, f in M.items():
            res["metrics"][name] = dict(base=ci(f, A, idx), trained=ci(f, T, idx), diff=paired(f, A, T, idx))
        if b:
            for pol, d in b.items():
                E = d[key]
                res["baselines"][pol] = {name: float(f(E)) for name, f in M.items()}
                first = next(iter(M))
                res["baselines"][pol]["_ci_" + first] = ci(M[first], E, idx)[1:]
        out[cond] = res
    json.dump(out, open(HERE / "eval_transfer.json", "w"), indent=1, default=float)
    return out


def fmt(t, nd=3):
    return f"{t[0]:.{nd}f} [{t[1]:.{nd}f}, {t[2]:.{nd}f}]"


def report(out):
    for cond, r in out.items():
        print(f"\n=== {cond} (n={r['n']})")
        for name, v in r["metrics"].items():
            nd = 1 if "dollars" in name else 3
            print(f"  {name:28s} base {fmt(v['base'], nd):32s} trained {fmt(v['trained'], nd):32s} diff {fmt(v['diff'], nd)}")
        for pol, v in r["baselines"].items():
            print(f"  [{pol:16s}] " + " ".join(f"{k}={x:.3f}" for k, x in v.items() if not k.startswith("_")))


def figure(out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    OI = dict(black="#000000", orange="#E69F00", sky="#56B4E9", green="#009E73", yellow="#F0E442", blue="#0072B2",
              verm="#D55E00", purple="#CC79A7", grey="#999999")
    plt.rcParams.update({"font.size": 9, "axes.spines.top": False, "axes.spines.right": False})
    fig, axes = plt.subplots(1, 3, figsize=(13, 4.0), gridspec_kw=dict(width_ratios=[1.6, 1, 1]))

    def bar(ax, x, val, lo, hi, color, label=None, hatch=None):
        ax.bar(x, val, 0.8, color=color, edgecolor="black" if hatch else color, hatch=hatch, label=label, linewidth=0.6)
        if lo is not None:
            ax.errorbar(x, val, yerr=[[val - lo], [hi - val]], color="black", capsize=2, lw=0.8)

    # panel 1: diag, expected value (nats) per condition
    ax = axes[0]
    conds = [("diag_free", "low_yield"), ("diag_random", "random tables"), ("diag_priced", "low_yield, priced 0.1/unit")]
    pols = [("random", "random", OI["grey"]), ("greedy", "greedy info gain", OI["orange"]),
            ("greedy_per_cost", "greedy gain/cost", OI["sky"]), ("base", "Gemma base", OI["verm"]),
            ("trained", "Gemma GRPO (credit)", OI["blue"]), ("dp", "exact DP", OI["black"])]
    w = 1.0 / (len(pols) + 1)
    for ci_, (c, lab) in enumerate(conds):
        if c not in out:
            continue
        r = out[c]
        for pi, (p, pl, col) in enumerate(pols):
            x = ci_ + (pi - len(pols) / 2 + 0.5) * w
            if p in ("base", "trained"):
                v = r["metrics"]["expected_value_nats"][p]
                ax.bar(x, v[0], w * 0.9, color=col, label=pl if ci_ == 0 else None)
                ax.errorbar(x, v[0], yerr=[[v[0] - v[1]], [v[2] - v[0]]], color="black", capsize=2, lw=0.8)
            elif p in r["baselines"]:
                v = r["baselines"][p]
                lo, hi = v["_ci_expected_value_nats"]
                ax.bar(x, v["expected_value_nats"], w * 0.9, color=col, label=pl if ci_ == 0 else None)
    ax.set_xticks(range(len(conds)))
    ax.set_xticklabels([l for _, l in conds])
    ax.axhline(0, color="black", lw=0.6)
    ax.set_ylabel("expected final score (nats)")
    ax.set_ylim(-0.4, 2.1)
    ax.set_title("Diagnostic planning lab")
    ax.legend(frameon=False, fontsize=7, ncol=3, loc="upper center")

    # panel 2: battleship
    ax = axes[1]
    if "bship" in out:
        r = out["bship"]
        items = [("do_nothing", "do nothing", OI["grey"]), ("stop_early", "stop early", OI["grey"]),
                 ("random", "random", OI["grey"]), ("hunter", "hunter", OI["purple"]), ("fires_only", "greedy, fires", OI["sky"]),
                 ("base", "Gemma base", OI["verm"]), ("trained", "Gemma GRPO", OI["blue"]), ("reference", "greedy EIG ref.", OI["black"])]
        for i, (p, pl, col) in enumerate(items):
            if p in ("base", "trained"):
                v = r["metrics"]["score_raw"][p]
                bar(ax, i, v[0], v[1], v[2], col)
            elif p in r["baselines"]:
                v = r["baselines"][p]
                lo, hi = v["_ci_score_raw"]
                bar(ax, i, v["score_raw"], lo, hi, col)
        ax.set_xticks(range(len(items)))
        ax.set_xticklabels([pl for _, pl, _ in items], rotation=40, ha="right")
        ax.set_ylabel("score (unclipped, exact posterior reported)")
        ax.set_title("Rulebound Battleship, full games")
        ax.axhline(0, color="black", lw=0.6)

    # panel 3: stated credit desk
    ax = axes[2]
    if "credit" in out:
        r = out["credit"]
        items = [("random", "random", OI["grey"]), ("no_check", "no checks", OI["grey"]),
                 ("check_once", "one check", OI["orange"]), ("one_step", "one-step lookahead", OI["sky"]),
                 ("base", "Gemma base", OI["verm"]), ("trained", "Gemma GRPO", OI["blue"]), ("dp", "exact DP", OI["black"])]
        floor = -1.0
        for i, (p, pl, col) in enumerate(items):
            if p in ("base", "trained"):
                v = r["metrics"]["reward_normalised"][p]
                val, lo, hi = v
            elif p in r["baselines"]:
                val = r["baselines"][p]["reward_normalised"]
                lo, hi = r["baselines"][p]["_ci_reward_normalised"]
            else:
                continue
            shown = max(val, floor)
            bar(ax, i, shown, max(lo, floor) if val > floor else None, max(hi, floor) if val > floor else None, col)
            if val < floor:
                ax.text(i, floor + 0.05, f"{val:.1f}", ha="center", va="bottom", fontsize=7, rotation=90)
        ax.set_ylim(floor, 1.1)
        ax.set_xticks(range(len(items)))
        ax.set_xticklabels([pl for _, pl, _ in items], rotation=40, ha="right")
        ax.set_ylabel("reward (0 = prior only, 1 = exact DP)")
        ax.set_title("Credit desk, tables stated (near transfer)")
        ax.axhline(0, color="black", lw=0.6)
    fig.tight_layout()
    fig.savefig(HERE / "fig_transfer.png", dpi=200)
    fig.savefig(HERE / "fig_transfer.pdf")


if __name__ == "__main__":
    o = analyse()
    report(o)
    figure(o)
