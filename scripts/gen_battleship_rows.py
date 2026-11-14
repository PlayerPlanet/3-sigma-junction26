"""Write Battleship design rows for training (split "train") and evaluation ("heldout_instance").

    python scripts/gen_battleship_rows.py --train 4000 --heldout 600 --out data/battleship_v2
    # -> data/battleship_v2/rows.jsonl (both splits), meta.json, sample_rows.jsonl (6 rows)

The rows plug into the model-size-curve pipeline (branch size-curve) unchanged:

    M="uv run --no-project --with modal modal run --env 3-sigma-submission"
    $M train/modal_curve.py::upload --rows data/battleship_v2/rows.jsonl
    $M train/modal_curve.py::one --model E4B --arm grpo --tag battleship \
        --extra-eval lab_transfer=lab_rows.jsonl

See docs/BATTLESHIP_TRAINING.md.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bayesenv import battleship_rows as R  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=int, default=4000)
    ap.add_argument("--heldout", type=int, default=600)
    ap.add_argument("--out", default="data/battleship_v2")
    a = ap.parse_args()
    t0 = time.time()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rows = R.generate("train", a.train) + R.generate("heldout_instance", a.heldout)
    with open(out / "rows.jsonl", "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    chance = [float(np.mean(np.maximum(r["eig"], 0)) / max(max(r["eig"]), 1e-12)) for r in rows]
    rng = np.random.default_rng(0)
    by_type = {}
    for kind, c in (("any_scan", 2), ("any_fire", 1)):
        by_type[kind] = round(float(np.mean([
            max(r["eig"][i], 0) / max(max(r["eig"]), 1e-12)
            for r in rows for i in [rng.choice([j for j, k in enumerate(r["cost"]) if k == c])]])), 4)
    meta = {"spec": R.SPEC, "spec_hash": R.spec_hash(), "salt": R.SALT,
            "candidates_rule": R.CANDIDATES, "shortcuts": by_type,
            "rows": {s: sum(r["split"] == s for r in rows) for s in R.SEED_BASE},
            "chance": round(float(np.mean(chance)), 4),
            "seconds": round(time.time() - t0, 1)}
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    sample = [r for r in rows if r["split"] == "heldout_instance"][::max(1, a.heldout // 6)][:6]
    with open(out / "sample_rows.jsonl", "w", encoding="utf-8") as f:
        for r in sample:
            f.write(json.dumps(r) + "\n")
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
