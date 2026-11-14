"""Modal CPU fan-out for the LFI lab v2: FSP tables (62,208 two-species solves), constants,
tuning diagnostics, calibration and tests.

    R="uv run --no-project --with modal --with numpy --with scipy modal run --env 3-sigma-submission"
    $R experiments/lfilab2_modal.py::table          # solves -> volume lfilab-tables:/v2/
    $R experiments/lfilab2_modal.py::constants      # bayesenv/lfilab2_constants.json
    $R experiments/lfilab2_modal.py::diag --seeds 48 --set '{"REF_CELLS": 25}'
    $R experiments/lfilab2_modal.py::calibrate --seeds 240
    $R experiments/lfilab2_modal.py::tests
    $R experiments/lfilab2_modal.py::fetch          # exact table -> data/lfilab2_exact.npz

Ephemeral app (`modal run` only; nothing deployed, no GPU, no secrets). The tables are a
function of the public model only and live in the Modal volume `lfilab-tables` under /v2.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App("bayesenv-lfilab2")
vol = modal.Volume.from_name("lfilab-tables", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3", "pytest==8.3.4")
    .env({"OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1",
          "LFILAB2_TABLE": "/vol/v2/lfilab2_exact.npz",
          "LFILAB2_APPROX_TABLE": "/vol/v2/lfilab2_approx.npz"})
    .add_local_python_source("bayesenv")
    .add_local_dir(str(ROOT / "tests"), "/root/tests")
)
_C2 = ROOT / "bayesenv" / "lfilab2_constants.json"
if _C2.exists():
    image = image.add_local_file(str(_C2), "/root/bayesenv/lfilab2_constants.json")
SOLVE = dict(image=image, cpu=1.0, memory=4096, timeout=6 * 3600, retries=2, max_containers=250,
             volumes={"/vol": vol})
BIG = dict(image=image, cpu=2.0, memory=16384, timeout=3 * 3600, retries=1, max_containers=60,
           volumes={"/vol": vol})


@app.function(**SOLVE)
def solve_chunk(i: int, jobs: list) -> dict:
    import numpy as np

    from bayesenv import lfilab2 as L

    t0 = time.time()
    res = [L.run_job((k, tuple(idx))) for k, idx in jobs]
    out = {"kind": np.array([r["kind"] for r in res]),
           "idx": np.array([list(r["idx"]) + [-1] * (5 - len(r["idx"])) for r in res]),
           "leak": np.array([r["leak"] for r in res]), "tail": np.array([r["tail"] for r in res]),
           "N": np.array([r["N"] for r in res]), "secs": np.array([r["secs"] for r in res])}
    for key in ("rna", "protein", "a_rna", "a_protein"):
        out[key] = np.stack([r[key] for r in res])
    Path("/vol/v2/chunks").mkdir(parents=True, exist_ok=True)
    np.savez(f"/vol/v2/chunks/chunk_{i:05d}.npz", **out)
    vol.commit()
    return {"i": i, "n": len(res), "wall": time.time() - t0, "solve_secs": float(out["secs"].sum()),
            "max_leak": float(out["leak"].max()), "max_tail": float(out["tail"].max())}


@app.function(**BIG)
def assemble(n_chunks: int) -> dict:
    import numpy as np

    from bayesenv import lfilab2 as L

    vol.reload()
    ex, ap = L.empty_tables(), L.empty_tables()
    secs, Ns, kinds, leak, tail = [], [], [], 0.0, 0.0
    for i in range(n_chunks):
        z = np.load(f"/vol/v2/chunks/chunk_{i:05d}.npz")
        for k, idx, r, p, ar, apr, s, n in zip(z["kind"], z["idx"], z["rna"], z["protein"], z["a_rna"],
                                                z["a_protein"], z["secs"], z["N"]):
            key = tuple(int(x) for x in idx if x >= 0)
            pre = "FB" if k == "fb" else "NF"
            ex[f"{pre}_rna"][key], ex[f"{pre}_protein"][key] = r, p
            ap[f"{pre}_rna"][key], ap[f"{pre}_protein"][key] = ar, apr
            secs.append(float(s)); Ns.append(int(n)); kinds.append(str(k))
        leak, tail = max(leak, float(z["leak"].max())), max(tail, float(z["tail"].max()))
    assert len(secs) == len(L.fsp_jobs()), (len(secs), len(L.fsp_jobs()))
    assert leak < L.LEAK_MAX and tail < L.TAIL_MAX, (leak, tail)
    np.savez("/vol/v2/lfilab2_exact.npz", **ex, max_leak=leak, max_tail=tail)
    np.savez("/vol/v2/lfilab2_approx.npz", **ap)
    np.savez("/vol/v2/solve_stats.npz", secs=np.array(secs), N=np.array(Ns), kind=np.array(kinds))
    vol.commit()
    s = np.array(secs)
    return {"solves": len(s), "core_seconds": float(s.sum()), "mean": float(s.mean()),
            "median": float(np.median(s)), "p99": float(np.percentile(s, 99)), "max": float(s.max()),
            "max_N": int(max(Ns)), "max_leak": leak, "max_tail": tail}


@app.function(**BIG)
def secs_table(n_chunks: int) -> dict:
    """Seconds of every FSP solve, arranged like the tables (for the agent-cost analysis)."""
    import numpy as np

    from bayesenv import lfilab2 as L

    vol.reload()
    T = L.empty_tables()
    fb = np.zeros(T["FB_rna"].shape[:-2])
    nf = np.zeros(T["NF_rna"].shape[:-2])
    for i in range(n_chunks):
        z = np.load(f"/vol/v2/chunks/chunk_{i:05d}.npz")
        for k, idx, sec in zip(z["kind"], z["idx"], z["secs"]):
            key = tuple(int(x) for x in idx if x >= 0)
            (fb if k == "fb" else nf)[key] = sec
    np.savez("/vol/v2/solve_secs.npz", fb=fb, nf=nf)
    vol.commit()
    return {"fb_total": float(fb.sum()), "nf_total": float(nf.sum())}


def _solves_for(h_list, conds, L):
    """The distinct FSP solves needed to evaluate hypotheses h_list in conditions conds."""
    need = set()
    for h in h_list:
        i_on, i_off, i_K, i_tx, i_tl = L.theta_indices(int(h))
        for cond in conds:
            u, fb = L.CONDITIONS[cond]
            e_on = i_on + (L.LOW_SHIFT if u == 1.0 else 0)
            for j in L.EXTRINSIC_J:
                e_tx = i_tx + L.EXT_SHIFT + int(j)
                need.add(("fb", (e_on, i_off, i_K, e_tx, i_tl)) if fb else ("nf", (e_on, i_off, e_tx, i_tl)))
    return need


@app.function(**BIG)
def cost_chunk(seeds: list, salt: str) -> list:
    """What would exact inference cost an agent that prunes? For each seed: the hypotheses
    holding 99% / 99.9% of the EXACT posterior after the reference's data, and of the 1-D
    approximation's posterior (a cheap first pass an agent could compute); the exact posterior
    mass the approximate set captures; and the CPU-seconds of the distinct FSP solves needed
    for each set (data conditions only, and with the query conditions too)."""
    import numpy as np

    from bayesenv import lfilab2 as L

    z = np.load("/vol/v2/solve_secs.npz")
    secs = {"fb": z["fb"], "nf": z["nf"]}
    cost = lambda need: float(sum(secs[k][idx] for k, idx in need))
    rows = []
    for s in seeds:
        ref = L.run_policy("reference", s, salt, submit=False)
        w = ref.belief.weights()
        ab = L.Belief("approx")
        for d, c in ref.belief.log:
            ab.add(d, c)
        wa = ab.weights()
        row = {"seed": s}
        data_conds = sorted({L.DESIGNS[d][0] for d, _ in ref.belief.log})
        for name, ww in (("exact", w), ("approx", wa)):
            order = np.argsort(-ww)
            cum = np.cumsum(ww[order])
            for mass in (0.99, 0.999):
                k = int(np.searchsorted(cum, mass)) + 1
                top = order[:k]
                row[f"{name}_n{mass}"] = k
                row[f"{name}_cost_data{mass}"] = cost(_solves_for(top, data_conds, L))
                row[f"{name}_cost_all{mass}"] = cost(_solves_for(top, L.QUERY_CONDITIONS, L))
                row[f"{name}_captures_exact_mass{mass}"] = float(w[top].sum())
        rows.append(row)
    return rows


@app.local_entrypoint()
def cost(seeds: int = 40, start: int = 0, salt: str = "calibration", n_chunks: int = 519):
    import numpy as np

    print(secs_table.remote(n_chunks))
    rows = []
    for r in cost_chunk.starmap([(j, salt) for j in _chunks(list(range(start, start + seeds)), 4)]):
        rows += r
    keys = [k for k in rows[0] if k != "seed"]
    summ = {k: {"median": float(np.median([r[k] for r in rows])), "p90": float(np.percentile([r[k] for r in rows], 90)),
                "mean": float(np.mean([r[k] for r in rows]))} for k in keys}
    print(json.dumps(summ, indent=1))
    Path(ROOT / "results" / "lfilab2_cost.json").write_text(json.dumps({"summary": summ, "rows": rows}, indent=1))


@app.function(**BIG)
def constants_remote() -> str:
    from bayesenv import lfilab2 as L

    d = L.write_constants(Path("/tmp/c2.json"))
    return json.dumps(d)


@app.function(**BIG)
def eval_chunk(seeds: list, overrides: dict, salt: str, mode: str) -> tuple:
    from bayesenv import lfilab2 as L

    t0 = time.time()
    L.configure(**overrides)
    f = L.diagnose_seed if mode == "diag" else L.evaluate_seed
    rows = []
    for s in seeds:
        r = f(s, salt)
        r.setdefault("seed", s)
        rows.append(r)
    return rows, time.time() - t0


@app.function(**BIG)
def run_tests() -> tuple:
    import subprocess
    import sys

    r = subprocess.run([sys.executable, "-m", "pytest", "tests/test_lfilab2.py", "-q", "-p", "no:cacheprovider"],
                       cwd="/root", capture_output=True, text=True)
    return r.returncode, r.stdout[-5000:] + r.stderr[-2000:]


def _chunks(xs: list, n: int) -> list:
    return [xs[i:i + n] for i in range(0, len(xs), n)]


@app.local_entrypoint()
def table(chunk: int = 120):
    import random

    from bayesenv import lfilab2 as L

    jobs = [[k, list(idx)] for k, idx in L.fsp_jobs()]
    random.Random(0).shuffle(jobs)               # balance the expensive solves across chunks
    chunks = _chunks(jobs, chunk)
    t0, done, cs = time.time(), 0, 0.0
    for r in solve_chunk.starmap(list(enumerate(chunks))):
        done += 1
        cs += r["solve_secs"]
        if done % 50 == 0:
            print(f"{done}/{len(chunks)} chunks, {time.time() - t0:.0f} s, solve core-s so far {cs:.0f}", flush=True)
    print("assembling ...")
    print(json.dumps(assemble.remote(len(chunks)), indent=1))
    print(f"wall {time.time() - t0:.0f} s")


@app.local_entrypoint()
def constants():
    txt = constants_remote.remote()
    (ROOT / "bayesenv" / "lfilab2_constants.json").write_text(txt)
    print("C =", json.loads(txt)["C"], "items:", len(json.loads(txt)["items"]))


def _run(seeds, start, overrides, salt, mode, chunk):
    ov = json.loads(overrides) if overrides else {}
    t0, rows, cs = time.time(), [], 0.0
    for r, secs in eval_chunk.starmap([(j, ov, salt, mode) for j in _chunks(list(range(start, start + seeds)), chunk)]):
        rows += r
        cs += secs
    rows.sort(key=lambda r: r["seed"])
    return rows, time.time() - t0, cs


@app.local_entrypoint()
def diag(seeds: int = 48, start: int = 100000, set: str = "", salt: str = "tune", chunk: int = 4, out: str = ""):
    import numpy as np

    from bayesenv import lfilab2 as L

    rows, wall, cs = _run(seeds, start, set, salt, "diag", chunk)
    ov = json.loads(set) if set else {}
    L.configure(**ov) if ov else None
    items = L.QUERY_ITEMS
    keys = [k for k in rows[0] if k not in ("designs", "post_eff_n", "n_for_99", "seed")]
    G = {k: np.array([r[k] for r in rows]) for k in keys}
    C = float(G["truth"].mean())
    print(f"overrides {ov}  n={len(rows)}  wall {wall:.0f} s  container-s {cs:.0f}  C~{C:.4f}")
    print(f"median posterior effective n {np.median([r['post_eff_n'] for r in rows]):.1f}, "
          f"median n for 99% mass {np.median([r['n_for_99'] for r in rows]):.0f}")
    for k in keys:
        d = (G["exact"] - G[k]).mean(1) / C
        print(f"  {k:14s} raw {G[k].mean() / C:7.3f}  gap {d.mean():7.3f} +- {1.96 * d.std() / len(d) ** .5:.3f}")
    for grp, sel in [("blocked", lambda it: "blocked" in it[0]), ("not blocked", lambda it: "blocked" not in it[0]),
                     ("rna", lambda it: it[2] == "rna"), ("protein", lambda it: it[2] == "protein"),
                     ("single", lambda it: it[3] is None), ("population", lambda it: it[3] is not None)]:
        idx = [i for i, it in enumerate(items) if sel(it)]
        s = " ".join(f"{k[:8]}={(G['exact'][:, idx] - G[k][:, idx]).mean() / C:6.3f}"
                     for k in keys if k not in ("exact", "truth"))
        print(f"  {grp:12s} exact={G['exact'][:, idx].mean() / C:6.3f} truth={G['truth'][:, idx].mean() / C:6.3f} {s}")
    from collections import Counter
    print(Counter(tuple(map(tuple, r["designs"])) for r in rows).most_common(3))
    if out:
        Path(out).write_text(json.dumps({"overrides": ov, "rows": rows}))


@app.local_entrypoint()
def calibrate(seeds: int = 240, start: int = 0, salt: str = "calibration", chunk: int = 4,
              out: str = "results/lfilab2_calibration.json"):
    from bayesenv import lfilab2 as L

    rows, wall, cs = _run(seeds, start, "", salt, "calib", chunk)
    s = L.summarise(rows)
    s["meta"] = {"runner": "modal", "salt": salt, "seeds": [start, start + seeds],
                 "wall_seconds": round(wall), "container_seconds": round(cs), "norm": L.constants()["C"]}
    print(L.table(s))
    print(json.dumps(s["diagnostics"], indent=1))
    Path(ROOT / out).write_text(json.dumps({**s, "rows": rows}, indent=1))


@app.local_entrypoint()
def tests():
    code, txt = run_tests.remote()
    print(txt)
    if code:
        raise SystemExit(code)


@app.local_entrypoint()
def fetch(out: str = "data/lfilab2_exact.npz"):
    p = ROOT / out
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "wb") as f:
        for chunk in vol.read_file("v2/lfilab2_exact.npz"):
            f.write(chunk)
    print("wrote", p, p.stat().st_size)
