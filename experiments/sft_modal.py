"""Generate Bayesian-reference demonstration conversations at scale on Modal.

    modal run --env 3-sigma-submission experiments/sft_modal.py --lo 1000 --hi 1600 --out results/sft/oracle.jsonl
"""

from __future__ import annotations

import json
from pathlib import Path

import modal

app = modal.App("bayesenv-sft-data")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3", "openai", "anthropic")
    .add_local_python_source("bayesenv", "experiments")
)


@app.function(image=image, cpu=2.0, memory=4096, timeout=3600, retries=1, max_containers=40)
def make(jobs: list[tuple[str, int]]) -> list[dict]:
    from experiments.make_sft_data import oracle_conversation
    return [oracle_conversation(e, s) for e, s in jobs]


@app.local_entrypoint()
def main(lo: int = 1000, hi: int = 1600, out: str = "results/sft/oracle.jsonl", chunk: int = 8):
    jobs = [(e, s) for e in ("hyperbolic", "location") for s in range(lo, hi)]
    chunks = [jobs[i:i + chunk] for i in range(0, len(jobs), chunk)]
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(out, "w") as f:
        for convs in make.map(chunks, order_outputs=False):
            for c in convs:
                f.write(json.dumps(c) + "\n")
            n += len(convs)
    print(f"done: {n} conversations -> {out}")
