"""Modal CPU fan-out for scripts/gen_lab_rows.py (same rows, same files).

    modal run --env 3-sigma-submission experiments/lab_rows_modal.py::gen --rows 400 \
        --wetlab-rows 200 --out data/lab_transfer --sample-out data/lab_transfer/sample_rows.jsonl
    modal run --env 3-sigma-submission experiments/lab_rows_modal.py::stab --states 24

Ephemeral app (`modal run` only: nothing is deployed, no GPU, no secrets). One remote call per part
of a (lab, source, depth) cell (bayesenv.lab_rows.cell_jobs); each calls generate_part, whose
seeds depend only on the cell and the part, so the output is identical to the local runner's.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App("bayesenv-lab-rows")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3", "pyyaml==6.0.2")
    .env({"OMP_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "2"})
    .add_local_python_source("bayesenv")
    .add_local_dir(str(ROOT / "specs"), "/root/specs")
)


@app.function(image=image, cpu=2.0, memory=8192, timeout=3600, retries=1, max_containers=40)
def part_rows(lab: str, source: str, depth: int, n: int, part: int) -> tuple[list[dict], float]:
    from bayesenv import lab_rows

    t0 = time.time()
    return lab_rows.generate_part(lab, source, depth, n, part), time.time() - t0


@app.function(image=image, cpu=2.0, memory=8192, timeout=3600, retries=1, max_containers=40)
def stab_state(seed: int, source: str, depth: int) -> dict | None:
    from bayesenv import lab_rows

    return lab_rows.wet_stability(seed, source, depth)


@app.local_entrypoint()
def stab(states: int = 24, out: str = "data/lab_transfer/wetlab_stability.json"):
    """Re-estimate the wet-lab labels of `states` states (fresh seeds, all depths, both sources)."""
    sys.path.insert(0, str(ROOT))
    import numpy as np

    from bayesenv import lab_rows

    jobs = [(lab_rows.SEED_BASE["wetlab"] + 900_000 + k, lab_rows.SOURCES[k % 2], (k // 2) % 4)
            for k in range(states)]
    res = [r for r in stab_state.starmap(jobs) if r is not None]
    agg = {"states": len(res), "reps": 4, "estimator": [lab_rows.WET_REPS, lab_rows.WET_NSIM],
           **{f"{tag}_{k}": round(float(np.mean([r[tag][k] for r in res])), 4)
              for tag in ("same", "indep") for k in res[0]["same"]}}
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps({"summary": agg, "states": res}, indent=1) + "\n")
    print(json.dumps(agg, indent=1))


@app.local_entrypoint()
def gen(rows: int = 400, wetlab_rows: int = 200, labs: str = "chem,diag,dag,wetlab", out: str = "data/lab_transfer",
        sample_out: str = ""):
    sys.path.insert(0, str(ROOT))
    from bayesenv import lab_rows

    jobs = [j for lab in labs.split(",") if lab
            for j in lab_rows.cell_jobs(lab, lab_rows.per_cell(lab, wetlab_rows if lab == "wetlab" else rows))]
    t0, res, csec = time.time(), [], 0.0
    for rs, secs in part_rows.starmap(jobs, order_outputs=False):
        res += rs
        csec += secs
        print(f"{len(res)} rows, {time.time() - t0:.0f}s", flush=True)
    meta = lab_rows.write_output(
        res, out, {"runner": "modal:bayesenv-lab-rows::gen", "rows_per_lab_requested": rows, "wetlab_rows_requested": wetlab_rows,
                   "container_seconds": round(csec, 1), "cpu_per_container": 2,
                   "wall_seconds": round(time.time() - t0, 1)}, sample_out)
    print(json.dumps(meta["labs"], indent=1))
