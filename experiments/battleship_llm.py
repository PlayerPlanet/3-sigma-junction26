"""Full Rulebound Battleship episodes with any chat model (no tools), graded exactly.

    python experiments/battleship_llm.py --provider gemini --model <gemini-model-id> \
        --seeds 0:10 --out results/battleship_llm/runs.jsonl
    python experiments/battleship_llm.py --provider modal --model gemma-4-26b-a4b-it --seeds 0:50

Protocol (the same designs and result lines as the training rows, bayesenv/battleship_rows.py):
the model replies with reasoning and <observe>[design]</observe> tags, [0, row, col] = fire,
[1, axis, index] = scan (axis 0 = row, 1 = column); several tags per reply run in order (this
saves requests under per-provider caps; --one-tag forces one action per reply); <done/> stops
early. Then it is asked for {"rules": {...}, "occupancy": 6x6}. Invalid actions are rejected
without spending budget; after 4 invalid replies, or an unparseable final answer after 3 tries,
the episode is graded with the prior for the missing part (score 0 for doing nothing).

Every model plays the same hidden boards (fixed --salt), so models are compared paired, and the
reference's score on each board is recorded. Outputs: one JSON row per episode in --out
(resumable: episodes already there for the same model are skipped), and a replay file per
episode under <out dir>/<model>/seed-<n>.json that scripts/battleship_ui.py lists for replay.
Requests go through bayesenv.llm_agent.Model, so its per-provider request caps apply
(gemini: 300 in total); the script prints the requests it used.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bayesenv import battleship as B  # noqa: E402
from bayesenv import battleship_rows as R  # noqa: E402
from bayesenv.llm_agent import BudgetExceeded, Model  # noqa: E402

FINAL = ("The experiment phase is over. Answer with your beliefs as one JSON object and nothing "
         'after it: {"rules": {"any": p, "no_touch": p, "parallel": p, "border": p, '
         '"center_clear": p, "clustered": p}, "occupancy": [[6 numbers], ... 6 rows]}, where '
         "occupancy[row][col] is the probability that a ship covers that cell.")
# Reasoning models can spend more than 16k tokens thinking before the 6x6 answer (bench-v1:
# every final answer of kimi-k3-1-pro was empty after hitting the limit).
FINAL_TOKENS = int(os.environ.get("BATTLESHIP_FINAL_TOKENS", "32768"))
EMPTY_RETRIES = 2
SCALARS = ("score", "score_raw", "rule_part", "cell_part", "design", "inference", "accuracy",
           "ppc_p", "n_actions", "n_fires", "n_scans", "budget_used", "reference_score_raw",
           "gap_to_reference", "hidden_rule")


def parse_beliefs(text: str):
    """The last JSON object in the text that parse_submission accepts, or None."""
    text = R.THINK_RE.sub("", text)
    dec = json.JSONDecoder()
    found = None
    for i, ch in enumerate(text):
        if ch != "{":
            continue
        try:
            obj, _ = dec.raw_decode(text[i:])
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and "rules" in obj:
            try:
                found = B.parse_submission(obj["rules"], obj.get("occupancy"))
            except (ValueError, TypeError):
                continue
    return found


async def run_episode(model: Model, seed: int, salt: str, one_tag: bool) -> tuple[dict, dict]:
    lab = B.BattleshipLab()
    lab.reset(seed, salt)
    system = R.system_prompt(one_tag=one_tag)
    msgs = [{"role": "user", "content": R.BEGIN}]
    usage = {"in": 0, "out": 0, "calls": 0, "empty": 0}
    transcript, invalid, stops = [], 0, []

    async def ask(max_tokens=None):
        # An empty reply (reasoning ran out of tokens, or a provider hiccup) is retried, not
        # charged as a move, and never put in the history: some providers stall after an empty
        # assistant turn. The stop reason of every call is kept for diagnosis.
        for _ in range(EMPTY_RETRIES + 1):
            text, u = await model.chat(system, msgs, max_tokens=max_tokens)
            usage["in"] += u["in"]
            usage["out"] += u["out"]
            usage["calls"] += 1
            stops.append(str(u.get("stop")))
            if text.strip():
                break
            usage["empty"] += 1
        transcript.append(text)
        msgs.append({"role": "assistant", "content": text if text.strip() else "(no reply)"})
        return text

    while lab.remaining > 0 and invalid < 4:
        text = await ask()
        visible = R.THINK_RE.sub("", text)
        tags = R.OBS_RE.findall(visible)
        if "<done/>" in visible and not tags:
            break
        if one_tag:
            tags = tags[-1:]
        lines = []
        if not tags:
            invalid += 1
            lines.append("Invalid reply: no <observe>[design]</observe> tag found.")
        for t in tags:
            try:
                rec = lab.step_id(R.action_of(json.loads(t)))
                lines.append(R.result_message(rec))
            except (ValueError, RuntimeError, TypeError, json.JSONDecodeError) as e:
                invalid += 1
                lines.append(f"Invalid experiment {t} ({e}). Budget remaining: {lab.remaining}.")
            if lab.remaining <= 0:
                break
        msgs.append({"role": "user", "content": "\n".join(lines)})
    msgs.append({"role": "user", "content": FINAL})
    beliefs = None
    for _ in range(3):
        text = await ask(max_tokens=max(4 * model.max_tokens, FINAL_TOKENS))
        beliefs = parse_beliefs(text)
        if beliefs is not None:
            break
        msgs.append({"role": "user", "content": "That was not a valid JSON object of the required "
                     "form. Answer with the JSON object only."})
    parsed = beliefs is not None
    q, occ = beliefs if parsed else (B.RULE_PRIOR.copy(), None)
    res = lab.submit(q, occ, reference=True)
    row = {"model": model.name, "provider": model.provider, "seed": seed, "salt": salt,
           "parsed": parsed, "invalid_actions": invalid, **usage,
           **{k: res[k] for k in SCALARS}, "history": lab.history, "stops": stops, "transcript": transcript}
    replay = {"label": f"{model.name} (no tools), board {seed}",
              "trajectory": {"history": lab.history, "snapshots": lab.snapshots, "result": res},
              "reference": B.reference_trajectory(seed, salt)}
    return row, replay


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
                  temperature=None if a.temperature < 0 else a.temperature, rpm=a.rpm or None)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    rdir = out.parent / a.model.replace("/", "_")
    rdir.mkdir(parents=True, exist_ok=True)
    done = set()
    if out.exists():
        done = {r["seed"] for r in map(json.loads, out.read_text().splitlines())
                if r["model"] == a.model and r["salt"] == a.salt}
    lo, hi = map(int, a.seeds.split(":"))
    seeds = [s for s in range(lo, hi) if s not in done]
    print(f"{len(seeds)} episodes to run ({len(done)} already done)", flush=True)
    sem, lock, stop = asyncio.Semaphore(a.concurrency), asyncio.Lock(), asyncio.Event()
    calls = 0

    async def one(seed):
        nonlocal calls
        if stop.is_set():
            return
        async with sem:
            try:
                row, replay = await run_episode(model, seed, a.salt, a.one_tag)
            except BudgetExceeded as e:
                print(f"STOP: {e}", flush=True)
                stop.set()
                return
            except Exception as e:  # noqa: BLE001
                print(f"error seed {seed}: {type(e).__name__}: {e}"[:300], flush=True)
                traceback.print_exc()
                return
        async with lock:
            calls += row["calls"]
            with out.open("a") as f:
                f.write(json.dumps(row) + "\n")
            (rdir / f"seed-{seed}.json").write_text(json.dumps(replay))
            print(f"seed {seed}: score {row['score_raw']:+.3f} (reference "
                  f"{row['reference_score_raw']:+.3f}), {row['n_actions']} actions, "
                  f"{row['calls']} requests", flush=True)

    await asyncio.gather(*(one(s) for s in seeds))
    print(f"done; {calls} requests this run", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--provider", required=True)
    p.add_argument("--model", required=True)
    p.add_argument("--seeds", default="0:10")
    p.add_argument("--salt", default="battleship-llm-v1")
    p.add_argument("--one-tag", action="store_true", help="one action per reply")
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--max-tokens", type=int, default=4096)
    p.add_argument("--temperature", type=float, default=0.7, help="negative: provider default")
    p.add_argument("--rpm", type=float, default=0.0)
    p.add_argument("--out", default="results/battleship_llm/runs.jsonl")
    asyncio.run(main(p.parse_args()))
