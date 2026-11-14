"""E3: LLM agents in the environments (gap to the Bayesian reference + loss decomposition).

    python experiments/llm_runs.py --provider modal --model gemma-4-26b-a4b-it \
        --envs hyperbolic location --seeds 0:200 --concurrency 48 --out results/e3.jsonl

Appends one JSON row per episode (graded three ways, with transcript). Resumable: episodes
already present in --out for the same model are skipped.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bayesenv.llm_agent import BudgetExceeded, Model, run_episode  # noqa: E402
from bayesenv.task import Task  # noqa: E402


def load_env_file(path: Path = Path(".env")) -> None:
    import os
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


async def main(a) -> None:
    load_env_file()
    model = Model(a.provider, a.model, max_tokens=a.max_tokens,
                  temperature=None if a.no_temperature else a.temperature, rpm=a.rpm)
    lo, hi = map(int, a.seeds.split(":"))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if out.exists():
        for line in out.read_text().splitlines():
            r = json.loads(line)
            if r.get("model") == a.model:
                done.add((r["env"], r["seed"], r.get("rep", 0)))
    jobs = [(e, s, rep) for rep in range(a.reps) for s in range(lo, hi) for e in a.envs
            if (e, s, rep) not in done]
    print(f"{len(jobs)} episodes to run ({len(done)} already done)", flush=True)
    sem = asyncio.Semaphore(a.concurrency)
    lock = asyncio.Lock()
    stop = asyncio.Event()
    n_ok = n_err = 0

    async def one(env, seed, rep):
        nonlocal n_ok, n_err
        if stop.is_set():
            return
        async with sem:
            if stop.is_set():
                return
            try:
                row = await run_episode(model, Task(env, seed), f"{a.model}:{env}:{seed}:{rep}")
                row["rep"] = rep
            except BudgetExceeded as e:
                print(f"STOP: {e}", flush=True)
                stop.set()
                return
            except Exception as e:  # keep going; log the failure
                n_err += 1
                print(f"error {env} {seed}: {type(e).__name__}: {e}"[:300], flush=True)
                if n_err <= 3:
                    traceback.print_exc()
                return
            async with lock:
                with out.open("a") as f:
                    f.write(json.dumps(row) + "\n")
                n_ok += 1
                if n_ok % 20 == 0:
                    print(f"{n_ok} done, {n_err} errors", flush=True)

    await asyncio.gather(*(one(*j) for j in jobs))
    print(f"finished: {n_ok} ok, {n_err} errors", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--provider", required=True)
    p.add_argument("--model", required=True)
    p.add_argument("--envs", nargs="+", default=["hyperbolic", "location"])
    p.add_argument("--seeds", default="0:50")
    p.add_argument("--reps", type=int, default=1)
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--max-tokens", type=int, default=2048)
    p.add_argument("--temperature", type=float, default=0.7)
    p.add_argument("--no-temperature", action="store_true")
    p.add_argument("--rpm", type=float, default=None)
    p.add_argument("--out", default="results/e3.jsonl")
    asyncio.run(main(p.parse_args()))
