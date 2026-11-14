"""Modal CPU fan-out for the spec work: reference sweep, EIG-label stability, data generation.

    R="modal run --env 3-sigma-submission"        # (uv run --with modal --with numpy --with scipy --with pyyaml ...)
    $R experiments/spec_modal.py::sweep --seeds 200
    $R experiments/spec_modal.py::stab  --states 20
    $R experiments/spec_modal.py::gen   --instances 400 --out data/v1 --sample-out data/sample_rows.jsonl
    $R experiments/spec_modal.py::tests

Ephemeral app (`modal run` only: nothing is deployed, no GPU, no secrets). The remote functions
call exactly the code the local runners call (experiments/spec_sweep.py::run_seed,
bayesenv/datagen.py), so local and Modal results are the same rows. Every chunk reports its own
wall time; the sum is printed as container-seconds (2 CPUs each; excludes start-up and idle).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App("bayesenv-spec")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3", "pyyaml==6.0.2", "pytest==8.3.4")
    .env({"OMP_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "2"})
    .add_local_python_source("bayesenv", "experiments")
    .add_local_dir(str(ROOT / "specs"), "/root/specs")
    .add_local_dir(str(ROOT / "tests"), "/root/tests")
)
KW = dict(image=image, cpu=2.0, memory=8192, timeout=3600, retries=1, max_containers=40)
DEFAULT_HELDOUT = "item_response,damped_oscillation"


@app.function(**KW)
def sweep_chunk(jobs: list[tuple[str, int]]) -> tuple[list[dict], float]:
    from experiments.spec_sweep import run_seed

    t0 = time.time()
    return [r for job in jobs for r in run_seed(tuple(job))], time.time() - t0


@app.function(**KW)
def gen_chunk(jobs: list[tuple[str, int]], cfg: dict) -> tuple[list[tuple[list[dict], float]], float]:
    from bayesenv import datagen

    t0, out = time.time(), []
    for env_name, seed in jobs:
        t1 = time.time()  # wall time of the 2-CPU container, not process time
        rows = datagen.instance_rows(env_name, seed, heldout_families=cfg["heldout"],
                                     designs_per_traj=cfg["designs_per_traj"],
                                     full_info=cfg["full_info"], ref_candidates=cfg["ref_candidates"])
        out.append((rows, time.time() - t1))
    return out, time.time() - t0


@app.function(**KW)
def stab_chunk(jobs: list[tuple[str, int]], ref_candidates: int) -> tuple[list[dict], float]:
    from bayesenv import datagen

    t0 = time.time()
    return [datagen.eig_stability(e, s, ref_candidates=ref_candidates) for e, s in jobs], time.time() - t0


@app.function(**KW)
def run_tests() -> tuple[int, str]:
    import subprocess

    r = subprocess.run([sys.executable, "-m", "pytest", "tests/test_spec.py", "-q", "-p", "no:cacheprovider"],
                       cwd="/root", capture_output=True, text=True)
    return r.returncode, r.stdout[-3000:] + r.stderr[-2000:]


def _chunks(jobs: list, n: int) -> list[list]:
    return [jobs[i:i + n] for i in range(0, len(jobs), n)]


def _specs(names: str):
    sys.path.insert(0, str(ROOT))
    from bayesenv.spec import _load_named, spec_names

    return [_load_named(n) for n in (names.split(",") if names else spec_names())]


@app.local_entrypoint()
def sweep(seeds: int = 200, specs: str = "", seed0: int = 0, chunk: int = 4,
          out: str = "results/spec_sweep.jsonl", summary: str = "results/spec_sweep_summary.json"):
    sp = _specs(specs)
    from experiments.spec_sweep import N_IS, N_PARTICLES, summarise, table

    jobs = [(s.name, k) for k in range(seed0, seed0 + seeds) for s in sp]
    # gaussian episodes cost ~10x bernoulli ones: sort so chunks are homogeneous
    jobs.sort(key=lambda j: next(s.d["family"] for s in sp if s.name == j[0]))
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    t0, rows, csec = time.time(), [], 0.0
    with open(out, "w") as f:
        for rs, secs in sweep_chunk.map(_chunks(jobs, chunk), order_outputs=False):
            csec += secs
            rows += rs
            for r in rs:
                f.write(json.dumps(r) + "\n")
            if len(rows) % 1000 < 5 * chunk:
                print(f"{len(rows)}/{5 * len(jobs)} episodes, {time.time() - t0:.0f}s", flush=True)
    s = summarise(rows)
    meta = {"runner": "modal:bayesenv-spec::sweep", "wall_seconds": round(time.time() - t0, 1),
            "container_seconds": round(csec, 1), "cpu_per_container": 2, "episodes": len(rows),
            "n_particles": N_PARTICLES, "n_is": N_IS}
    Path(summary).write_text(json.dumps({"meta": meta, "families": s}, indent=1))
    print(table(s))
    print(meta)


@app.local_entrypoint()
def stab(states: int = 20, specs: str = "", offset: int = 100_000, ref_candidates: int = 64,
         chunk: int = 2, out: str = "results/spec_eig_stability.json"):
    sp = _specs(specs)
    from bayesenv import datagen

    jobs = [(s.env_name(k), 1000 * k) for k in range(offset, offset + states) for s in sp]
    t0, res, csec = time.time(), [], 0.0
    for rs, secs in stab_chunk.map(_chunks(jobs, chunk), kwargs={"ref_candidates": ref_candidates},
                                   order_outputs=False):
        res += rs
        csec += secs
    agg = datagen.stability_summary(res)
    meta = {"runner": "modal:bayesenv-spec::stab", "reps": 5, "states_per_family": states,
            "eig_k": datagen.EIG_K, "eig_reps": datagen.EIG_REPS, "wall_seconds": round(time.time() - t0, 1),
            "container_seconds": round(csec, 1)}
    Path(out).write_text(json.dumps({"meta": meta, "by_group": agg, "states": res}, indent=1))
    for g, v in agg.items():
        print(f"{g:20s} n={v['states']:3d} single: sd={v['single_reward_sd_mean']:.3f} top1={v['single_top1_agree']:.2f} "
              f"regret={v['single_top1_regret']:.3f} | same: sd={v['same_reward_sd_mean']:.3f} top1={v['same_top1_agree']:.2f} "
              f"rho={v['same_spearman']:.2f} regret={v['same_top1_regret']:.3f} | indep: sd={v['indep_reward_sd_mean']:.3f} "
              f"top1={v['indep_top1_agree']:.2f} rho={v['indep_spearman']:.2f} regret={v['indep_top1_regret']:.3f}")
    print(meta)


@app.local_entrypoint()
def gen(instances: int = 400, specs: str = "", seeds_per_instance: int = 1, out: str = "data/v1",
        heldout_families: str = DEFAULT_HELDOUT, designs_per_traj: int = 2, ref_candidates: int = 64,
        no_model_card: bool = False, chunk: int = 4, sample_out: str = "", sample_rows: int = 20):
    sp = _specs(specs)
    from bayesenv import datagen

    heldout = [h for h in heldout_families.split(",") if h]
    cfg = {"heldout": heldout, "designs_per_traj": designs_per_traj, "full_info": not no_model_card,
           "ref_candidates": ref_candidates}
    jobs = datagen.make_jobs(sp, instances, seeds_per_instance)
    meta = {"runner": "modal:bayesenv-spec::gen", "specs": {s.name: s.hash for s in sp}, "config": cfg,
            "instances_requested": instances, "seeds_per_instance": seeds_per_instance,
            "tasks_requested": len(jobs), "cpu_per_worker": 2}
    sink, t0, csec = datagen.RowSink(out), time.time(), 0.0
    for res, secs in gen_chunk.map(_chunks(jobs, chunk), kwargs={"cfg": cfg}, order_outputs=False):
        csec += secs
        for rows, s in res:
            sink.add(rows, s)
        if sink.tasks % 400 < chunk:
            print(f"{sink.tasks}/{len(jobs)} tasks, {sink.rows} rows, {time.time() - t0:.0f}s", flush=True)
    meta["container_seconds"] = round(csec, 1)
    meta = sink.finish(meta, time.time() - t0, sample_out, sample_rows)
    print(json.dumps({k: v for k, v in meta.items() if k not in ("specs", "config")}, indent=1))


@app.local_entrypoint()
def tests():
    code, text = run_tests.remote()
    print(text)
    if code:
        raise SystemExit(code)
