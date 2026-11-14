"""E1 (grader reliability) + E2 (exploit detection): scripted policies at scale on Modal.

    modal run --env 3-sigma-submission experiments/batch.py --seeds 400 --out results/e12.jsonl

Every (env, policy, seed) episode is graded by the naive BoxingGym-style grader (on the
task's own outcome draw plus NAIVE_REPS independent re-draws, to measure outcome-sampling
noise), the Bayesian grader, and the posterior-predictive ceiling check.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import modal

app = modal.App("bayesenv-batch")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3")
    .add_local_python_source("bayesenv")
)
NAIVE_REPS = 4


@app.function(image=image, cpu=2.0, memory=8192, timeout=3600, retries=1, max_containers=40)
def run_chunk(jobs: list[tuple[str, str, int]]) -> list[dict]:
    import numpy as np

    from bayesenv.policies import POLICIES
    from bayesenv.task import Task, grade, naive_reward

    rows = []
    for env_name, policy, seed in jobs:
        t0 = time.time()
        task = Task(env_name, seed)
        ep = task.episode()
        pred = POLICIES[policy](ep)
        row = {"env": env_name, "policy": policy, "seed": seed}
        row.update(grade(task, ep, pred))
        rng = np.random.default_rng([seed, 0x5EED])
        own_y = task.eval_y
        for r in range(NAIVE_REPS):
            task.eval_y = task.env.simulate(task.eval_x, task.theta, rng)
            row[f"naive_rep{r}"] = naive_reward(task, pred)["naive_reward"]
        task.eval_y = own_y
        row["secs"] = round(time.time() - t0, 2)
        rows.append(row)
    return rows


@app.local_entrypoint()
def main(seeds: int = 400, out: str = "results/e12.jsonl", chunk: int = 10, seed0: int = 0,
         envs: str = "hyperbolic,location", policies: str = ""):
    from bayesenv.policies import POLICIES

    pols = policies.split(",") if policies else list(POLICIES)
    jobs = [(e, p, s) for e in envs.split(",") for p in pols
            for s in range(seed0, seed0 + seeds)]
    chunks = [jobs[i:i + chunk] for i in range(0, len(jobs), chunk)]
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(out, "a") as f:
        for rows in run_chunk.map(chunks, order_outputs=False):
            for r in rows:
                f.write(json.dumps(r) + "\n")
            n += len(rows)
            if n % 500 < chunk:
                print(f"{n}/{len(jobs)} episodes")
    print(f"done: {n} episodes -> {out}")
