"""Modal CPU fan-out for the DAG lab calibration and tuning sweep.

    R="uv run --no-project --with modal --with numpy --with scipy modal run --env 3-sigma-submission"
    $R experiments/dagnet_modal.py::calibrate --seeds 400
    $R experiments/dagnet_modal.py::sweep --seeds 60 --grid "batch=2,budget=8;alpha=1.0"
    $R experiments/dagnet_modal.py::norm --draws 2000000

Ephemeral app (`modal run` only: nothing deployed, no GPU, no secrets). The remote function
calls bayesenv.dagnet.evaluate_seed, exactly what scripts/dagnet_calibrate.py calls locally.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import modal

app = modal.App("bayesenv-dagnet")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3")
    .env({"OMP_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "2"})
    .add_local_python_source("bayesenv")
)
KW = dict(image=image, cpu=2.0, memory=4096, timeout=3600, retries=1, max_containers=40)


def _cfg(kw: dict):
    from dataclasses import replace

    from bayesenv import dagnet as D

    return replace(D.DEFAULT, **kw)


@app.function(**KW)
def eval_chunk(seeds: list[int], kw: dict, salt: str, extra: list[str]) -> tuple[list[dict], float, float]:
    from bayesenv import dagnet as D

    t0, cfg = time.time(), _cfg(kw)
    rows = [D.evaluate_seed(s, salt, cfg, tuple(extra)) for s in seeds]
    return rows, time.time() - t0, D.norm_constant(cfg)


@app.function(**KW)
def norm_chunk(kw: dict, draws: int, seed: int) -> dict:
    from bayesenv import dagnet as D

    return D.estimate_norm(_cfg(kw), draws, seed)


def _parse(spec: str) -> dict:
    kw = {}
    for p in filter(None, spec.split(",")):
        k, v = p.split("=")
        kw[k] = float(v) if k == "alpha" else int(v)
    return kw


def _run(kw: dict, seeds: int, seed0: int, chunk: int, salt: str, extra: list[str]):
    from bayesenv import dagnet as D

    ids = list(range(seed0, seed0 + seeds))
    rows, csec, norm = [], 0.0, None
    for rs, secs, norm in eval_chunk.map([ids[i:i + chunk] for i in range(0, seeds, chunk)],
                                         kwargs={"kw": kw, "salt": salt, "extra": extra}):
        rows += rs
        csec += secs
    return rows, D.summarise(rows), csec, norm


@app.local_entrypoint()
def calibrate(seeds: int = 400, seed0: int = 0, chunk: int = 10, cfg: str = "",
              salt: str = "calibration", out: str = "results/dagnet_calibration.json"):
    from dataclasses import asdict

    from bayesenv import dagnet as D

    kw, t0 = _parse(cfg), time.time()
    rows, s, csec, norm = _run(kw, seeds, seed0, chunk, salt, ["eig_dag"])
    s["meta"] = {"runner": "modal:bayesenv-dagnet::calibrate", "config": asdict(_cfg(kw)),
                 "norm": norm, "salt": salt, "seeds": [seed0, seed0 + seeds],
                 "wall_seconds": round(time.time() - t0, 1), "container_seconds": round(csec, 1),
                 "cpu_per_container": 2}
    Path(out).write_text(json.dumps({**s, "rows": rows}, indent=1))
    print(D.table(s))
    print(json.dumps(s["diagnostics"], indent=1))
    print(s["meta"])


@app.local_entrypoint()
def sweep(seeds: int = 60, seed0: int = 100_000, chunk: int = 10, grid: str = "",
          salt: str = "tuning", out: str = "results/dagnet_sweep.json"):
    """grid: semicolon-separated config overrides, e.g. "batch=2,budget=8;alpha=1.0"."""
    from bayesenv import dagnet as D

    res = {}
    for spec in grid.split(";"):
        rows, s, csec, norm = _run(_parse(spec), seeds, seed0, chunk, salt, ["eig_dag"])
        s["meta"] = {"norm": norm, "container_seconds": round(csec, 1)}
        res[spec or "default"] = s
        print(f"\n=== {spec or 'default'}  (C = {norm:.4f}, {csec:.0f} container-s)")
        print(D.table(s))
        print({k: round(v, 3) for k, v in s["diagnostics"].items()})
    Path(out).write_text(json.dumps(res, indent=1))


@app.local_entrypoint()
def norm(draws: int = 2_000_000, cfg: str = "", parts: int = 20):
    import numpy as np

    kw = _parse(cfg)
    rs = list(norm_chunk.starmap([(kw, draws // parts, k) for k in range(parts)]))
    m = np.array([r["norm"] for r in rs])
    print(json.dumps({"config": kw, "norm": float(m.mean()),
                      "se": float(m.std(ddof=1) / np.sqrt(parts)), "draws": draws}))
