"""Generate the lab-transfer design rows (docs/LAB_ROWS.md), locally, single process.

    uv run --no-project --with numpy --with scipy --with pyyaml \
        python scripts/gen_lab_rows.py --rows 400 --out data/lab_transfer \
        --sample-out data/lab_transfer/sample_rows.jsonl

Writes <out>/rows.jsonl (design rows, schema of docs/TASK_SPEC.md plus the optional fields of
docs/LAB_ROWS.md) and <out>/meta.json (counts, chance level, near-flat fraction, and for the
diagnostic lab the number of rows where greedy and optimal choices differ). About --rows rows per
lab, split evenly over (source, depth) cells, one fresh seed per row. Deterministic: the same
arguments give the same file. The chemistry and diagnostic labs take seconds; the DAG lab takes
about a second per row and the wet lab (simulation-based labels) several seconds per row, so
for the full set there is a Modal fan-out with the same output:

    modal run --env 3-sigma-submission experiments/lab_rows_modal.py::gen --rows 400
"""

from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import argparse  # noqa: E402
import json  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bayesenv import lab_rows  # noqa: E402

LABS = ("chem", "diag", "dag", "wetlab")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--labs", default=",".join(LABS))
    ap.add_argument("--rows", type=int, default=400, help="target rows per lab")
    ap.add_argument("--wetlab-rows", type=int, default=200, help="target rows for the wet lab")
    ap.add_argument("--out", default="data/lab_transfer")
    ap.add_argument("--sample-out", default="")
    a = ap.parse_args()
    labs = [x for x in a.labs.split(",") if x]
    t0, rows, secs = time.time(), [], {}
    for lab in labs:
        t1 = time.time()
        n = lab_rows.per_cell(lab, a.wetlab_rows if lab == "wetlab" else a.rows)
        for cell in lab_rows.cells(lab):
            rows += lab_rows.generate_cell(*cell, n)
        secs[lab] = round(time.time() - t1, 1)
        print(f"{lab}: {secs[lab]}s", flush=True)
    meta = lab_rows.write_output(
        rows, a.out, {"runner": "scripts/gen_lab_rows.py", "rows_per_lab_requested": a.rows, "wetlab_rows_requested": a.wetlab_rows,
                      "seconds_by_lab": secs, "wall_seconds": round(time.time() - t0, 1)},
        a.sample_out)
    print(json.dumps(meta["labs"], indent=1))


if __name__ == "__main__":
    main()
