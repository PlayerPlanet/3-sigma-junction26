"""Modal CPU fan-out for the optogenetics lab calibration, tuning sweeps and the norm constant.

    R="uv run --no-project --with modal --with numpy --with scipy modal run --env 3-sigma-submission"
    $R experiments/optolab_modal.py::calibrate --seeds 400
    $R experiments/optolab_modal.py::sweep --seeds 60 --grid "budget=16;heat=0,0,0.05,0.4"
    $R experiments/optolab_modal.py::norm --draws 4000000

Ephemeral app (`modal run` only: nothing deployed, no GPU, no secrets). The remote function
calls bayesenv.optolab.evaluate_seed, exactly what scripts/optolab_calibrate.py calls locally.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import modal

app = modal.App("bayesenv-optolab")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3")
    .env({"OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1"})
    .add_local_python_source("bayesenv")
)
KW = dict(image=image, cpu=1.0, memory=2048, timeout=3600, retries=1, max_containers=100)


def _parse(spec: str) -> dict:
    """"budget=16,heat=0,0,0.05,0.4" -> {"budget": 16, "heat": (0, 0, 0.05, 0.4)}; a value with
    commas belongs to the preceding key."""
    from bayesenv import optolab as O

    kw, key = {}, None
    for tok in filter(None, spec.split(",")):
        if "=" in tok:
            key, v = tok.split("=")
            kw[key] = [v]
        else:
            kw[key].append(tok)
    out = {}
    for k, vs in kw.items():
        cur = getattr(O.DEFAULT, k)
        out[k] = tuple(float(x) for x in vs) if isinstance(cur, tuple) else type(cur)(vs[0])
    return out


def _cfg(kw: dict):
    from dataclasses import replace

    from bayesenv import optolab as O

    return replace(O.DEFAULT, **kw)


@app.function(**KW)
def eval_seed(seed: int, kw: dict, salt: str) -> tuple[dict, float]:
    from bayesenv import optolab as O

    t0 = time.time()
    return O.evaluate_seed(seed, salt, _cfg(kw)), time.time() - t0


@app.function(**KW)
def norm_chunk(kw: dict, draws: int, seed: int) -> dict:
    from bayesenv import optolab as O

    return O.estimate_norm(_cfg(kw), draws, seed)


def _run(kw: dict, seeds: int, seed0: int, salt: str):
    from bayesenv import optolab as O

    rows, csec = [], 0.0
    for r, secs in eval_seed.map(range(seed0, seed0 + seeds), kwargs={"kw": kw, "salt": salt}):
        rows.append(r)
        csec += secs
    rows.sort(key=lambda r: r["seed"])
    return rows, O.summarise(rows), csec


@app.local_entrypoint()
def calibrate(seeds: int = 400, seed0: int = 0, cfg: str = "", salt: str = "calibration",
              out: str = "results/optolab_calibration.json"):
    from dataclasses import asdict

    from bayesenv import optolab as O

    kw, t0 = _parse(cfg), time.time()
    rows, s, csec = _run(kw, seeds, seed0, salt)
    s["meta"] = {"runner": "modal:bayesenv-optolab::calibrate", "config": asdict(_cfg(kw)),
                 "norm": O.norm_constant(_cfg(kw)), "salt": salt, "seeds": [seed0, seed0 + seeds],
                 "wall_seconds": round(time.time() - t0, 1), "container_seconds": round(csec, 1),
                 "cpu_per_container": 1}
    Path(out).write_text(json.dumps({**s, "rows": rows}, indent=1))
    print(O.table(s))
    print(json.dumps(s["diagnostics"], indent=1))
    for name, f in (("circuits with an OR gate", lambda r: r["or_gate"] == 1),
                    ("circuits without", lambda r: r["or_gate"] == 0)):
        sub = O.summarise(rows, subset=f)
        print(f"\n{name}: n={sub['n']}")
        print(O.table(sub))
    print(s["meta"])


@app.local_entrypoint()
def sweep(seeds: int = 60, seed0: int = 100_000, grid: str = "", salt: str = "calibration",
          out: str = "results/optolab_sweep.json"):
    """grid: semicolon-separated config overrides, e.g. "budget=16;heat=0,0,0.05,0.4"."""
    from bayesenv import optolab as O

    res = {}
    for spec in grid.split(";"):
        rows, s, csec = _run(_parse(spec), seeds, seed0, salt)
        s["meta"] = {"container_seconds": round(csec, 1)}
        res[spec or "default"] = s
        print(f"\n=== {spec or 'default'}  ({csec:.0f} container-s)")
        print(O.table(s))
    Path(out).write_text(json.dumps(res, indent=1))


@app.local_entrypoint()
def norm(draws: int = 4_000_000, cfg: str = "", parts: int = 40):
    import numpy as np

    kw = _parse(cfg)
    rs = list(norm_chunk.starmap([(kw, draws // parts, k) for k in range(parts)]))
    m = np.array([r["norm"] for r in rs])
    print(json.dumps({"config": kw, "norm": float(m.mean()),
                      "se": float(m.std(ddof=1) / np.sqrt(parts)), "draws": draws}))
