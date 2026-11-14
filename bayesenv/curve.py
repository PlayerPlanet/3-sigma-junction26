"""Shared pieces of the model-size curve (train/modal_curve.py, scripts/eval_design_rows.py,
scripts/analyze_curve.py): which design rows are used, how the paired evaluation sample is drawn,
and how one completion is scored.

A completion is VALID exactly when `datagen.design_reward` gets past its parsing: after removing
`<think>...</think>`, the text holds at least one `<observe>[...]</observe>` tag, the LAST tag
parses as a JSON list of numbers, and that list equals one of the row's 6 candidates
(`np.allclose`, rtol 1e-6). Valid is not the same as reward > 0: a valid choice of a candidate
whose estimated EIG is <= 0 scores 0. The `control` arm pays 1.0 for valid and 0.0 otherwise.

Nothing here needs numpy at import time, so the Modal local entrypoints run with `--with modal`.
"""

from __future__ import annotations

import json
import random

# docs/TASK_SPEC.md, `no_design_headroom`: random experiments are as good as the reference's.
NO_HEADROOM = ("michaelis_menten", "exp_decay", "logistic_growth")
EVAL_SPLITS = ("heldout_instance", "heldout_family")
SAMPLE_SEED = 20261114


def cluster_of(r: dict) -> str:
    """The task instance a row belongs to (the unit the bootstrap resamples)."""
    return r.get("env") or f"{r['spec']}#{r['instance']}"


def row_id(r: dict) -> str:
    return r.get("id") or f"{cluster_of(r)}|{r['seed']}|{r.get('source', '')}|{r.get('depth', '')}"


def load_extra(spec: str, n: int = 0) -> list[dict]:
    """Extra evaluation files, "name=path[,name=path]": any JSONL of design rows (prompt, 6
    candidates, per-candidate `eig`, spec, instance, seed; optionally a per-candidate `value`).
    Rows are evaluated under split `name` (the file's own `split` is kept as `orig_split`), the
    first `n` of each file in file order (0 = all); ids are made unique within a file."""
    out = []
    for part in (p for p in spec.split(",") if p):
        name, path = part.split("=", 1)
        seen: dict = {}
        with open(path, encoding="utf-8") as f:
            rs = [json.loads(l) for l in f if l.strip()]
        for r in [r for r in rs if r.get("kind", "design") == "design"][:n or None]:
            k = seen[row_id(r)] = seen.get(row_id(r), 0) + 1
            out.append({**r, "id": row_id(r) + (f"|{k}" if k > 1 else ""), "orig_split": r.get("split"),
                        "split": name})
    return out


def usable(r: dict) -> bool:
    return r["kind"] == "design" and r["spec"] not in NO_HEADROOM


def eval_sample(rows: list[dict], split: str, n: int = 500, seed: int = SAMPLE_SEED) -> list[dict]:
    """The first `n` of a fixed seeded order of the usable design rows of `split`. A smaller n is
    a prefix of a larger one, so every model, arm and provider sees the same rows."""
    rs = sorted((r for r in rows if usable(r) and r["split"] == split), key=row_id)
    random.Random(f"{seed}:{split}").shuffle(rs)
    return rs[:n]


def train_rows(rows: list[dict]) -> list[dict]:
    return sorted((r for r in rows if usable(r) and r["split"] == "train"), key=row_id)


def design_choice(row: dict, completion: str) -> int | None:
    """Index of the chosen candidate, or None if the completion is not valid (same parse as
    `datagen.design_reward`)."""
    import numpy as np

    from .llm_agent import OBS_RE, THINK_RE

    m = OBS_RE.findall(THINK_RE.sub("", completion))
    if not m:
        return None
    try:
        x = np.asarray(json.loads(m[-1]), dtype=float).reshape(-1)
    except (ValueError, TypeError):
        return None
    for i, c in enumerate(row["candidates"]):
        if len(c) == len(x) and np.allclose(x, c, rtol=1e-6, atol=1e-12):
            return i
    return None


def chance_reward(eig: list[float]) -> float:
    """Expected `design_reward` of a uniformly random valid candidate."""
    e = [max(float(v), 0.0) for v in eig]
    return sum(e) / len(e) / max(max(e), 1e-12)


def demo_completion(row: dict) -> str:
    """The reference answer (identical to the row's `demo` twin written by datagen.instance_rows)."""
    eig = row["eig"]
    return f"<observe>{json.dumps(row['candidates'][eig.index(max(eig))])}</observe>"


def result_row(row: dict, completion: str, **extra) -> dict:
    """Per-row result, the one format every evaluator writes."""
    from .datagen import design_reward

    choice = design_choice(row, completion)
    out = {"id": row_id(row), "spec": row["spec"], "split": row["split"], "env": cluster_of(row),
           "instance": row["instance"], "seed": row["seed"], "source": row.get("source"),
           "depth": row.get("depth"), "completion": completion, "valid": choice is not None,
           "choice": -1 if choice is None else choice, "reward": design_reward(row, completion),
           "chance": round(chance_reward(row["eig"]), 5), "eig": row["eig"], **extra}
    if row.get("value") is not None:
        # optional per-candidate value (expected final reward under optimal continuation),
        # scored exactly like eig: value[i] / max(value), clipped at 0, 0 if not valid
        v = [max(float(x), 0.0) for x in row["value"]]
        out.update(value=row["value"], value_chance=round(chance_reward(row["value"]), 5),
                   value_reward=0.0 if choice is None else v[choice] / max(max(v), 1e-12))
    return out


def summarise(results: list[dict]) -> dict:
    out = {}
    for split in sorted({r["split"] for r in results}):
        rs = [r for r in results if r["split"] == split]
        out[split] = {"n": len(rs), "reward": round(sum(r["reward"] for r in rs) / len(rs), 4),
                      "valid": round(sum(r["valid"] for r in rs) / len(rs), 4),
                      "chance": round(sum(r["chance"] for r in rs) / len(rs), 4),
                      "best_pick": round(sum(r["reward"] >= 1.0 for r in rs) / len(rs), 4)}
        vs = [r for r in rs if "value_reward" in r]
        if vs:
            out[split].update(value_n=len(vs), value_reward=round(sum(r["value_reward"] for r in vs) / len(vs), 4),
                              value_chance=round(sum(r["value_chance"] for r in vs) / len(vs), 4))
    return out
