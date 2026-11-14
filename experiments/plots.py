"""ArviZ figures for the report.

    python experiments/plots.py   # reads results/*.jsonl, writes results/fig_*.png + e3_summary.json

fig_e1_forest_<env>.png   per-policy reward distributions under the naive vs Bayesian grader
fig_e2_ppc_ecdf_<env>.png ECDF of posterior-predictive-check p-values with simultaneous 95%
                          bands: honest policies should stay inside the uniform band,
                          information-leaking cheaters should fall far outside it
fig_e3_decomp_<env>.png   LLM agents: score vs the exact posterior on their own data (inference
                          loss) vs the Bayesian reference (design loss)
"""

from __future__ import annotations

import json
from pathlib import Path

import arviz as az
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy import stats  # noqa: E402

R = Path("results")
ORDER = ["bayes_oracle", "random_design", "stop_early", "overconfident", "nearest_neighbour",
         "constant_hedge", "do_nothing", "leaky_30pct", "leaky_full"]


def e12(df: pd.DataFrame, ppc_df: pd.DataFrame | None) -> None:
    for env, g in df.groupby("env"):
        base = g[g.policy == "do_nothing"].set_index("seed")["naive_reward"]
        g = g.assign(naive_bs=g.naive_reward - g.seed.map(base))
        fig, axes = plt.subplots(1, 2, figsize=(12, 5.5), sharey=True)
        for ax, (col, title) in zip(axes, [("naive_bs", "BoxingGym-style grader\n(accuracy / rel. MSE, minus do-nothing)"),
                                            ("bayes_reward", "Bayesian grader\n(normalised expected log score)")]):
            data = {p: g[g.policy == p].sort_values("seed")[col].to_numpy()[None, :] for p in ORDER}
            az.plot_forest(az.from_dict(posterior=data), combined=True, hdi_prob=0.9, ax=ax,
                           colors="C0" if col == "bayes_reward" else "C3")
            ax.set_title(title)
            ax.axvline(0, color="k", lw=0.8, ls=":")
        fig.suptitle(f"E1 [{env}]: per-seed reward, 90% interval across {g.seed.nunique()} seeds")
        fig.tight_layout()
        fig.savefig(R / f"fig_e1_forest_{env}.png", dpi=130)
        plt.close(fig)

        src = ppc_df[ppc_df.env == env] if ppc_df is not None and env in set(ppc_df.env) else g
        fig, ax = plt.subplots(figsize=(7, 5.5))
        az.plot_ecdf(np.linspace(0.0005, 0.9995, 2000), ax=ax, plot_kwargs={"color": "0.7", "ls": "--"})
        honest = src[~src.policy.str.startswith("leaky")].ppc_p.to_numpy().copy()
        az.plot_ecdf(honest, cdf=stats.uniform(0, 1).cdf, confidence_bands=True, ax=ax,
                     plot_kwargs={"color": "C0", "label": f"honest policies (n={len(honest)})"},
                     fill_kwargs={"color": "C0", "alpha": 0.15})
        for p, c in [("leaky_30pct", "C1"), ("leaky_full", "C3")]:
            v = g[g.policy == p].ppc_p.to_numpy().copy()
            az.plot_ecdf(v, ax=ax, plot_kwargs={"color": c, "label": f"{p} (n={len(v)})"})
        ax.set_xlabel("posterior predictive check p-value")
        ax.set_ylabel("ECDF")
        ax.set_title(f"E2 [{env}]: information-leak check (uniform = honest)")
        ax.legend(loc="lower right")
        fig.tight_layout()
        fig.savefig(R / f"fig_e2_ppc_ecdf_{env}.png", dpi=130)
        plt.close(fig)


def e3(rows: pd.DataFrame, ref: pd.DataFrame) -> dict:
    """Loss decomposition per model and env (evaluation seeds only)."""
    out = {}
    for env, g in rows.groupby("env"):
        oracle = ref[(ref.env == env) & (ref.policy == "bayes_oracle")].set_index("seed")["bayes_raw"]
        g = g[g.seed < 50].assign(oracle=lambda d: d.seed.map(oracle))
        summ = g.groupby("model").agg(
            n=("seed", "size"), parsed=("parsed", "mean"), n_obs=("n_obs", "mean"),
            naive=("naive_reward", "mean"), bayes=("bayes_reward", "mean"),
            agent_raw=("bayes_raw", lambda s: np.clip(s, -1, None).mean()),
            post_own=("bayes_raw_post_own", "mean"), oracle=("oracle", "mean"),
            ppc_flag=("ppc_p", lambda s: (s < 0.05).mean()),
            tok_out=("out", "mean")).round(3)
        summ["inference_loss"] = (summ.post_own - summ.agent_raw).round(3)
        summ["design_loss"] = (summ.oracle - summ.post_own).round(3)
        out[env] = summ.to_dict("index")
        models = list(summ.sort_values("bayes").index)
        fig, ax = plt.subplots(figsize=(8, 0.6 * len(models) + 2))
        y = np.arange(len(models))
        ax.barh(y, summ.loc[models, "oracle"], color="0.85", label="Bayesian reference (oracle)")
        ax.barh(y, summ.loc[models, "post_own"], color="C0", alpha=0.6,
                label="exact posterior on the agent's own data")
        ax.barh(y, summ.loc[models, "agent_raw"].clip(lower=0), color="C3", label="agent's own predictions")
        ax.set_yticks(y, models)
        ax.set_xlabel("normalised expected log score (0 = prior, 1 = knowing the truth)")
        ax.set_title(f"E3 [{env}]: design loss (grey->blue) vs inference loss (blue->red)")
        ax.legend(loc="lower right", fontsize=8)
        fig.tight_layout()
        fig.savefig(R / f"fig_e3_decomp_{env}.png", dpi=130)
        plt.close(fig)
    return out


def main() -> None:
    df = pd.read_json(R / "e12.jsonl", lines=True)
    ppc2 = R / "e2_location_v2.jsonl"
    ppc_df = pd.read_json(ppc2, lines=True) if ppc2.exists() else None
    e12(df, ppc_df)
    if (R / "e3.jsonl").exists():
        rows = pd.read_json(R / "e3.jsonl", lines=True)
        summary = e3(rows, df)
        (R / "e3_summary.json").write_text(json.dumps(summary, indent=1))
        for env, s in summary.items():
            print(f"\n=== E3 {env} ===")
            print(pd.DataFrame(s).T.to_string())


if __name__ == "__main__":
    main()
