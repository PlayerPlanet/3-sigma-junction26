"""Random testing vs greedy information gain vs exact dynamic programming on one finite
diagnostic table (specs/tables/low_yield.yaml), plus robustness checks. Reproduces every
number in docs/DIAG.md into results/diag_experiment.json.

    uv run --no-project --with numpy --with scipy --with pyyaml python scripts/diag_experiment.py

Single process, about 3 minutes on a laptop. No network, no LLM.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bayesenv import diag as D  # noqa: E402

SALT = "diag-experiment"          # fixed and public: this is an experiment, not a graded task
POLICIES = ["random", "greedy", "greedy_per_cost", "lookahead2", "dp"]


def cached(policy):
    """Deterministic policies depend only on the set of (test, outcome) pairs."""
    memo = {}

    def wrapped(table, w, obs, remaining):
        key = frozenset(obs)
        if key not in memo:
            memo[key] = policy(table, w, obs, remaining)
        return memo[key]
    return wrapped


def exact_all(tb: D.Table, budget=None, lookahead=True) -> dict:
    dp = D.exact_dp(tb, budget)
    out = {"random": D.evaluate_random(tb, budget),
           "greedy": D.evaluate_policy(tb, D.greedy_policy, budget),
           "greedy_per_cost": D.evaluate_policy(tb, D.greedy_per_cost_policy, budget),
           "dp": D.evaluate_policy(tb, dp.policy, budget)}
    if lookahead:
        out["lookahead2"] = D.evaluate_policy(tb, D.lookahead2_policy, budget)
    out["dp"].update(dp_value=dp.value, n_states=dp.n_states, n_subsets=dp.n_subsets,
                     seconds=dp.seconds)
    return out


def tree_sketch(tb: D.Table, policy, depth: int = 2) -> list[str]:
    """The policy's choices for the first `depth` tests, then the next choice at each leaf."""
    lines = []

    def rec(w, obs, remaining, d, indent):
        t = policy(tb, w, obs, remaining)
        if t is None:
            lines.append(f"{indent}-> stop and report")
            return
        if d == depth:
            lines.append(f"{indent}-> next: {tb.tests[t]}")
            return
        lines.append(f"{indent}run {tb.tests[t]} (cost {tb.costs[t]:g})")
        tot = w.sum()
        for o, oname in enumerate(tb.outcomes[t]):
            w2 = w * tb.lik[t][:, :, o]
            if w2.sum() <= 0:
                continue
            lines.append(f"{indent}  if {oname} (p={w2.sum() / tot:.2f}):")
            rec(w2, obs + ((t, o),), remaining - tb.costs[t], d + 1, indent + "    ")
    rec(tb.joint.copy(), (), tb.budget, 0, "")
    return lines


def simulate(tb: D.Table, policies: dict, n: int) -> dict:
    """Paired simulation through DiagLab: the same seed gives the same hidden state and the
    same reading for each test under every policy."""
    names = list(policies)
    R = np.zeros((n, len(names)))
    A = np.zeros((n, len(names)))
    ctrl = {k: 0 for k in names}
    anymis = {k: 0 for k in names}
    controls, mis = set(tb.by_role("control")), set(tb.by_role("misleading"))
    for seed in range(n):
        for j, k in enumerate(names):
            pol = policies[k] if k != "random" else D.make_random_policy(
                np.random.default_rng([seed, 0xAA]))
            lab = D.run_policy(tb, pol, seed, SALT)
            R[seed, j] = lab.result["reward"]
            A[seed, j] = lab.result["accuracy"]
            ran = {h["test"] for h in lab.history}
            ctrl[k] += bool(ran & controls)
            anymis[k] += bool(ran & mis)
    return {"names": names, "R": R, "A": A,
            "control": {k: v / n for k, v in ctrl.items()},
            "any_misleading": {k: v / n for k, v in anymis.items()}}


