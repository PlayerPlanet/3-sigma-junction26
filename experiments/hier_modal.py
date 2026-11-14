"""Modal CPU fan-out for the hierarchical lab: calibration and the configuration sweep.

    R="uv run --no-project --with modal --with numpy --with scipy modal run --env 3-sigma-submission"
    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 $R experiments/hier_modal.py::calibrate --seeds 1000
    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 $R experiments/hier_modal.py::sweep --seeds 100
    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 $R experiments/hier_modal.py::norm

Ephemeral app (`modal run` only: nothing deployed, CPU only, no secrets). The remote function
calls bayesenv.hier.evaluate_seed, the same code as scripts/hier_calibrate.py.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App("bayesenv-hier")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("numpy==2.3.4", "scipy==1.16.3")
    .env({"OMP_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "2"})
    .add_local_python_source("bayesenv")
)
KW = dict(image=image, cpu=2.0, memory=4096, timeout=3600, retries=1, max_containers=40)

S4 = (0.5, 1.0, 2.0, 4.0)
S6 = (1.0, 2.0, 4.0, 0.5, 1.0, 2.0)
# Configurations tried while tuning (docs/HIER.md says what was kept and why). {} = defaults
# of bayesenv.hier.Config at the time of the sweep.
SWEEP = {
    "K8_B32": {"slopes": S4 * 2, "budget": 32},
    "K4_B16": {"slopes": (1.0, 2.0, 4.0, 0.5), "budget": 16},
    "K6_B18": {"slopes": S6, "budget": 18},
    "K6_B24": {"slopes": S6, "budget": 24},
    "K12_B24": {"slopes": S4 * 3, "budget": 24},
    "K12_B36": {"slopes": S4 * 3, "budget": 36},
    "K16_B24": {"slopes": S4 * 4, "budget": 24},
    "K8_B32_tau3": {"slopes": S4 * 2, "budget": 32, "tau_hi": 3.0},
    "K6_B24_tau3": {"slopes": S6, "budget": 24, "tau_hi": 3.0},
    "K6_B24_slope2": {"slopes": (2.0,) * 6, "new_slopes": (2.0,), "budget": 24},
    # round 2: few units / few experiments per unit, sharp new-unit queries, smaller tau_lo
    "K4_B16_new4": {"slopes": (1.0, 2.0, 4.0, 0.5), "budget": 16, "new_slopes": (4.0,)},
    "K5_B20_new4": {"slopes": (1.0, 2.0, 4.0, 0.5, 2.0), "budget": 20, "new_slopes": (4.0,)},
    "K6_B18_new4": {"slopes": S6, "budget": 18, "new_slopes": (4.0,)},
    "K5_B20_new4_tau01": {"slopes": (1.0, 2.0, 4.0, 0.5, 2.0), "budget": 20, "new_slopes": (4.0,),
                          "tau_lo": 0.1},
    "K6_B18_new4_tau01": {"slopes": S6, "budget": 18, "new_slopes": (4.0,), "tau_lo": 0.1},
    "K5_B15_new4_tau01": {"slopes": (1.0, 2.0, 4.0, 0.5, 2.0), "budget": 15, "new_slopes": (4.0,),
                          "tau_lo": 0.1},
    "K6_B18_steep": {"slopes": (2.0, 4.0) * 3, "budget": 18, "new_slopes": (4.0,)},
    "K12_B12_new4": {"slopes": S4 * 3, "budget": 12, "new_slopes": (4.0,)},
    "K16_B16_new4_tau01": {"slopes": S4 * 4, "budget": 16, "new_slopes": (4.0,), "tau_lo": 0.1},
    "K12_B18_new4_tau01": {"slopes": S4 * 3, "budget": 18, "new_slopes": (4.0,), "tau_lo": 0.1},
}


def _json(cfg: dict) -> dict:
    return {k: list(v) if isinstance(v, tuple) else v for k, v in cfg.items()}


@app.function(**KW)
def chunk(seeds: list[int], cfg: dict, policies: list | None, salt: str) -> tuple[list, list, float]:
    from bayesenv import hier as H

    t0 = time.time()
    c = H.Config(**{k: tuple(v) if isinstance(v, list) else v for k, v in cfg.items()})
    model = H.get_model(c)
    pol = tuple(policies) if policies else H.DESIGN_POLICIES
    rows = [H.evaluate_seed(s, salt, model, pol) for s in seeds]
    return rows, list(model.norm), time.time() - t0


@app.function(**KW)
def norm_remote(n: int) -> tuple[float, float]:
    from bayesenv import hier as H

    return H.estimate_norm(H.get_model(), n)


def _local():
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(ROOT / "scripts"))
    import hier_calibrate

    return hier_calibrate


def _run(cfg: dict, seeds: int, policies, salt: str, per: int = 10):
    jobs = [list(range(i, min(i + per, seeds))) for i in range(0, seeds, per)]
    return chunk.map(jobs, kwargs={"cfg": _json(cfg), "policies": policies, "salt": salt})


def _spawn(cfg: dict, seeds: int, policies, salt: str, per: int = 10):
    """Like _run but starts every chunk now and returns handles (configs run concurrently)."""
    return [chunk.spawn(list(range(i, min(i + per, seeds))), _json(cfg), policies, salt)
            for i in range(0, seeds, per)]


@app.local_entrypoint()
def calibrate(seeds: int = 1000, out: str = "results/hier_calibration.json"):
    hc = _local()
    from bayesenv import hier as H

    t0, rows, csec, norm = time.time(), [], 0.0, None
    for rs, nm, secs in _run({}, seeds, None, hc.SALT):
        rows += rs
        csec += secs
        norm = nm
    s = hc.summarise(rows)
    s["meta"] = {"runner": "modal:bayesenv-hier::calibrate", "wall_seconds": round(time.time() - t0, 1),
                 "container_seconds": round(csec, 1), "cpu_per_container": 2,
                 "config": _json(dict(H.DEFAULT.__dict__)), "norm_a": norm[0], "norm_b": norm[1],
                 "salt": hc.SALT, "episodes_per_seed": len(H.DESIGN_POLICIES)}
    Path(out).write_text(json.dumps(s, indent=1))
    print(hc.table(s))
    print(json.dumps({k: s[k] for k in ("reference_minus_random_decomposition", "reference_behaviour",
                                        "meta")}, indent=1))


@app.local_entrypoint()
def sweep(seeds: int = 100, only: str = "", out: str = "results/hier_sweep.json"):
    hc = _local()
    pol = ["reference", "random", "random_unit_eig_design", "round_robin_eig_design", "no_pooling",
           "complete_pooling"]
    names = [n for n in SWEEP if not only or n in only.split(",")]
    calls = {n: _spawn(SWEEP[n], seeds, pol, hc.SALT) for n in names}
    res = {}
    for n, cs in calls.items():
        rows, norm = [], None
        for rs, nm, _ in (c.get() for c in cs):
            rows += rs
            norm = nm
        res[n] = hc.summarise(rows)
        res[n]["meta"] = {"config_overrides": _json(SWEEP[n]), "norm_a": norm[0], "norm_b": norm[1]}
        print(f"\n== {n}  Z_a={norm[0]:.4f} Z_b={norm[1]:.4f}  {res[n].get('reference_behaviour')}")
        print(hc.table(res[n]))
    Path(out).write_text(json.dumps(res, indent=1))


@app.local_entrypoint()
def norm(n: int = 2_000_000):
    za, zb = norm_remote.remote(n)
    print(f"NORM_A = {za:.5f}\nNORM_B = {zb:.5f}")
