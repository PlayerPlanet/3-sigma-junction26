"""Wetlab calibration on Modal (CPU only): the reference against 'coder_adaptive' (adaptive
design + inference with a deterministic ODE surrogate, no stochastic simulation; see
bayesenv/wetlab_baselines.py), paired on the same seeds and salt as scripts/wetlab_calibrate.py.

    modal run --env 3-sigma-submission experiments/wetlab_modal.py --seeds 300

Per-seed rows are appended to a local JSONL; the summary (bootstrap CIs) is written to
results/wetlab_calibration_adaptive.json. Each container builds the ODE table once (~minutes).
"""

import json
import time
from pathlib import Path

import modal

app = modal.App("bayesenv-wetlab-calibration")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3")
    .add_local_python_source("bayesenv")
)
SALT = "calibration"


def run_seed(seed: int) -> dict:
    from bayesenv import wetlab as W
    from bayesenv import wetlab_baselines as WB
    t0 = time.perf_counter()
    table = WB.grid_table()
    t1 = time.perf_counter()
    ref = W.run_policy("reference", seed, SALT).result
    t2 = time.perf_counter()
    lab, q = WB.run_coder_adaptive(seed, SALT, table)
    t3 = time.perf_counter()
    r = lab.submit(q, reference=False, diagnostics=True)
    return {"seed": seed, "hidden": r["hidden"], "ref_reward": ref["reward"],
            "ref_accuracy": ref["accuracy"], "reward": r["reward"], "accuracy": r["accuracy"],
            "sbi_on_its_data": r["approx_design"], "n_runs": r["n_runs"],
            "table_s": t1 - t0, "ref_s": t2 - t1, "adaptive_s": t3 - t2}


@app.function(image=image, cpu=2.0, memory=4096, timeout=3600, retries=1, max_containers=40)
def run_chunk(seeds: list[int]) -> list[dict]:
    return [run_seed(s) for s in seeds]


@app.local_entrypoint()
def main(seeds: int = 300, chunk: int = 15, out: str = "results/wetlab_adaptive.jsonl",
         summary: str = "results/wetlab_calibration_adaptive.json"):
    import numpy as np
    chunks = [list(range(i, min(i + chunk, seeds))) for i in range(0, seeds, chunk)]
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    rows = []
    t0 = time.time()
    with open(out, "a") as f:
        for part in run_chunk.map(chunks, order_outputs=False):
            for r in part:
                f.write(json.dumps(r) + "\n")
            rows += part
            print(f"{len(rows)}/{seeds}")
    rows.sort(key=lambda r: r["seed"])
    rng = np.random.default_rng(0)

    def ci(x):
        x = np.asarray(x, float)
        m = x[rng.integers(0, len(x), (5000, len(x)))].mean(1)
        return [float(np.quantile(m, 0.025)), float(np.quantile(m, 0.975))]

    col = lambda k: np.array([r[k] for r in rows], float)  # noqa: E731
    diff = col("ref_reward") - col("reward")
    acc = col("ref_accuracy") - col("accuracy")
    s = {
        "seeds": len(rows), "salt": SALT, "wall_seconds": round(time.time() - t0, 1),
        "cpu_seconds_in_containers": float((col("table_s") + col("ref_s") + col("adaptive_s")).sum()),
        "reference": {"reward": float(col("ref_reward").mean()), "reward_ci": ci(col("ref_reward")),
                      "accuracy": float(col("ref_accuracy").mean()),
                      "seconds_per_episode": float(col("ref_s").mean())},
        "coder_adaptive": {
            "reward": float(col("reward").mean()), "reward_ci": ci(col("reward")),
            "accuracy": float(col("accuracy").mean()), "accuracy_ci": ci(col("accuracy")),
            "frac_reward_below_minus_2": float((col("reward") < -2).mean()),
            "n_runs": float(col("n_runs").mean()),
            # the SBI posterior on the coder's own data, scored: how good were its designs?
            "sbi_on_its_data_reward": float(col("sbi_on_its_data").mean()),
            "sbi_on_its_data_reward_ci": ci(col("sbi_on_its_data"))},
        "reference_minus_coder_adaptive": {
            "mean": float(diff.mean()), "ci": ci(diff), "accuracy_diff": float(acc.mean()),
            "accuracy_diff_ci": ci(acc), "reference_wins_frac": float((diff > 0).mean())},
        "coder_adaptive_minus_sbi_on_same_data": {
            "mean": float((col("reward") - col("sbi_on_its_data")).mean()),
            "ci": ci(col("reward") - col("sbi_on_its_data"))},
    }
    Path(summary).write_text(json.dumps(s, indent=2))
    print(json.dumps(s, indent=2))
