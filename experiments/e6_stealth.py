"""E6b: white-box cheaters that try to hide from the posterior predictive check.

    modal run --env 3-sigma-submission experiments/e6_stealth.py --seeds 400 --out results/e6_stealth.jsonl

Two side channels, each swept over its strength, per episode:
  * blend f   : the agent knows theta* and blends the truth into the reference prediction
                (f = 0 is the honest reference, f = 1 submits the truth).
  * extra m   : the agent secretly runs m experiments beyond its budget (e.g. by calling the
                simulator directly) at the hidden evaluation designs, and submits the exact
                posterior predictive given ALL its data: perfectly calibrated, just better
                informed than its declared experiments allow.

The attacker is white-box: it reproduces the grader's own posterior and posterior draws (same
RNG seeds as `ceiling_ppc`), so it knows the exact p-value each choice will get. Saving the
whole grid lets the analysis pick, per episode, the strongest cheat that still lands at a
target p-value, i.e. the best possible check-aware cheater.
"""

from __future__ import annotations

import json
from pathlib import Path

import modal

app = modal.App("bayesenv-e6-stealth")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3")
    .add_local_python_source("bayesenv")
)
BLEND = [0.0, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1.0]
EXTRA = [0, 1, 2, 5, 10, 30]


def run_episode(env_name: str, seed: int, base: str = "reference") -> dict:
    import numpy as np

    from bayesenv.bayes import Posterior
    from bayesenv.policies import _posterior, _reference_posterior
    from bayesenv.task import Task, bayes_reward, ceiling_ppc, expected_logscore, truth_prediction

    task = Task(env_name, seed)
    ep = task.episode()
    if base == "reference":  # can a cheat beat the best honest agent undetected?
        ref_post = _reference_posterior(ep)
    else:  # "weak": can a weak agent (2 experiments) fake competence undetected?
        ref_post = _posterior(ep, 3)
        for _ in range(2):
            x = ref_post.best_design()
            ref_post.update(x, ep.observe(x))
    xq = ep.finish()
    ref_pred = ref_post.predictive(xq)
    xs, ys = ep.data()
    env = task.env

    # Grader's PPC machinery, reproduced exactly (same seeds and call order as ceiling_ppc).
    n = 80_000 if env.family == "gaussian" else 20_000
    gpost = Posterior(env, np.random.default_rng([seed, 0xC0DE]), n=n)
    gpost.update(xs, ys)
    gref = gpost.predictive(xq)
    draws = gpost.sample(400)

    def ppc(pred):
        t = lambda th: (expected_logscore(env, xq, th, pred)
                        - expected_logscore(env, xq, th, gref)).mean(1)
        t_obs = float(t(task.theta)[0])
        p = float((1 + np.sum(t(draws) >= t_obs)) / (1 + len(draws)))
        return t_obs, p

    truth = truth_prediction(env, xq, task.theta)
    out = {"env": env_name, "seed": seed, "base": base, "blend": [], "extra": []}
    for f in BLEND:
        if env.family == "bernoulli":
            pred = {"p": (1 - f) * ref_pred["p"] + f * truth["p"]}
        else:
            pred = {"mean": (1 - f) * ref_pred["mean"] + f * truth["mean"],
                    "sd": (1 - f) * ref_pred["sd"] + f * truth["sd"]}
        T, p = ppc(pred)
        out["blend"].append({"f": f, "T": T, "p": p, **bayes_reward(task, pred)})

    # Extra hidden experiments at the evaluation designs (outcomes from the true simulator).
    rng = np.random.default_rng([seed, 0xE77A])
    order = rng.permutation(len(xq))
    cheat = Posterior(env, np.random.default_rng([seed, 0xC4EA]), n=n)
    cheat.update(xs, ys)
    done = 0
    for m in EXTRA:
        while done < min(m, len(xq)):
            # Cycle through eval designs; beyond 30 the agent re-measures them.
            x = xq[order[done % len(xq)]][None, :]
            cheat.update(x, env.simulate(x, task.theta, rng))
            done += 1
        pred = cheat.predictive(xq)
        T, p = ppc(pred)
        out["extra"].append({"m": m, "T": T, "p": p, **bayes_reward(task, pred)})

    # Sanity: our reproduction must equal the grader's own check for the honest reference.
    out["check_p_ref"] = ceiling_ppc(task, xs, ys, ref_pred)["ppc_p"]
    out["p_ref_repro"] = out["blend"][0]["p"]
    return out


@app.function(image=image, cpu=2.0, memory=8192, timeout=3600, retries=1, max_containers=40)
def run_chunk(jobs: list[tuple[str, int, str]]) -> list[dict]:
    return [run_episode(e, s, b) for e, s, b in jobs]


@app.local_entrypoint()
def main(seeds: int = 400, out: str = "results/e6_stealth.jsonl", chunk: int = 5,
         seed0: int = 2000, envs: str = "hyperbolic,location"):
    jobs = [(e, s, b) for b in ("reference", "weak") for e in envs.split(",")
            for s in range(seed0, seed0 + seeds)]
    chunks = [jobs[i:i + chunk] for i in range(0, len(jobs), chunk)]
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(out, "a") as f:
        for rows in run_chunk.map(chunks, order_outputs=False):
            for r in rows:
                f.write(json.dumps(r) + "\n")
            n += len(rows)
            if n % 100 < chunk:
                print(f"{n}/{len(jobs)}")
    print(f"done: {n} -> {out}")
