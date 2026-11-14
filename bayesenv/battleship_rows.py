"""Rulebound Battleship as design rows, for GRPO / SFT training and for evaluating any chat model.

Same row schema as `bayesenv/datagen.py` and `bayesenv/lab_rows.py` (branch lab-rows), so the
model-size-curve pipeline (`train/modal_curve.py`, `scripts/eval_design_rows.py`, branch
size-curve) trains and evaluates on these rows unchanged, and can evaluate the trained model
zero-shot on the lab rows (`lab:wetlab`, `lab:chem`, ...):

    prompt      system (the full game: rules, generative model, noise, costs, prior) +
                "Begin..." + the history as <observe>[design]</observe> / "Result: ..." turns +
                the six candidate next actions
    candidates  six affordable actions as designs:
                    [0, row, col]   fire at a cell (cost 1)
                    [1, 0, i]       scan row i (cost 2)
                    [1, 1, i]       scan column i (cost 2)
    eig         per candidate: the EXACT expected information gain about the hidden (rule,
                layout) divided by the action's cost, in nats per unit of budget. This is what
                the Battleship reference maximises, so `datagen.design_reward` (eig[chosen] /
                max(eig)) is 1 for the reference's choice. Also stored: eig_nats, cost.

Everything a label depends on is in the row: the exact posterior used for the labels is
computed from the actions and results as printed. The hidden board is never written.
Candidates (v2, "matched"): 3 fires + 3 scans: the best fire, the best scan (one of them is the
best affordable action overall), and two more of each type picked at matched values (for two
random target values, the fire and the scan whose label is closest). Action type then carries
almost no information about the label. With v1's "best + 5 random" candidates the best action
was a scan in 74% of rows, so "pick any scan" scored 0.78 against 0.57 for a random pick; with
matched candidates every simple shortcut we tried scores within 0.04 of a random pick
(tests/test_battleship_rows.py checks this). States with fewer than 3 affordable scans
(budget 1 left) are skipped. Histories come from the reference
(`source: "reference"`) or from uniformly random affordable actions (`source: "random"`),
balanced over (source, depth). States where no candidate has 1e-3 nats per unit are skipped.
"""

from __future__ import annotations

import hashlib
import json
import re

import numpy as np

from . import battleship as B

SPEC = "game:battleship"
SALT = "battleship_rows"
SEED_BASE = {"train": 8_100_000, "heldout_instance": 8_500_000}
SOURCES = ("reference", "random")
MAX_DEPTH = 14                 # depth = number of actions already taken
N_CANDIDATES = 6
CANDIDATES = "matched-v2"
MIN_EIG = 1e-3
INTRO = "You are a scientist running experiments on an unknown system."
BEGIN = "Begin. Run your first experiment."
OBS_RE = re.compile(r"<observe>\s*(\[.*?\])\s*</observe>", re.S)
THINK_RE = re.compile(r"<think>.*?</think>", re.S)


def spec_hash() -> str:
    return hashlib.sha256(json.dumps(B.rules(), sort_keys=True).encode()).hexdigest()[:12]


