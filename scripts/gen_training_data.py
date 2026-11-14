"""Generate training rows from task specs, locally (CPU, multiprocessing).

    uv run --no-project --with numpy --with scipy --with pyyaml \
        python scripts/gen_training_data.py --specs specs/*.yaml --instances 100 --out data/v1

For a large batch use the Modal fan-out instead (same rows, same files):

    modal run --env 3-sigma-submission experiments/spec_modal.py::gen --instances 400 --out data/v1

Writes <out>/rows.jsonl (schema: docs/TASK_SPEC.md) and <out>/meta.json (counts, throughput,
EIG-label stability). Each (spec, instance k) is the randomised environment `spec:NAME@HASH#k`
with task seed 1000*k + j for j < --seeds-per-instance. Splits: the families in
--heldout-families are `heldout_family`; in the others, instances with k % 10 == 9 are
`heldout_instance`. Stops early at --time-limit seconds (rows written so far are complete).
"""

from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import argparse  # noqa: E402
import json  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from multiprocessing import Pool  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bayesenv import datagen  # noqa: E402
from bayesenv.spec import SPEC_DIR, load_spec  # noqa: E402

DEFAULT_HELDOUT = "item_response,damped_oscillation"
_CFG: dict = {}


def _init(cfg: dict) -> None:
    _CFG.update(cfg)


def work(job: tuple[str, int], cfg: dict | None = None) -> tuple[list[dict], float]:
    cfg = cfg or _CFG
    t0 = time.process_time()
    rows = datagen.instance_rows(job[0], job[1], heldout_families=cfg["heldout"],
                                 designs_per_traj=cfg["designs_per_traj"],
                                 full_info=cfg["full_info"], ref_candidates=cfg["ref_candidates"])
    return rows, time.process_time() - t0


def _stab(job: tuple[str, int]) -> dict:
    return datagen.eig_stability(job[0], job[1], ref_candidates=_CFG["ref_candidates"])


def load_specs(paths) -> list:
    specs = []
    for path in paths:
        p = Path(path).resolve()
        if p.parent != SPEC_DIR.resolve():
            sys.exit(f"{path}: specs are resolved by name from {SPEC_DIR}; set BAYESENV_SPEC_DIR to use another directory")
        specs.append(load_spec(p))
    return specs


def config(specs, heldout_families: str, designs_per_traj: int = 2, no_model_card: bool = False,
           ref_candidates: int = 64) -> dict:
    heldout = [h for h in heldout_families.split(",") if h]
    unknown = set(heldout) - {s.name for s in specs}
    if unknown:
        print(f"warning: held-out families not among the specs: {sorted(unknown)}", file=sys.stderr)
    return {"heldout": heldout, "designs_per_traj": designs_per_traj, "full_info": not no_model_card,
            "ref_candidates": ref_candidates}


def main(a) -> None:
    specs = load_specs(a.specs)
    cfg = config(specs, a.heldout_families, a.designs_per_traj, a.no_model_card, a.ref_candidates)
    meta = {"runner": "local", "specs": {s.name: s.hash for s in specs}, "config": cfg,
            "instances_requested": a.instances, "seeds_per_instance": a.seeds_per_instance, "procs": a.procs}
    with Pool(a.procs, initializer=_init, initargs=(cfg,)) as pool:
        if a.eig_check:
            jobs = [(s.env_name(k), 1000 * k) for k in range(a.eig_check_offset, a.eig_check_offset + a.eig_check) for s in specs]
            meta["eig_stability"] = datagen.stability_summary(pool.map(_stab, jobs, chunksize=1))
        jobs = datagen.make_jobs(specs, a.instances, a.seeds_per_instance)
        meta["tasks_requested"] = len(jobs)
        sink, t0 = datagen.RowSink(a.out), time.time()
        for rows, secs in pool.imap_unordered(work, jobs, chunksize=1):
            sink.add(rows, secs)
            if sink.tasks % 200 == 0:
                print(f"{sink.tasks}/{len(jobs)} tasks, {sink.rows} rows, {time.time() - t0:.0f}s", flush=True)
            if a.time_limit and time.time() - t0 > a.time_limit:
                print(f"time limit reached after {sink.tasks}/{len(jobs)} tasks", flush=True)
                pool.terminate()
                break
    meta = sink.finish(meta, time.time() - t0, a.sample_out, a.sample_rows)
    print(json.dumps({k: v for k, v in meta.items() if k not in ("specs", "config")}, indent=1))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--specs", nargs="+", required=True)
    p.add_argument("--instances", type=int, default=100, help="randomised instances per spec")
    p.add_argument("--seeds-per-instance", type=int, default=1)
    p.add_argument("--out", required=True)
    p.add_argument("--procs", type=int, default=8)
    p.add_argument("--heldout-families", default=DEFAULT_HELDOUT)
    p.add_argument("--designs-per-traj", type=int, default=2)
    p.add_argument("--ref-candidates", type=int, default=64,
                   help="candidate designs per step for the reference trajectory")
    p.add_argument("--no-model-card", action="store_true",
                   help="omit the exact generative model from the prompt (story only)")
    p.add_argument("--eig-check", type=int, default=0, help="states per family for the EIG-label stability check")
    p.add_argument("--eig-check-offset", type=int, default=100_000)
    p.add_argument("--time-limit", type=float, default=0.0)
    p.add_argument("--sample-out", default="")
    p.add_argument("--sample-rows", type=int, default=20)
    main(p.parse_args())
