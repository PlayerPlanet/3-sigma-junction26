"""Analyse E1 (grader reliability) and E2 (exploit detection) from results/e12.jsonl.

    python experiments/analyze_e12.py results/e12.jsonl results/e12_summary.json
"""

from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd
from scipy import stats

HONEST = ["bayes_oracle", "random_design", "do_nothing", "stop_early", "constant_hedge",
          "overconfident", "nearest_neighbour"]
CHEATS = ["leaky_full", "leaky_30pct"]


def seeds_needed(a: np.ndarray, b: np.ndarray, alpha=0.05, power=0.8) -> float:
    """Paired seeds needed to detect mean(a) > mean(b) (one-sided z approx)."""
    d = a - b
    if d.mean() <= 0:
        return float("inf")
    z = stats.norm.ppf(1 - alpha) + stats.norm.ppf(power)
    return float(np.ceil((z * d.std(ddof=1) / d.mean()) ** 2))


def main(path: str, out: str) -> None:
    df = pd.read_json(path, lines=True)
    reps = [c for c in df.columns if c.startswith("naive_rep")]
    # BoxingGym-style baseline subtraction: naive score minus the do-nothing policy's naive
    # score on the same seed and the same outcome draw (paired).
    base = df[df.policy == "do_nothing"].set_index(["env", "seed"])
    for c in ["naive_reward"] + reps:
        df[c + "_bs"] = df[c] - df.set_index(["env", "seed"]).index.map(base[c]).values
    summary: dict = {}
    for env, g in df.groupby("env"):
        s = {}
        # E1a: mean reward per policy under each grader
        s["means"] = g.groupby("policy")[["naive_reward", "naive_reward_bs", "bayes_reward",
                                          "bayes_raw"]].mean().round(4).to_dict("index")
        # E1b: outcome-sampling noise of the naive grader (same predictions, re-drawn outcomes)
        s["naive_outcome_noise_sd"] = float(g[reps].std(axis=1).mean())
        # E1c: test-retest reliability across policies (rank correlation of per-episode scores
        # between two independent outcome draws). Bayes has no outcome draw: reliability 1.
        s["naive_test_retest_r"] = float(stats.spearmanr(g[reps[0]], g[reps[1]]).statistic)
        # E1d: seeds needed to show reference > X with each grader
        piv = {c: g.pivot(index="seed", columns="policy", values=c)
               for c in ["naive_rep0_bs", "bayes_reward"]}
        s["seeds_needed"] = {
            f"bayes_oracle>{p}": {
                "naive_bs": seeds_needed(piv["naive_rep0_bs"]["bayes_oracle"].values,
                                         piv["naive_rep0_bs"][p].values),
                "bayes": seeds_needed(piv["bayes_reward"]["bayes_oracle"].values,
                                      piv["bayes_reward"][p].values),
            } for p in ["random_design", "stop_early", "overconfident", "nearest_neighbour"]}
        # E1e: rubric checks: does anything beat the reference? does doing nothing score?
        ref_n, ref_b = s["means"]["bayes_oracle"]["naive_reward"], s["means"]["bayes_oracle"]["bayes_reward"]
        s["beats_or_ties_reference"] = {
            "naive": [p for p in HONEST if p != "bayes_oracle" and s["means"][p]["naive_reward"] >= ref_n - 1e-9],
            "bayes": [p for p in HONEST if p != "bayes_oracle" and s["means"][p]["bayes_reward"] >= ref_b - 1e-9],
        }
        # E2: ceiling PPC. Honest p-values should be ~Uniform(0,1); cheats should be small.
        ppc = {}
        for p in HONEST + CHEATS:
            pv = g[g.policy == p].ppc_p.values
            ppc[p] = {"flag_rate@0.05": float(np.mean(pv < 0.05)),
                      "flag_rate@0.01": float(np.mean(pv < 0.01)),
                      "ks_uniform_p": float(stats.kstest(pv, "uniform").pvalue),
                      "fisher_p_50eps": float(np.median([
                          stats.combine_pvalues(np.random.default_rng(i).choice(pv, 50), method="fisher").pvalue
                          for i in range(200)]))}
        s["ppc"] = ppc
        summary[env] = s
    with open(out, "w") as f:
        json.dump(summary, f, indent=1, default=float)
    for env, s in summary.items():
        print(f"\n=== {env} ===")
        print(pd.DataFrame(s["means"]).T.round(3).to_string())
        print("naive outcome-noise sd:", round(s["naive_outcome_noise_sd"], 4),
              "| naive test-retest r:", round(s["naive_test_retest_r"], 3))
        print("seeds needed:", json.dumps(s["seeds_needed"]))
        print("ties/beats reference:", s["beats_or_ties_reference"])
        print(pd.DataFrame(s["ppc"]).T.round(3).to_string())


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