def design_of(a: int) -> list[int]:
    if a < B.N * B.N:
        return [0, a // B.N, a % B.N]
    li = a - B.N * B.N
    return [1, 0 if li < B.N else 1, li % B.N]


def action_of(design) -> int:
    """Inverse of design_of; raises ValueError for anything that is not a valid action."""
    d = [float(v) for v in design]
    if len(d) != 3 or any(v != int(v) for v in d):
        raise ValueError("an action is [0, row, col] or [1, axis, index] with integers")
    k, a, b = map(int, d)
    if k == 0 and 0 <= a < B.N and 0 <= b < B.N:
        return a * B.N + b
    if k == 1 and a in (0, 1) and 0 <= b < B.N:
        return B.N * B.N + a * B.N + b
    raise ValueError("an action is [0, row, col] (fire) or [1, axis, index] (scan; axis 0 = row, "
                     "1 = column), with row, col, index in 0-5")


def result_message(rec: dict) -> str:
    return f"Result: {rec['result']}. Budget remaining: {rec['budget_remaining']}."


def system_prompt(one_tag: bool = True) -> str:
    """The full game, in the section layout of the toy and lab rows' system prompts."""
    r = B.rules()
    rules = "\n".join(f"{i + 1}. {x['name']} ({x['number_of_layouts']} layouts): {x['definition']}"
                      for i, x in enumerate(r["rules"]))
    prior = "\n".join(" ".join(f"{p:.3f}" for p in row) for row in r["prior_occupancy"])
    describe = (
        "A 6x6 board (rows and columns numbered 0-5) hides three ships: lengths 4, 3 and 2, each "
        "horizontal or vertical, never overlapping. They were placed by exactly ONE of the "
        "placement rules below. Each experiment is one action, written as a design: [0, row, col] "
        f"fires at one cell (cost {B.COST['fire']}) and reports 1 (hit) or 0 (miss), but the "
        f"report is wrong with probability {B.FIRE_NOISE}; [1, 0, i] scans row i and [1, 1, i] "
        f"scans column i (cost {B.COST['scan']}) and report the number of ship cells in that whole "
        f"row or column, off by -1 / +1 with probability {B.SCAN_NOISE[-1]} / {B.SCAN_NOISE[1]} "
        "each, then clipped to 0-6. Actions never change the board; repeating one draws fresh "
        "noise.")
    card = (
        "Exact generative model: (1) a rule is drawn uniformly at random from the list (each "
        f"1/{B.K}); (2) the layout is drawn uniformly from ALL layouts that satisfy that rule (a "
        "layout can satisfy several rules; 'any' is satisfied by every layout); (3) each "
        "action's noise is independent.\n"
        f"Rules:\n{rules}\n"
        f"Prior probability that each cell is covered by a ship (row 0 first):\n{prior}")
    limit = (f"Your budget is {B.BUDGET}: every action spends its cost, and an action you "
             "cannot afford is rejected.")
    final = ("you will then be asked for the probability of each rule and, for every cell, the "
             "probability that a ship covers it. Your answer is scored by the log of the "
             "probability it assigns to the truth relative to the prior, so be calibrated: "
             "confident where the evidence supports it, uncertain where it does not.")
    fmt = ('a JSON object {"rules": {name: probability, ...}, "occupancy": 6 rows of 6 '
           "probabilities}")
    tags = ("exactly one tag" if one_tag else
            "one or more tags (they run in order, and you see all their results afterwards)")
    return (f"{INTRO}\n\n{describe}\n\n{card}\n\n{limit} Choose each one to learn as much as "
            f"possible; {final}\n\n"
            f"To run an experiment, reply with your reasoning followed by {tags}, e.g. "
            "<observe>[0, 2, 3]</observe>. To stop experimenting early, reply <done/>.\n"
            f"In the final phase you must answer with {fmt}, and nothing after it.")


def candidates_message(clist: list[list]) -> str:
    lines = "\n".join(f"{i + 1}: {json.dumps(c)}" for i, c in enumerate(clist))
    return ("Choose your next experiment from these candidate designs, picking the one you expect "
            f"to be most informative:\n{lines}\nReply with exactly one tag, <observe>[design]</observe>.")


def _play(seed: int, source: str, depth: int) -> B.BattleshipLab | None:
    lab = B.BattleshipLab()
    lab.reset(seed, SALT)
    rng = np.random.default_rng([seed, 0xB5A6, SOURCES.index(source)])
    for _ in range(depth):
        if lab.remaining <= 0:
            return None
        if source == "reference":
            a = B.greedy_action(lab.belief, lab.remaining)
        else:
            ok = [a for a in range(B.N_ACTIONS) if B.action_cost(a) <= lab.remaining]
            a = int(rng.choice(ok))
        lab.step_id(a)
    return lab


def matched_candidates(per: np.ndarray, ok, rng: np.random.Generator) -> list[int] | None:
    """3 fires + 3 scans: best of each type, then two value-matched pairs (see module doc)."""
    fires = [int(a) for a in ok if a < B.N * B.N]
    scans = [int(a) for a in ok if a >= B.N * B.N]
    if len(fires) < 3 or len(scans) < 3:
        return None
    bf = max(fires, key=lambda a: per[a])
    bs = max(scans, key=lambda a: per[a])
    sel = [bf, bs]
    rf = [a for a in fires if a != bf]
    rs = [a for a in scans if a != bs]
    lo, hi = min(per[a] for a in rf + rs), max(per[a] for a in rf + rs)
    for _ in range(2):
        v = rng.uniform(lo, hi)
        f = min(rf, key=lambda a: abs(per[a] - v))
        sc = min(rs, key=lambda a: abs(per[a] - v))
        sel += [f, sc]
        rf.remove(f)
        rs.remove(sc)
    return sel


def make_row(seed: int, source: str, depth: int, split: str, h: str | None = None) -> dict | None:
    lab = _play(seed, source, depth)
    if lab is None or lab.remaining <= 0:
        return None
    eig = lab.belief.eig()
    cost = np.array([B.action_cost(a) for a in range(B.N_ACTIONS)])
    ok = np.flatnonzero(cost <= lab.remaining)
    if len(ok) < N_CANDIDATES:
        return None
    per = eig / cost
    best = int(ok[np.argmax(per[ok])])
    if per[best] < MIN_EIG:
        return None
    rng = np.random.default_rng([seed, 0xB5A7])
    cands = matched_candidates(per, ok, rng)
    if cands is None:
        return None
    rng.shuffle(cands)
    h = h or spec_hash()
    msgs = [{"role": "system", "content": system_prompt()}, {"role": "user", "content": BEGIN}]
    for rec in lab.history:
        a = B.parse_action(rec)[0]
        msgs.append({"role": "assistant", "content": f"<observe>{json.dumps(design_of(a))}</observe>"})
        msgs.append({"role": "user", "content": result_message(rec)})
    clist = [design_of(a) for a in cands]
    msgs[-1] = {"role": "user", "content": msgs[-1]["content"] + "\n" + candidates_message(clist)}
    return {"spec": SPEC, "spec_hash": h, "instance": int(seed), "seed": int(seed), "split": split,
            "env": f"{SPEC}@{h}#{seed}", "family": "categorical", "source": source,
            "depth": int(depth), "prompt": msgs, "kind": "design", "candidates": clist,
            "eig": [round(float(per[a]), 5) + 0.0 for a in cands],
            "eig_nats": [round(float(eig[a]), 5) + 0.0 for a in cands],
            "cost": [int(cost[a]) for a in cands], "budget_remaining": int(lab.remaining),
            "candidates_rule": CANDIDATES}


def generate(split: str, n: int, depths=range(MAX_DEPTH + 1)) -> list[dict]:
    """n rows of a split, balanced over (source, depth); one fresh seed per row."""
    h = spec_hash()
    cells = [(s, d) for s in SOURCES for d in depths]
    rows, seed = [], SEED_BASE[split]
    per_cell = -(-n // len(cells))
    for s, d in cells:
        got = tries = 0
        while got < per_cell and tries < 20 * per_cell:   # deep reference states may not exist
            seed += 1
            tries += 1
            r = make_row(seed, s, d, split, h)
            if r is not None:
                rows.append(r)
                got += 1
    rng = np.random.default_rng(SEED_BASE[split])
    rng.shuffle(rows)
    return rows[:n]


def reference_answer(row: dict) -> str:
    return f"<observe>{json.dumps(row['candidates'][int(np.argmax(row['eig']))])}</observe>"


def design_reward(row: dict, completion: str) -> float:
    """Same rule as datagen.design_reward: eig[chosen] / max(eig), 0 if not a candidate."""
    m = OBS_RE.findall(THINK_RE.sub("", completion))
    if not m:
        return 0.0
    try:
        x = [float(v) for v in json.loads(m[-1])]
    except (ValueError, TypeError):
        return 0.0
    eig = np.maximum(np.asarray(row["eig"], float), 0.0)
    for c, e in zip(row["candidates"], eig):
        if len(c) == len(x) and np.allclose(x, c):
            return float(e / max(eig.max(), 1e-12))
    return 0.0
