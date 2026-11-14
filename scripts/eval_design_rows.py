"""Evaluate a hosted model on the same held-out design rows as train/modal_curve.py.

    python scripts/eval_design_rows.py --provider gemini --model gemini-4-hydrogen \
        --rows data/v1/rows.jsonl --n 500 [--name gemini-4-hydrogen] [--out results/curve/full]

`--rows` is the generated rows.jsonl: the evaluation sample is drawn with
`bayesenv.curve.eval_sample`, so it is the same `--n` rows per split (heldout_instance,
heldout_family) that the Modal pipeline uses, in the same order. `--extra-eval
lab_transfer=path/lab_rows.jsonl` adds every row of another design-row file under that split
name, as `--extra-eval lab_transfer=/vol/lab_rows.jsonl` does in the Modal pipeline. Output:
<out>/<name>/base/eval_rows.jsonl, the per-row format scripts/analyze_curve.py reads.

Calls go through `bayesenv.llm_agent.Model` (API key from the environment, per-provider request
caps apply: 2 x n requests). Temperature 0 unless --temperature is given. The Modal pipeline caps
answers at 128 new tokens with thinking off; hosted reasoning models may spend output tokens on
hidden reasoning, so the default here is 2048 and the cap used is recorded in the summary.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bayesenv.curve import EVAL_SPLITS, eval_sample, load_extra, result_row, row_id, summarise  # noqa: E402
from bayesenv.llm_agent import Model  # noqa: E402


async def main(a) -> None:
    rows = []
    if a.rows and a.n > 0:
        allrows = [r for r in map(json.loads, open(a.rows, encoding="utf-8")) if r["kind"] == "design"]
        rows = [r for s in EVAL_SPLITS for r in eval_sample(allrows, s, a.n)]
    rows += load_extra(a.extra_eval)
    model = Model(a.provider, a.model, max_tokens=a.max_tokens,
                  temperature=None if a.temperature < 0 else a.temperature, rpm=a.rpm or None)
    sem = asyncio.Semaphore(a.concurrency)
    d = Path(a.out) / (a.name or a.model.replace("/", "_")) / "base"
    d.mkdir(parents=True, exist_ok=True)
    done = {}
    if a.resume and (d / "eval_rows.jsonl").exists():
        done = {r["id"]: r for r in map(json.loads, open(d / "eval_rows.jsonl", encoding="utf-8"))}

    async def one(row):
        if row_id(row) in done:
            return done[row_id(row)]
        async with sem:
            try:
                text, usage = await model.chat(row["prompt"][0]["content"], row["prompt"][1:])
            except Exception as e:  # a failed call is recorded, not scored as an answer
                return {"id": row_id(row), "error": f"{type(e).__name__}: {e}"[:300]}
        return result_row(row, text.strip(), new_tokens=usage.get("out"), prompt_tokens=usage.get("in"),
                          stop=usage.get("stop"))

    t0 = time.time()
    results = await asyncio.gather(*(one(r) for r in rows))
    ok = [r for r in results if "error" not in r]
    with open(d / "eval_rows.jsonl", "w", encoding="utf-8") as f:
        for r in ok:
            f.write(json.dumps(r) + "\n")
    summary = {"model": a.name or a.model, "provider": a.provider, "api_model": a.model, "arm": "base",
               "max_tokens": a.max_tokens, "temperature": a.temperature, "seconds": round(time.time() - t0, 1),
               "errors": len(results) - len(ok), "splits": summarise(ok) if ok else {}}
    (d / "eval_summary.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps(summary, indent=1))
    for r in results:
        if "error" in r:
            print("ERROR", r["id"], r["error"])
            break


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--provider", required=True)
    p.add_argument("--model", required=True)
    p.add_argument("--rows", default="data/v1/rows.jsonl")
    p.add_argument("--n", type=int, default=500, help="rows per held-out split")
    p.add_argument("--name", default="", help="directory name of this model under --out")
    p.add_argument("--out", default="results/curve/full")
    p.add_argument("--max-tokens", type=int, default=2048)
    p.add_argument("--temperature", type=float, default=0.0, help="negative: provider default")
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--rpm", type=float, default=0.0)
    p.add_argument("--resume", action="store_true", help="keep rows already in the output file")
    p.add_argument("--extra-eval", default="", help='extra local design-row files, "name=path[,name=path]": '
                   "all their rows, evaluated under split `name` (--n 0 runs only these)")
    asyncio.run(main(p.parse_args()))
