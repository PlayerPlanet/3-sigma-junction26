"""Calibrate the DAG lab: reference vs design baselines vs inference shortcuts, paired seeds.

    PY="uv run --no-project --with numpy --with scipy python"
    $PY scripts/dagnet_calibrate.py --seeds 0:40                 # small local run
    $PY scripts/dagnet_calibrate.py --norm --draws 400000        # the stored constant C
    $PY scripts/dagnet_calibrate.py --seeds 0:20 --set batch=2 --set budget=8

The full run (hundreds of seeds) goes to Modal: experiments/dagnet_modal.py. Both call
bayesenv.dagnet.evaluate_seed, so the rows are identical.
"""

import argparse
import json
import sys
import time
from dataclasses import asdict, replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bayesenv import dagnet as D  # noqa: E402


def parse_cfg(pairs) -> D.Config:
    kw = {}
    for p in pairs or []:
        k, v = p.split("=")
        kw[k] = float(v) if k == "alpha" else int(v)
    return replace(D.DEFAULT, **kw)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seeds", default="0:40")
    p.add_argument("--salt", default="calibration")
    p.add_argument("--set", action="append", help="override a Config field, e.g. batch=2")
    p.add_argument("--out", default="")
    p.add_argument("--norm", action="store_true", help="estimate the normalising constant only")
    p.add_argument("--draws", type=int, default=400_000)
    a = p.parse_args()
    cfg = parse_cfg(a.set)
    if a.norm:
        print(json.dumps({"config": asdict(cfg), **D.estimate_norm(cfg, a.draws)}, indent=1))
        return
    lo, hi = map(int, a.seeds.split(":"))
    t0 = time.time()
    rows = [D.evaluate_seed(s, a.salt, cfg) for s in range(lo, hi)]
    s = D.summarise(rows)
    s["meta"] = {"runner": "local", "config": asdict(cfg), "norm": D.norm_constant(cfg),
                 "salt": a.salt, "seeds": [lo, hi], "wall_seconds": round(time.time() - t0, 1)}
    print(D.table(s))
    print(json.dumps(s["diagnostics"], indent=1))
    if a.out:
        Path(a.out).write_text(json.dumps({**s, "rows": rows}, indent=1))


if __name__ == "__main__":
    main()
