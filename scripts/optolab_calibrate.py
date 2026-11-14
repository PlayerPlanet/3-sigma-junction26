"""Calibrate the optogenetics lab: reference vs design baselines vs inference shortcuts, paired.

    PY="uv run --no-project --with numpy --with scipy python"
    $PY scripts/optolab_calibrate.py --seeds 0:8 --workers 4          # smoke run
    $PY scripts/optolab_calibrate.py --norm --draws 4000000          # the stored constant C
    $PY scripts/optolab_calibrate.py --seeds 100000:100060 --set budget=20 --set heat=0,0,0.05,0.5

Every row comes from bayesenv.optolab.evaluate_seed (one hidden circuit, every policy on it).
A seed takes about 3 CPU-minutes (the reference's lookahead design runs for every restricted
design), so anything beyond a smoke run goes to Modal: experiments/optolab_modal.py.
"""

import argparse
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bayesenv import optolab as O  # noqa: E402


def parse_cfg(pairs) -> O.Config:
    kw = {}
    for p in pairs or []:
        k, v = p.split("=")
        cur = getattr(O.DEFAULT, k)
        kw[k] = tuple(float(x) for x in v.split(",")) if isinstance(cur, tuple) else type(cur)(v)
    return replace(O.DEFAULT, **kw)


def _one(args):
    seed, salt, cfg = args
    return O.evaluate_seed(seed, salt, cfg)


def _norm(args):
    cfg, draws, seed = args
    return O.estimate_norm(cfg, draws, seed)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seeds", default="0:40")
    p.add_argument("--salt", default="calibration")
    p.add_argument("--set", action="append", help="override a Config field, e.g. budget=20")
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--out", default="")
    p.add_argument("--norm", action="store_true", help="estimate the normalising constant only")
    p.add_argument("--draws", type=int, default=400_000)
    a = p.parse_args()
    cfg = parse_cfg(a.set)
    t0 = time.time()
    if a.norm:
        chunk = 200_000
        jobs = [(cfg, min(chunk, a.draws - lo), lo // chunk) for lo in range(0, a.draws, chunk)]
        with ProcessPoolExecutor(a.workers) as ex:
            parts = list(ex.map(_norm, jobs))
        n = sum(r["draws"] for r in parts)
        mean = sum(r["norm"] * r["draws"] for r in parts) / n
        var = sum((r["se"] ** 2 * r["draws"] * (r["draws"] - 1) + r["draws"] * (r["norm"] - mean) ** 2)
                  for r in parts) / (n - 1)
        print(json.dumps({"config": asdict(cfg), "norm": mean, "se": (var / n) ** 0.5, "draws": n,
                          "wall_seconds": round(time.time() - t0, 1)}, indent=1))
        return
    lo, hi = map(int, a.seeds.split(":"))
    O.NORMS[O._norm_key(cfg)] = O.norm_constant(cfg)        # computed once, shared by workers
    with ProcessPoolExecutor(a.workers) as ex:
        rows = list(ex.map(_one, [(s, a.salt, cfg) for s in range(lo, hi)], chunksize=2))
    s = O.summarise(rows)
    s["meta"] = {"runner": "local", "config": asdict(cfg), "norm": O.norm_constant(cfg),
                 "salt": a.salt, "seeds": [lo, hi], "wall_seconds": round(time.time() - t0, 1)}
    print(O.table(s))
    print(json.dumps(s["diagnostics"], indent=1))
    for name, f in (("circuits with an OR gate", lambda r: r["or_gate"] == 1),
                    ("circuits without", lambda r: r["or_gate"] == 0)):
        sub = O.summarise(rows, subset=f)
        print(f"\n{name}: n={sub['n']}")
        print(O.table(sub))
    if a.out:
        Path(a.out).write_text(json.dumps({**s, "rows": rows}, indent=1))


if __name__ == "__main__":
    main()