def bootstrap(R: np.ndarray, names: list[str], pairs, n_boot: int = 2000, seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    n = len(R)
    means = np.empty((n_boot, R.shape[1]))
    for b in range(n_boot):
        means[b] = R[rng.integers(0, n, n)].mean(0)
    out = {"mean": {}, "diff": {}}
    for j, k in enumerate(names):
        lo, hi = np.percentile(means[:, j], [2.5, 97.5])
        out["mean"][k] = {"mean": float(R[:, j].mean()), "ci95": [float(lo), float(hi)]}
    for a, b in pairs:
        d = means[:, names.index(a)] - means[:, names.index(b)]
        lo, hi = np.percentile(d, [2.5, 97.5])
        out["diff"][f"{a} - {b}"] = {
            "mean": float((R[:, names.index(a)] - R[:, names.index(b)]).mean()),
            "ci95": [float(lo), float(hi)]}
    return out


def family_stats(rows: list[dict]) -> dict:
    def summ(key):
        x = np.array([r[key] for r in rows])
        return {"mean": float(x.mean()), "median": float(np.median(x)),
                "p10": float(np.percentile(x, 10)), "p90": float(np.percentile(x, 90)),
                "max": float(x.max()), "min": float(x.min()),
                "share_gt_0.05": float((x > 0.05).mean()),
                "share_gt_0.2": float((x > 0.2).mean()),
                "share_lt_0.005": float((x < 0.005).mean())}
    return {"n_tables": len(rows),
            "dp_minus_greedy": summ("dp_minus_greedy"),
            "dp_minus_greedy_per_cost": summ("dp_minus_greedy_per_cost"),
            "dp_minus_best_greedy": summ("dp_minus_best_greedy"),
            "greedy_minus_random": summ("greedy_minus_random"),
            "dp_minus_greedy_relative": summ("dp_minus_greedy_relative"),
            "mean_reward": {k: float(np.mean([r[k] for r in rows]))
                            for k in ("random", "greedy", "greedy_per_cost", "dp")},
            "dp_control_usage_mean": float(np.mean([r["dp_control"] for r in rows])),
            "greedy_control_usage_mean": float(np.mean([r["greedy_control"] for r in rows])),
            "share_greedy_below_random": float(np.mean([r["greedy_minus_random"] < 0
                                                        for r in rows]))}


def table_row(tb: D.Table) -> dict:
    e = exact_all(tb, lookahead=False)
    r = {k: e[k]["reward"] for k in ("random", "greedy", "greedy_per_cost", "dp")}
    ctrl = tb.by_role("control")
    r.update(
        dp_minus_greedy=r["dp"] - r["greedy"],
        dp_minus_greedy_per_cost=r["dp"] - r["greedy_per_cost"],
        dp_minus_best_greedy=r["dp"] - max(r["greedy"], r["greedy_per_cost"]),
        greedy_minus_random=r["greedy"] - r["random"],
        dp_minus_greedy_relative=(r["dp"] - r["greedy"]) / r["dp"] if r["dp"] > 0 else 0.0,
        dp_control=sum(e["dp"]["usage"][c] for c in ctrl),
        greedy_control=sum(e["greedy"]["usage"][c] for c in ctrl),
        budget=tb.budget, mean_tests_dp=e["dp"]["mean_tests"], n_states=e["dp"]["n_states"])
    return r


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", default="low_yield")
    ap.add_argument("--seeds", type=int, default=20000)
    ap.add_argument("--random-tables", type=int, default=200)
    ap.add_argument("--jitter-tables", type=int, default=100)
    ap.add_argument("--out", default=str(ROOT / "results" / "diag_experiment.json"))
    args = ap.parse_args()
    t_start = time.perf_counter()
    spec = D.load_spec(args.table)
    tb = D.table_from_spec(spec)
    control, mis = tb.by_role("control"), tb.by_role("misleading")
    res: dict = {"table": tb.name}

    # ---- the instance ---------------------------------------------------------------------
    res["instance"] = {
        "n_causes": tb.C, "n_nuisance_states": len(tb.nuisances), "nuisance_states": tb.nuisances,
        "n_hidden_states": tb.C * len(tb.nuisances), "n_tests": tb.T, "budget": tb.budget,
        "prior_entropy_nats": D._entropy(tb.prior),
        "causes": dict(zip(tb.causes, tb.prior.tolist())),
        "tests": [{"name": n, "role": tb.roles[t], "cost": float(tb.costs[t]),
                   "outcomes": tb.outcomes[t],
                   "gain_first_step": D.info_gain(tb, tb.joint, t),
                   "gain_per_cost_first_step": D.info_gain(tb, tb.joint, t) / float(tb.costs[t])}
                  for t, n in enumerate(tb.tests)]}
    print(f"{tb.name}: {tb.C} causes x {len(tb.nuisances)} nuisance states, {tb.T} tests, "
          f"budget {tb.budget:g}, H(prior) = {D._entropy(tb.prior):.3f} nats")
    for t in res["instance"]["tests"]:
        print(f"  {t['name']:28s} {t['role']:10s} cost {t['cost']:g}  one-step gain "
              f"{t['gain_first_step']:.4f}  per cost {t['gain_per_cost_first_step']:.4f}")

    # ---- exact results at the table's budget ------------------------------------------------
    dp = D.exact_dp(tb)
    ex = exact_all(tb)
    res["exact"] = ex
    res["dp"] = {"value": dp.value, "n_states": dp.n_states, "n_subsets": dp.n_subsets,
                 "seconds": dp.seconds, "repeats_allowed": False, "stopping_allowed": True,
                 "first_move": tb.tests[dp.policy(tb, tb.joint, (), tb.budget)],
                 "tree": tree_sketch(tb, dp.policy, 2)}
    res["greedy_tree"] = tree_sketch(tb, D.greedy_policy, 2)
    res["greedy_per_cost_tree"] = tree_sketch(tb, D.greedy_per_cost_policy, 2)
    print(f"\nexact DP: value {dp.value:.4f}, {dp.n_states} states in {dp.n_subsets} test "
          f"subsets, {dp.seconds:.2f} s")
    print(f"{'policy':16s} reward  accuracy  tests  control  " + "  ".join(m[:12] for m in mis))
    for k in POLICIES:
        e = ex[k]
        print(f"{k:16s} {e['reward']:.4f}  {e['accuracy']:.3f}    {e['mean_tests']:.2f}   "
              f"{sum(e['usage'][c] for c in control):.2f}     "
              + "          ".join(f"{e['usage'][m]:.2f}" for m in mis))
    print("\nDP decision tree (first two tests):")
    print("\n".join("  " + s for s in res["dp"]["tree"]))

    # ---- paired simulation ------------------------------------------------------------------
    t0 = time.perf_counter()
    pols = {"random": None, "greedy": cached(D.greedy_policy),
            "greedy_per_cost": cached(D.greedy_per_cost_policy),
            "lookahead2": cached(D.lookahead2_policy), "dp": dp.policy}
    sim = simulate(tb, pols, args.seeds)
    pairs = [("dp", "greedy"), ("greedy", "random"), ("dp", "greedy_per_cost"),
             ("dp", "lookahead2"), ("dp", "random")]
    bs = bootstrap(sim["R"], sim["names"], pairs)
    acc = {k: float(sim["A"][:, j].mean()) for j, k in enumerate(sim["names"])}
    agree = {}
    for k in sim["names"]:
        lo, hi = bs["mean"][k]["ci95"]
        agree[k] = bool(lo <= ex[k]["reward"] <= hi)
    for name, d in bs["diff"].items():
        a, b = name.split(" - ")
        d["exact"] = ex[a]["reward"] - ex[b]["reward"]
        d["exact_inside_ci"] = bool(d["ci95"][0] <= d["exact"] <= d["ci95"][1])
    res["simulation"] = {"n_seeds": args.seeds, "salt": SALT, "bootstrap_resamples": 2000,
                         "mean_reward": bs["mean"], "accuracy": acc, "paired_diff": bs["diff"],
                         "exact_inside_ci": agree, "control_usage": sim["control"],
                         "any_misleading_usage": sim["any_misleading"],
                         "seconds": time.perf_counter() - t0}
    print(f"\npaired simulation, {args.seeds} seeds ({res['simulation']['seconds']:.0f} s):")
    for k in sim["names"]:
        m = bs["mean"][k]
        print(f"  {k:16s} {m['mean']:.4f} [{m['ci95'][0]:.4f}, {m['ci95'][1]:.4f}]  exact "
              f"{ex[k]['reward']:.4f}  inside CI: {agree[k]}  acc {acc[k]:.3f} "
              f"(exact {ex[k]['accuracy']:.3f})  any misleading {sim['any_misleading'][k]:.3f}")
    for name, d in bs["diff"].items():
        print(f"  {name:24s} {d['mean']:+.4f} [{d['ci95'][0]:+.4f}, {d['ci95'][1]:+.4f}]  "
              f"exact {d['exact']:+.4f}  inside CI: {d['exact_inside_ci']}")

    # ---- what the control and the misleading tests are worth --------------------------------
    abl = {}
    for label, drop in [("without_control", control), ("without_misleading", mis),
                        ("without_control_and_assays", control + tb.by_role("assay")),
                        ("without_low_value", tb.by_role("low_value"))]:
        if drop:
            abl[label] = {"removed": drop,
                          **{k: v["reward"] for k, v in exact_all(tb.without(drop),
                                                                  lookahead=False).items()}}
    res["ablations"] = abl
    print("\nablations (exact expected reward):")
    for label, a in abl.items():
        print(f"  {label:28s} dp {a['dp']:.4f}  greedy {a['greedy']:.4f}  per-cost "
              f"{a['greedy_per_cost']:.4f}  random {a['random']:.4f}")

    # ---- budget sweep -----------------------------------------------------------------------
    res["budget_sweep"] = []
    print("\nbudget sweep (exact):")
    for b in [tb.budget - 2, tb.budget - 1, tb.budget, tb.budget + 1, tb.budget + 2]:
        e = exact_all(tb, b)
        row = {"budget": b, **{k: e[k]["reward"] for k in POLICIES},
               "mean_tests": {k: e[k]["mean_tests"] for k in POLICIES},
               "dp_states": e["dp"]["n_states"], "dp_seconds": e["dp"]["seconds"],
               "dp_control": sum(e["dp"]["usage"][c] for c in control),
               "dp_misleading": {m: e["dp"]["usage"][m] for m in mis},
               "greedy_control": sum(e["greedy"]["usage"][c] for c in control)}
        res["budget_sweep"].append(row)
        print(f"  B={b:g}: " + "  ".join(f"{k} {row[k]:.3f}" for k in POLICIES)
              + f"  | dp tests {row['mean_tests']['dp']:.2f} states {row['dp_states']}")

    # ---- random tables ----------------------------------------------------------------------
    t0 = time.perf_counter()
    rng = np.random.default_rng(20261114)
    rows = [table_row(D.random_table(rng)) for _ in range(args.random_tables)]
    res["random_tables"] = {"generator": "bayesenv.diag.random_table, seed 20261114",
                            **family_stats(rows), "rows": rows,
                            "seconds": time.perf_counter() - t0}
    rng = np.random.default_rng(20261116)
    t0 = time.perf_counter()
    rows = [table_row(D.random_table(rng, instrument_effect="noise"))
            for _ in range(args.random_tables)]
    res["random_tables_noise_only"] = {
        "generator": "bayesenv.diag.random_table(instrument_effect='noise'), seed 20261116",
        **family_stats(rows), "rows": rows, "seconds": time.perf_counter() - t0}
    rng = np.random.default_rng(20261115)
    t0 = time.perf_counter()
    rows = [table_row(D.table_from_spec(D.jitter_spec(spec, rng, 0.35)))
            for _ in range(args.jitter_tables)]
    res["jittered_tables"] = {"generator": "bayesenv.diag.jitter_spec(low_yield, scale 0.35), "
                                           "seed 20261115",
                              **family_stats(rows), "rows": rows,
                              "seconds": time.perf_counter() - t0}
    for fam in ("random_tables", "random_tables_noise_only", "jittered_tables"):
        f = res[fam]
        print(f"\n{fam}: {f['n_tables']} tables ({f['seconds']:.0f} s); mean reward "
              + "  ".join(f"{k} {v:.3f}" for k, v in f["mean_reward"].items()))
        for key in ("dp_minus_greedy", "dp_minus_greedy_per_cost", "dp_minus_best_greedy",
                    "greedy_minus_random"):
            s = f[key]
            print(f"  {key:26s} mean {s['mean']:+.4f}  median {s['median']:+.4f}  p10 "
                  f"{s['p10']:+.4f}  p90 {s['p90']:+.4f}  max {s['max']:+.4f}  >0.05: "
                  f"{s['share_gt_0.05']:.0%}  <0.005: {s['share_lt_0.005']:.0%}")
        print(f"  DP runs the control with probability {f['dp_control_usage_mean']:.2f} on "
              f"average; greedy {f['greedy_control_usage_mean']:.2f}; greedy below random on "
              f"{f['share_greedy_below_random']:.0%} of tables")

    res["total_seconds"] = time.perf_counter() - t_start
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(f"\nwrote {out} ({res['total_seconds']:.0f} s)")


if __name__ == "__main__":
    main()
