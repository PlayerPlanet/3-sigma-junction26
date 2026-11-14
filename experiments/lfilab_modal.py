"""Modal CPU fan-out for the LFI lab: FSP tables, tuning diagnostics and calibration.

    R="uv run --no-project --with modal --with numpy --with scipy modal run --env 3-sigma-submission"
    $R experiments/lfilab_modal.py::table                       # 21,560 FSP solves -> volume + data/
    $R experiments/lfilab_modal.py::diag --seeds 48 --set '{"REF_CELLS": 25}'
    $R experiments/lfilab_modal.py::calibrate --seeds 300
    $R experiments/lfilab_modal.py::tests

Ephemeral app (`modal run` only: nothing deployed, no GPU, no secrets). The FSP tables live in
the Modal volume `lfilab-tables` (seed-independent, a function of the public model only); the
remote functions call exactly the code the local runners call (bayesenv/lfilab.py).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App("bayesenv-lfilab")
vol = modal.Volume.from_name("lfilab-tables", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3", "pytest==8.3.4")
    .env({"OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1",
          "LFILAB_TABLE": "/vol/lfilab_fsp.npz"})
    .add_local_python_source("bayesenv")
    .add_local_file(str(ROOT / "bayesenv" / "lfilab_constants.json"), "/root/bayesenv/lfilab_constants.json")
    .add_local_dir(str(ROOT / "tests"), "/root/tests")
)
KW = dict(image=image, cpu=2.0, memory=8192, timeout=3600, retries=1, max_containers=60,
          volumes={"/vol": vol})


@app.function(**KW)
def fsp_chunk(jobs: list) -> tuple[list, float]:
    from bayesenv import lfilab as L

    t0 = time.time()
    return [L._fsp_job(tuple(j)) for j in jobs], time.time() - t0


@app.function(**KW)
def eval_chunk(seeds: list[int], overrides: dict, salt: str, mode: str) -> tuple[list[dict], float]:
    from bayesenv import lfilab as L

    t0 = time.time()
    L.configure(**overrides)
    f = L.diagnose_seed if mode == "diag" else L.evaluate_seed
    rows = []
    for s in seeds:
        r = f(s, salt)
        r.setdefault("seed", s)
        rows.append(r)
    return rows, time.time() - t0


@app.function(**KW)
def run_tests() -> tuple[int, str]:
    import subprocess
    import sys

    r = subprocess.run([sys.executable, "-m", "pytest", "tests/test_lfilab.py", "-q",
                        "-p", "no:cacheprovider"], cwd="/root", capture_output=True, text=True)
    return r.returncode, r.stdout[-4000:] + r.stderr[-2000:]


def _chunks(xs: list, n: int) -> list[list]:
    return [xs[i:i + n] for i in range(0, len(xs), n)]


@app.local_entrypoint()
def table(chunk: int = 200, out: str = "data/lfilab_fsp.npz"):
    import numpy as np

    from bayesenv import lfilab as L

    jobs = [list(j) for j in L.fsp_jobs()]
    t0 = time.time()
    T, C = len(L.TIMES), L.M_MAX + 1
    FB = np.zeros((len(L.KON_EXT), L.NG, L.NG, len(L.KTX_EXT), T, C), np.float32)
    NF = np.zeros((len(L.KON_EXT), L.NG, len(L.KTX_EXT), T, C), np.float32)
    leak, cs = 0.0, 0.0
    for res, secs in fsp_chunk.map(_chunks(jobs, chunk)):
        cs += secs
        for kind, idx, arr, lk in res:
            (FB if kind == "fb" else NF)[tuple(idx)] = arr
            leak = max(leak, lk)
    assert leak < L.LEAK_MAX, leak
    p = ROOT / out
    p.parent.mkdir(parents=True, exist_ok=True)
    np.savez(p, FB=FB, NF=NF, max_leak=np.float64(leak), seconds=np.float64(cs),
             processes=np.int64(1))
    with vol.batch_upload(force=True) as b:
        b.put_file(str(p), "/lfilab_fsp.npz")
    print(f"{len(jobs)} solves, {cs:.0f} container-s (1 process each), wall "
          f"{time.time() - t0:.0f} s, max leak {leak:.2e} -> {p} and volume lfilab-tables")


def _run(seeds: int, start: int, overrides: str, salt: str, mode: str, chunk: int) -> tuple[list, float, float]:
    ov = json.loads(overrides) if overrides else {}
    t0, rows, cs = time.time(), [], 0.0
    jobs = _chunks(list(range(start, start + seeds)), chunk)
    for r, secs in eval_chunk.starmap([(j, ov, salt, mode) for j in jobs]):
        rows += r
        cs += secs
    rows.sort(key=lambda r: r["seed"])
    return rows, time.time() - t0, cs


@app.local_entrypoint()
def diag(seeds: int = 48, start: int = 100000, set: str = "", salt: str = "tune", chunk: int = 2,
         out: str = ""):
    import numpy as np

    from bayesenv import lfilab as L

    rows, wall, cs = _run(seeds, start, set, salt, "diag", chunk)
    ov = json.loads(set) if set else {}
    L.configure(**ov)
    items = L.QUERY_ITEMS
    keys = [k for k in rows[0] if k not in ("designs", "post_eff_n", "seed")]
    G = {k: np.array([r[k] for r in rows]) for k in keys}
    C = float(G["truth"].mean())
    print(f"overrides {ov}  n={len(rows)}  wall {wall:.0f} s  container-s {cs:.0f}  C~{C:.4f}")
    print(f"median posterior effective n {np.median([r['post_eff_n'] for r in rows]):.1f}")
    for k in keys:
        d = (G["exact"] - G[k]).mean(1) / C
        print(f"  {k:18s} raw {G[k].mean() / C:7.3f}  gap {d.mean():7.3f} +- {1.96 * d.std() / len(d) ** .5:.3f}")
    conds = sorted({it[0] for it in items})
    for cond in conds:
        idx = [i for i, it in enumerate(items) if it[0] == cond]
        s = " ".join(f"{k[:9]}={(G['exact'][:, idx] - G[k][:, idx]).mean() / C:6.3f}"
                     for k in keys if k not in ("exact", "truth"))
        print(f"  {cond:16s} exact={G['exact'][:, idx].mean() / C:6.3f} truth={G['truth'][:, idx].mean() / C:6.3f} {s}")
    from collections import Counter
    print(Counter(tuple(map(tuple, r["designs"])) for r in rows).most_common(4))
    if out:
        Path(out).write_text(json.dumps({"overrides": ov, "rows": rows}))


@app.local_entrypoint()
def calibrate(seeds: int = 300, start: int = 0, salt: str = "calibration", chunk: int = 2,
              out: str = "results/lfilab_calibration.json"):
    from bayesenv import lfilab as L

    rows, wall, cs = _run(seeds, start, "", salt, "calib", chunk)
    s = L.summarise(rows)
    s["meta"] = {"runner": "modal", "salt": salt, "seeds": [start, start + seeds],
                 "wall_seconds": round(wall), "container_seconds": round(cs),
                 "norm": L.constants()["C"]}
    print(L.table(s))
    print(json.dumps(s["diagnostics"], indent=1))
    Path(ROOT / out).write_text(json.dumps({**s, "rows": rows}, indent=1))


@app.function(**KW)
def constants_remote() -> str:
    from bayesenv import lfilab as L

    L.CONSTANTS_FILE = Path("/tmp/lfilab_constants.json")
    L.write_constants()
    return L.CONSTANTS_FILE.read_text()


@app.local_entrypoint()
def constants():
    """Recompute bayesenv/lfilab_constants.json (prior predictives and C) from the tables."""
    txt = constants_remote.remote()
    (ROOT / "bayesenv" / "lfilab_constants.json").write_text(txt)
    print("C =", json.loads(txt)["C"], "items:", len(json.loads(txt)["items"]))


@app.local_entrypoint()
def tests():
    code, txt = run_tests.remote()
    print(txt)
    if code:
        raise SystemExit(code)
