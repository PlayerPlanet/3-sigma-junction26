"""The Battleship text protocol the GRPO Gemma was evaluated with (transfer suite, `tasks.BSEpisode`),
rebuilt from a move history instead of a live BattleshipLab, so the server holds no game state.

Text, parsing, the one retry on an invalid answer and the "stop" fallback are copied from the eval
(`tasks.py`: BS_SYSTEM, bs_expected_score, bs_action_str, bs_parse, BSEpisode.text/prompt).
`check_prompt.py` asserts the text is identical to the eval's for random histories.
"""
import re

import numpy as np

import battleship as B

BS_SYSTEM = ("You are playing a search game. Maximise the expected score of your final report. "
             "Reply with the answer only.")
RETRY_SUFFIX = "\n(Your previous answer was invalid or unaffordable. Answer with exactly one action.)"


def bs_expected_score(b):
    g = B.geometry()
    q = np.clip(b.rules(), 1e-12, 1)
    rule = float((q * (np.log(q) - np.log(B.RULE_PRIOR))).sum()) / B.RULE_NORM
    o = np.clip(b.occupancy(), 1e-9, 1 - 1e-9)
    p0 = g.p0
    cell = float((o * np.log(o / p0) + (1 - o) * np.log((1 - o) / (1 - p0))).sum()) / g.cell_norm
    return 0.5 * (rule + cell)


def bs_action_str(a):
    if a < 36:
        return f"fire {a // 6} {a % 6}"
    li = a - 36
    return f"scan row {li}" if li < 6 else f"scan col {li - 6}"


def bs_parse(text, remaining):
    t = text.strip().lower()
    if re.match(r"^\W*(stop|done|submit)\b", t):
        return "stop"
    m = re.search(r"fire\D{0,3}([0-5])\D{1,3}([0-5])", t)
    if m:
        a = int(m.group(1)) * 6 + int(m.group(2))
        return a if remaining >= 1 else None
    m = re.search(r"scan\W*(row|col|column)\D{0,3}([0-5])", t)
    if m:
        a = 36 + int(m.group(2)) + (6 if m.group(1).startswith("col") else 0)
        return a if remaining >= 2 else None
    if re.search(r"\bstop\b", t):
        return "stop"
    return None


def validate(history):
    """history: [[action 0-47, result], ...] -> (list of (a, y), spent). Raises ValueError."""
    if not isinstance(history, list) or len(history) > B.BUDGET:
        raise ValueError("history must be a list of at most 20 moves")
    out, spent = [], 0
    for h in history:
        if (not isinstance(h, (list, tuple)) or len(h) != 2
                or any(isinstance(v, bool) or not isinstance(v, int) for v in h)):
            raise ValueError("each move is [action, result] with integers")
        a, y = h
        if not 0 <= a < B.N_ACTIONS:
            raise ValueError("action out of range")
        if not (y in (0, 1) if a < 36 else 0 <= y <= B.N):
            raise ValueError("result out of range")
        spent += B.action_cost(a)
        out.append((a, y))
    if spent > B.BUDGET:
        raise ValueError("history spends more than the budget")
    return out, spent


def belief_of(moves):
    b = B.Belief()
    for a, y in moves:
        b.update(a, y)
    b.rules()  # raises ValueError if the history is impossible
    return b


def text(b, moves, spent):
    remaining = B.BUDGET - spent
    occ = b.occupancy().reshape(6, 6)
    r = b.rules()
    hist = "; ".join(f"{bs_action_str(a)} -> " + (("hit" if y else "miss") if a < 36 else str(y))
                     for a, y in moves) or "none"
    lines = [
        "A 6x6 board (rows and columns 0-5) hides three ships (lengths 4, 3, 2; horizontal or vertical; no "
        "overlap), placed by one of six rules: any, no_touch, parallel, border, center_clear, clustered.",
        "Exact posterior probability of each rule: " + " | ".join(f"{n} {p:.3f}" for n, p in zip(B.NAMES, r)) + ".",
        "Exact posterior probability (percent) that each cell is covered by a ship (row 0 first, columns 0-5):"]
    for i in range(6):
        lines.append(f"  row {i}: " + " ".join(f"{int(round(100 * x)):>3d}" for x in occ[i]))
    lines += [
        "Actions: fire at one cell, written 'fire <row> <column>' (cost 1): reports hit or miss, wrong with "
        "probability 0.1. Scan one whole row or column, written 'scan row <index>' or 'scan col <index>' (cost 2): "
        "reports the number of ship cells in that line, off by one with probability 0.3. 'stop': end now. "
        "Repeating an action is allowed (fresh noise).",
        f"Results so far: {hist}.",
        f"Budget: {spent} of {B.BUDGET} used ({remaining} remaining).",
        "When you stop (or the budget runs out) the exact posterior is reported; the score is the log-probability "
        "it gives to the true rule and the true cell states, relative to the prior. Unspent budget is worth nothing.",
        f"Expected score if you stop now: {max(0.0, bs_expected_score(b)):.3f}.",
        "Answer with exactly one action, for example: fire 2 3, scan row 1, scan col 4, or stop."]
    return "\n".join(lines)


def messages(b, moves, spent, retry=False):
    return [{"role": "system", "content": BS_SYSTEM},
            {"role": "user", "content": text(b, moves, spent) + (RETRY_SUFFIX if retry else "")}]
