"""E4 data: chat-format fine-tuning sets from the environment.

    python experiments/make_sft_data.py --oracle-seeds 1000:1600 --rft-from results/e3.jsonl \
        --rft-model gemma-4-26b-a4b-it --rft-min-seed 50 --rft-top 0.3 --out results/sft

Two sources, both on seeds disjoint from the evaluation seeds (0-49):
  * oracle   - Bayesian reference runs (EIG-greedy designs + exact posterior predictions),
               rendered in the same text protocol the LLM agents use. Imitation of the
               Bayes-optimal scientist.
  * rft      - rejection-sampling fine-tuning: the top fraction of a model's own rollouts by
               Bayesian reward ("fine-tune a smaller model on the experience").
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bayesenv.bayes import Posterior  # noqa: E402
from bayesenv.llm_agent import system_prompt  # noqa: E402
from bayesenv.task import Task  # noqa: E402


def fmt_design(env, x) -> str:
    x = np.asarray(x)
    return json.dumps([int(v) for v in x] if env.name == "hyperbolic" else [round(float(v), 2) for v in x])


def oracle_conversation(env_name: str, seed: int) -> dict:
    task = Task(env_name, seed)
    ep = task.episode()
    env = task.env
    post = Posterior(env, np.random.default_rng([seed, 1]), n=20_000)
    msgs = [{"role": "system", "content": system_prompt(task)},
            {"role": "user", "content": "Begin. Run your first experiment."}]
    while ep.remaining:
        x = env.validate(post.best_design())
        if env.name == "hyperbolic":
            x = np.round(x)
        y = ep.observe(x)
        post.update(x, y)
        mean_note = ""
        if env.family == "gaussian":
            m = post.sample(2000).mean(0)
            mean_note = f" Current posterior mean of the source: [{m[0]:.2f}, {m[1]:.2f}]."
        msgs.append({"role": "assistant", "content":
                     f"I pick the design with the highest expected information gain given the data so far."
                     f"{mean_note}\n<observe>{fmt_design(env, x)}</observe>"})
        res = f"{y:g}" if env.family == "gaussian" else f"{int(y)}"
        msgs.append({"role": "user", "content": f"Result: {res}. Experiments remaining: {ep.remaining}."})
    eval_x = ep.finish()
    msgs.append({"role": "user", "content":
                 f"The experiment phase is over. Predict for these {len(eval_x)} designs, in order: "
                 f"{json.dumps(np.round(eval_x, 3).tolist())}\nAnswer with the JSON list only."})
    pred = post.predictive(eval_x)
    ans = (np.round(pred["p"], 3).tolist() if env.family == "bernoulli"
           else np.round(np.stack([pred["mean"], pred["sd"]], 1), 3).tolist())
    msgs.append({"role": "assistant", "content": json.dumps(ans)})
    return {"messages": msgs, "source": "oracle", "env": env_name, "seed": seed}


def rft_conversations(path: str, model: str, min_seed: int, top: float,
                      relabel: bool = False) -> list[dict]:
    rows = [json.loads(l) for l in open(path)]
    rows = [r for r in rows if r["model"] == model and r["seed"] >= min_seed and r["parsed"]]
    out = []
    for env_name in sorted({r["env"] for r in rows}):
        rs = sorted([r for r in rows if r["env"] == env_name], key=lambda r: -r["bayes_raw"])
        keep = rs[: max(1, int(len(rs) * top))]
        for r in keep:
            task = Task(env_name, r["seed"])
            msgs = [{"role": "system", "content": system_prompt(task)},
                    {"role": "user", "content": "Begin. Run your first experiment."}]
            # Rebuild the dialogue from the transcript and logged outcomes.
            t = r["transcript"]
            for i, y in enumerate(r["outcomes"]):
                msgs.append({"role": "assistant", "content": t[i]})
                res = f"{y:g}" if task.env.family == "gaussian" else f"{int(y)}"
                msgs.append({"role": "user", "content":
                             f"Result: {res}. Experiments remaining: {task.budget - i - 1}."})
            msgs.append({"role": "user", "content":
                         f"The experiment phase is over. Predict for these {task.n_eval} designs, in order: "
                         f"{json.dumps(np.round(task.eval_x, 3).tolist())}\nAnswer with the JSON list only."})
            if relabel:
                # Hindsight Bayesian relabelling: keep the model's own experiments, replace its
                # answer with the exact posterior predictive given ITS OWN observations.
                post = Posterior(task.env, np.random.default_rng([r["seed"], 7]), n=40_000)
                if r["outcomes"]:
                    post.update(np.asarray(r["designs"], float), np.asarray(r["outcomes"], float))
                pred = post.predictive(task.eval_x)
                ans = (np.round(pred["p"], 3).tolist() if task.env.family == "bernoulli"
                       else np.round(np.stack([pred["mean"], pred["sd"]], 1), 3).tolist())
                msgs.append({"role": "assistant", "content": json.dumps(ans)})
            else:
                msgs.append({"role": "assistant", "content": t[-1]})
            out.append({"messages": msgs, "source": "relabel" if relabel else "rft", "env": env_name,
                        "seed": r["seed"], "bayes_raw": r["bayes_raw"]})
    return out


def main(a) -> None:
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lo, hi = map(int, a.oracle_seeds.split(":"))
    with (out / "oracle.jsonl").open("w") as f:
        for env_name in ("hyperbolic", "location"):
            for s in range(lo, hi):
                f.write(json.dumps(oracle_conversation(env_name, s)) + "\n")
    print(f"oracle: {2 * (hi - lo)} conversations")
    if a.rft_from:
        conv = rft_conversations(a.rft_from, a.rft_model, a.rft_min_seed, a.rft_top)
        with (out / "rft.jsonl").open("w") as f:
            for c in conv:
                f.write(json.dumps(c) + "\n")
        print(f"rft: {len(conv)} conversations")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--oracle-seeds", default="1000:1600")
    p.add_argument("--rft-from", default="")
    p.add_argument("--rft-model", default="gemma-4-26b-a4b-it")
    p.add_argument("--rft-min-seed", type=int, default=50)
    p.add_argument("--rft-top", type=float, default=0.3)
    p.add_argument("--out", default="results/sft")
    main(p.parse_args())
