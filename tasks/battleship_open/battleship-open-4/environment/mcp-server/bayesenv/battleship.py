"""Rulebound Battleship: find hidden ships AND the hidden rule that placed them, from noisy shots.

A 6x6 board hides three ships (lengths 4, 3, 2; horizontal or vertical; no overlap). The ships
were placed by one of six public placement rules (RULES), chosen uniformly at random; given the
rule, the layout is uniform over all layouts that satisfy it. The agent spends a shot budget on

    fire(row, col)   cost 1   reports hit / miss, flipped with probability FIRE_NOISE (or, in the
                              unknown-noise variant, an error rate drawn from FIRE_LEVELS)
    scan(axis, i)    cost 2   reports the number of ship cells in row/column i, off by -1 / +1
                              with probability SCAN_NOISE[-1] / SCAN_NOISE[+1], clipped to [0, 6]

and then submits (a) a probability for each rule and (b) a probability that each of the 36
cells is covered by a ship. This is the wet lab with the domain swapped: rule = mechanism,
ship layout = rate constants, a shot = an experiment, the shot budget = the stock, the noise =
assay noise.

Everything is exact. The hidden state is (rule, layout); there are 53,624 layouts, so the
posterior is computed by enumeration, and so are the expected information gain of every
action, the reference policy, the design / inference split of the agent's loss, and the
posterior predictive leak test (an exact sum over all states, no Monte Carlo).

Reward (see score()): with q the submission mixed with EPS of the public prior,

    rule_part = [log q(rule*) - log (1/6)] / log 6
    cell_part = sum_c [log q_c(y*_c) - log p0_c(y*_c)] / sum_c H(p0_c)
    score_raw = (rule_part + cell_part) / 2

p0_c is the public prior probability that cell c is covered and H the binary entropy (nats).
Both normalisers are public constants (they do not depend on the hidden state), so score_raw is
an affine transform of the log score: strictly proper (reporting the exact posterior maximises
the expected score), 0 for submitting the prior, about 1 in expectation for knowing the hidden
state. The Harbor score is clip(score_raw, 0, 1); analyses use the unclipped score_raw.
"""

from __future__ import annotations

import hashlib
import math
from functools import lru_cache

import numpy as np

# ---- public constants -------------------------------------------------------------------

N = 6
SHIPS = (4, 3, 2)
SHIP_NAMES = ("battleship", "cruiser", "destroyer")
FIRE_NOISE = 0.10
SCAN_NOISE = {-1: 0.15, 0: 0.70, 1: 0.15}
BUDGET = 20
COST = {"fire": 1, "scan": 2}
EPS = 1e-3
# Open world (bayesenv/battleship_open.py loads this file again with OPEN_WORLD = True): a 7th
# hypothesis, "other", meaning none of the six listed rules placed the ships.
OPEN_WORLD = bool(globals().get("OPEN_WORLD", False))
# Unknown instrument noise (bayesenv/battleship_hard.py): the fire error rate is not 0.1 but one
# of FIRE_LEVELS, drawn once per game with a uniform prior and disclosed as such. Scans keep
# their known noise, so they also serve to calibrate the fire instrument.
UNKNOWN_NOISE = bool(globals().get("UNKNOWN_NOISE", False))
FIRE_LEVELS = (0.05, 0.15, 0.30) if UNKNOWN_NOISE else (FIRE_NOISE,)
FIRE_LEVEL_PRIOR = np.full(len(FIRE_LEVELS), 1.0 / len(FIRE_LEVELS))
FIRE_NOISE_PHRASE = (
    "wrong with an unknown probability e, the same for every fire in the game: e is 0.05, 0.15 "
    "or 0.3, each with prior probability 1/3, drawn once per game independently of everything "
    "else" if UNKNOWN_NOISE else f"wrong with probability {FIRE_NOISE}")
OTHER_MAX_AREA = 18
CENTRE = ((2, 2), (2, 3), (3, 2), (3, 3))

RULES = (
    ("any", "No constraint: any layout in which the three ships do not overlap."),
    ("no_touch", "No two ships touch, not even diagonally: no cell of one ship is among the 8 "
                 "neighbours of a cell of another ship."),
    ("parallel", "All three ships have the same orientation (all horizontal or all vertical)."),
    ("border", "Every ship has at least one cell on the outer edge of the board (row 0 or 5, "
               "or column 0 or 5)."),
    ("center_clear", "No ship covers any of the four centre cells (rows 2-3, columns 2-3)."),
    ("clustered", "Every ship touches at least one other ship (8-neighbourhood: sharing an edge "
                  "or a corner counts)."),
)
if OPEN_WORLD:
    RULES = RULES + (
        ("other", "None of the rules above. All three ships lie inside one hidden rectangle of "
                  "the board (a block of whole rows by whole columns) that covers at most "
                  f"{OTHER_MAX_AREA} of the 36 cells. The rectangle is drawn uniformly from all "
                  "such rectangles that can hold the three ships; the layout is then drawn "
                  "uniformly from all layouts inside it."),)
NAMES = tuple(n for n, _ in RULES)
K = len(RULES)
RULE_PRIOR = np.full(K, 1.0 / K)
RULE_NORM = math.log(K)
N_LINES = 2 * N                      # 0..5 = rows, 6..11 = columns
N_ACTIONS = N * N + N_LINES          # fires first, then scans


def salted_key(seed: int, salt: str | None, tag: int) -> list[int]:
    """Same scheme as chem_lab.salted_key: without the salt the streams cannot be recomputed."""
    if salt is None:
        return [int(seed), tag]
    h = hashlib.sha256(f"{salt}:{seed}".encode()).digest()
    return [int(seed), tag] + [int.from_bytes(h[i:i + 4], "little") for i in range(0, 32, 4)]


def _h2(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-15, 1 - 1e-15)
    return -(p * np.log(p) + (1 - p) * np.log1p(-p))


# ---- geometry: every layout, rule membership, prior ---------------------------------------

class Geometry:
    """All layouts and the public prior, enumerated once (about 50 ms)."""

    def __init__(self) -> None:
        places = []
        for length in SHIPS:
            ps = []
            for horiz in (1, 0):
                for r in range(N):
                    for c in range(N):
                        cells = [(r, c + i) if horiz else (r + i, c) for i in range(length)]
                        if all(a < N and b < N for a, b in cells):
                            ps.append((horiz, cells))
            places.append(ps)
        self.placements = places

        def mask(cells, dilate=False):
            m = np.zeros(N * N, bool)
            for a, b in cells:
                for da in ((-1, 0, 1) if dilate else (0,)):
                    for db in ((-1, 0, 1) if dilate else (0,)):
                        x, y = a + da, b + db
                        if 0 <= x < N and 0 <= y < N:
                            m[x * N + y] = True
            return m

        M = [np.array([mask(c) for _, c in p]) for p in places]
        D = [np.array([mask(c, True) for _, c in p]) for p in places]
        O = [np.array([h for h, _ in p]) for p in places]
        edge = [np.array([any(a in (0, N - 1) or b in (0, N - 1) for a, b in c) for _, c in p])
                for p in places]
        cen = {a * N + b for a, b in CENTRE}
        hit_c = [np.array([any(a * N + b in cen for a, b in c) for _, c in p]) for p in places]

        i, j, k = (g.ravel() for g in np.meshgrid(*[np.arange(len(p)) for p in places],
                                                  indexing="ij"))
        overlap = ((M[0][i] & M[1][j]).any(1) | (M[0][i] & M[2][k]).any(1)
                   | (M[1][j] & M[2][k]).any(1))
        i, j, k = i[~overlap], j[~overlap], k[~overlap]
        self.ships = np.stack([i, j, k], 1)                 # (L, 3) placement indices
        self.occ = M[0][i] | M[1][j] | M[2][k]               # (L, 36) bool
        t01 = (D[0][i] & M[1][j]).any(1)
        t02 = (D[0][i] & M[2][k]).any(1)
        t12 = (D[1][j] & M[2][k]).any(1)
        member = {
            "any": np.ones(len(i), bool),
            "no_touch": ~(t01 | t02 | t12),
            "parallel": (O[0][i] == O[1][j]) & (O[1][j] == O[2][k]),
            "border": edge[0][i] & edge[1][j] & edge[2][k],
            "center_clear": ~(hit_c[0][i] | hit_c[1][j] | hit_c[2][k]),
            "clustered": (t01 | t02) & (t01 | t12) & (t02 | t12),
        }
        self.L = len(i)
        self.rects: list[tuple[int, int, int, int]] = []
        if OPEN_WORLD:
            occ = M[0][i] | M[1][j] | M[2][k]
            inside_sets = []
            for r0 in range(N):
                for r1 in range(r0, N):
                    for c0 in range(N):
                        for c1 in range(c0, N):
                            if (r1 - r0 + 1) * (c1 - c0 + 1) > OTHER_MAX_AREA:
                                continue
                            box = np.zeros(N * N, bool)
                            for a in range(r0, r1 + 1):
                                box[a * N + c0:a * N + c1 + 1] = True
                            m = ~(occ & ~box).any(1)
                            if m.any():
                                self.rects.append((r0, r1, c0, c1))
                                inside_sets.append(m)
            self.rect_member = np.stack(inside_sets)                       # (R, L)
            lik_other = (self.rect_member / self.rect_member.sum(1, keepdims=True)).mean(0)
            member["other"] = lik_other > 0
        self.member = np.stack([member[n] for n in NAMES])   # (K, L) support of each rule
        self.n_rule = self.member.sum(1)                      # layouts per rule (support size)
        # lik[r, l] = P(layout l | rule r): uniform within each listed rule; for "other", the
        # mixture over hidden rectangles.
        self.lik = self.member / self.n_rule[:, None]
        if OPEN_WORLD:
            self.lik[-1] = lik_other
        # prior over layouts: rule uniform, then the rule's layout distribution
        self.w0 = self.lik.sum(0) / K
        self.p0 = self.w0 @ self.occ                          # prior P(cell covered), (36,)
        self.cell_norm = float(_h2(self.p0).sum())            # nats, public constant
        rows = self.occ.reshape(-1, N, N).sum(2)
        cols = self.occ.reshape(-1, N, N).sum(1)
        self.lines = np.concatenate([rows, cols], 1).T.astype(np.int64)   # (12, L)
        # scan channel: T[k, y] = P(report y | true count k)
        T = np.zeros((N + 1, N + 1))
        for kk in range(N + 1):
            for d, p in SCAN_NOISE.items():
                T[kk, min(max(kk + d, 0), N)] += p
        self.scan_T = T
        self.scan_H = -(np.where(T > 0, T * np.log(np.where(T > 0, T, 1)), 0)).sum(1)

    def layout_cells(self, li: int) -> list[dict]:
        out = []
        for s, pi in enumerate(self.ships[li]):
            horiz, cells = self.placements[s][pi]
            out.append({"ship": SHIP_NAMES[s], "length": SHIPS[s],
                        "orientation": "horizontal" if horiz else "vertical",
                        "cells": [list(c) for c in cells]})
        return out


@lru_cache(maxsize=1)
def geometry() -> Geometry:
    return Geometry()


# ---- actions ----------------------------------------------------------------------------

def parse_action(action: dict) -> tuple[int, int]:
    """Validate an action dict; return (action id, cost). Raises ValueError, consumes nothing.

    {"type": "fire", "row": r, "col": c} or {"type": "scan", "axis": "row"|"col", "index": i}."""
    if not isinstance(action, dict):
        raise ValueError("action must be a dict")
    kind = action.get("type")

    def idx(key):
        v = action.get(key)
        if isinstance(v, bool) or not isinstance(v, (int, float, np.integer, np.floating)):
            raise ValueError(f"{key} must be an integer 0-{N - 1}")
        if not math.isfinite(float(v)) or float(v) != int(v) or not 0 <= int(v) < N:
            raise ValueError(f"{key} must be an integer 0-{N - 1}")
        return int(v)

    if kind == "fire":
        return idx("row") * N + idx("col"), COST["fire"]
    if kind == "scan":
        axis = action.get("axis")
        if axis not in ("row", "col"):
            raise ValueError('axis must be "row" or "col"')
        return N * N + (0 if axis == "row" else N) + idx("index"), COST["scan"]
    raise ValueError('type must be "fire" or "scan"')


def action_dict(a: int) -> dict:
    if a < N * N:
        return {"type": "fire", "row": a // N, "col": a % N}
    li = a - N * N
    return {"type": "scan", "axis": "row" if li < N else "col", "index": li % N}


def action_cost(a: int) -> int:
    return COST["fire"] if a < N * N else COST["scan"]


# ---- beliefs ----------------------------------------------------------------------------

class Belief:
    """Posterior over (rule, layout) from observations, by enumeration.

    fire_noise / scan_T / hierarchical can be changed to build the mistaken "coder" beliefs
    used as baselines; the defaults are the true model (the exact posterior). The fire error
    rate is a latent too: ll[z, l] is the log likelihood under fire level z (one level, 0.1, in
    the standard game; FIRE_LEVELS with a uniform prior when the noise is unknown)."""

    def __init__(self, fire_noise: float | None = None, scan_T: np.ndarray | None = None,
                 hierarchical: bool = True) -> None:
        g = geometry()
        self.g = g
        levels = FIRE_LEVELS if fire_noise is None else (fire_noise,)
        self.fire_levels = np.array(levels, float)
        self.level_prior = np.full(len(levels), 1.0 / len(levels))
        self.scan_T = g.scan_T if scan_T is None else scan_T
        self.hierarchical = hierarchical
        self.ll = np.zeros((len(levels), g.L))
        self.obs: list[tuple[int, int]] = []

    def update(self, a: int, y: int) -> None:
        g = self.g
        if a < N * N:
            e = self.fire_levels
            self.ll += np.where((g.occ[:, a] == bool(y))[None, :],
                                np.log1p(-e)[:, None], np.log(e)[:, None])
        else:
            with np.errstate(divide="ignore"):
                self.ll += np.log(self.scan_T[g.lines[a - N * N], y])[None, :]
        self.obs.append((a, int(y)))

    def _E(self) -> np.ndarray:
        m = self.ll.max()
        if not np.isfinite(m):
            raise ValueError("observations have zero probability under this belief")
        return self.level_prior[:, None] * np.exp(self.ll - m)   # (Z, L), joint up to a constant

    def _A(self) -> np.ndarray:
        return self._E().sum(0)                                    # likelihood with z summed out

    def noise(self) -> np.ndarray:
        """Posterior over the fire error levels (Z,)."""
        E = self._E() * (self.g.w0 if self.hierarchical else 1.0)
        s = E.sum(1)
        return s / s.sum()

    def layout_weights(self) -> np.ndarray:
        A = self._A() * (self.g.w0 if self.hierarchical else 1.0)
        return A / A.sum()

    def rules(self) -> np.ndarray:
        A = self._A()
        s = self.g.lik @ A if self.hierarchical else self.g.member @ A
        return s / s.sum()

    def occupancy(self) -> np.ndarray:
        return np.clip(self.layout_weights() @ self.g.occ, 0.0, 1.0)

    def eig(self) -> np.ndarray:
        """Expected information gain (nats) about the hidden state of every action (48,)."""
        g = self.g
        w = self.layout_weights()
        Ez = self._E() * (g.w0 if self.hierarchical else 1.0)
        Ez = Ez / Ez.sum()                                          # (Z, L) joint posterior
        pz = Ez.sum(1)                                              # P(level z)
        hit = Ez @ g.occ                                            # (Z, 36) P(z, cell covered)
        e = self.fire_levels[:, None]
        py = ((1 - e) * hit + e * (pz[:, None] - hit)).sum(0)       # P(report hit)
        fire = _h2(py) - float(pz @ _h2(self.fire_levels))
        P = np.stack([np.bincount(g.lines[li], weights=w, minlength=N + 1)
                      for li in range(N_LINES)])               # (12, 7) P(true count)
        Py = P @ self.scan_T
        Hy = -(np.where(Py > 0, Py * np.log(np.where(Py > 0, Py, 1)), 0)).sum(1)
        scan = Hy - P @ g.scan_H
        return np.concatenate([fire, scan])


def greedy_action(belief: Belief, remaining: int, fires_only: bool = False) -> int:
    """The reference's design rule: the affordable action with the most information per shot."""
    eig = belief.eig()
    cost = np.array([action_cost(a) for a in range(N_ACTIONS)])
    ok = cost <= remaining
    if fires_only:
        ok[N * N:] = False
    val = np.where(ok, eig / cost, -np.inf)
    return int(np.argmax(val))


# ---- scoring ----------------------------------------------------------------------------

def parse_submission(rules, occupancy=None) -> tuple[np.ndarray, np.ndarray]:
    """rules: dict name -> prob (missing = 0) or a list of K numbers; normalised.
    occupancy: 6x6 nested list or flat list of 36 probabilities in [0, 1]; None = the prior."""
    g = geometry()
    if isinstance(rules, dict):
        unknown = set(map(str, rules)) - set(NAMES)
        if unknown:
            raise ValueError(f"unknown rules {sorted(unknown)}; valid: {list(NAMES)}")
        vals = [rules.get(n, 0.0) for n in NAMES]
    elif isinstance(rules, (list, tuple, np.ndarray)) and len(rules) == K:
        vals = list(rules)
    else:
        raise ValueError(f"rules must be a dict over {list(NAMES)} or a list of {K} numbers")
    try:
        q = np.array([float(v) for v in vals])
    except (TypeError, ValueError):
        raise ValueError("rule probabilities must be numbers") from None
    if not np.all(np.isfinite(q)) or np.any(q < 0) or q.sum() <= 0:
        raise ValueError("rule probabilities must be finite, >= 0 and not all zero")
    q = q / q.sum()
    if occupancy is None:
        occ = g.p0.copy()
    else:
        try:
            occ = np.array(occupancy, dtype=float).reshape(-1)
        except (TypeError, ValueError):
            raise ValueError("occupancy must be a 6x6 grid of numbers") from None
        if occ.size != N * N:
            raise ValueError("occupancy must have 36 entries (6 rows of 6)")
        if not np.all(np.isfinite(occ)) or np.any(occ < -1e-9) or np.any(occ > 1 + 1e-9):
            raise ValueError("occupancy probabilities must be in [0, 1]")
        occ = np.clip(occ, 0.0, 1.0)
    return q, occ


def _rule_part_vec(q: np.ndarray) -> np.ndarray:
    qm = (1 - EPS) * q + EPS * RULE_PRIOR
    return (np.log(qm) - np.log(RULE_PRIOR)) / RULE_NORM          # (K,)


def _cell_part_vec(occ: np.ndarray) -> np.ndarray:
    g = geometry()
    qm = (1 - EPS) * occ + EPS * g.p0
    d1 = np.log(qm) - np.log(g.p0)
    d0 = np.log1p(-qm) - np.log1p(-g.p0)
    return (g.occ @ (d1 - d0) + d0.sum()) / g.cell_norm            # (L,)


def score(q: np.ndarray, occ: np.ndarray, rule: int, layout: int) -> dict:
    r = float(_rule_part_vec(q)[rule])
    c = float(_cell_part_vec(occ)[layout])
    return {"rule_part": r, "cell_part": c, "score_raw": 0.5 * (r + c)}


def ppc_pvalue(q, occ, belief: Belief, rule: int, layout: int, u: float) -> float:
    """Exact posterior predictive leak test. T = score(submission) - score(exact posterior of
    the agent's OWN data), as a function of the hidden state. If the submission used only that
    data, the true state is a posterior draw, so P(T(state) >= T(true state)) is uniform
    (randomised over ties with u ~ U(0,1)). Small p = better than the evidence allows."""
    g = geometry()
    pr, po = belief.rules(), belief.occupancy()
    dr = _rule_part_vec(q) - _rule_part_vec(pr)                    # (K,)
    dl = _cell_part_vec(occ) - _cell_part_vec(po)                  # (L,)
    T = 0.5 * (dr[:, None] + dl[None, :])                          # (K, L)
    A = belief._A()
    w = g.lik * A[None, :]
    w = w / w.sum()
    t0 = T[rule, layout]
    tol = 1e-9 * (1 + abs(t0))
    above = float(w[T > t0 + tol].sum())
    tie = float(w[np.abs(T - t0) <= tol].sum())
    return min(1.0, above + u * tie)


# ---- the lab ----------------------------------------------------------------------------

def rules() -> dict:
    g = geometry()
    return {
        "description": (
            "A 6x6 board (rows and columns numbered 0-5) hides three ships: lengths 4, 3 and 2, "
            "each horizontal or vertical, never overlapping. They were placed by ONE of the "
            "placement rules listed below. Spend your shot budget on fire and scan actions, "
            "then submit (a) a probability for each rule and (b) for every cell, the "
            "probability that a ship covers it."),
        "generative_model": (
            f"1) A rule is drawn uniformly at random from the list (each 1/{K}). "
            "2) The layout is drawn uniformly at random from ALL layouts that satisfy that rule "
            "(a layout = the three ship placements). Note that a layout can satisfy several "
            "rules, and 'any' is satisfied by every layout. "
            + ("3) The fire error rate e is drawn once per game: 0.05, 0.15 or 0.3, each 1/3, "
               "independently of the rule and the layout. 4) Given e, each action's noise is "
               "independent of everything else." if UNKNOWN_NOISE else
               "3) Each action's noise is independent of everything else.")),
        "rules": [{"name": n, "definition": d, "prior": 1.0 / K,
                   "number_of_layouts": int(g.n_rule[i])} for i, (n, d) in enumerate(RULES)],
        "total_layouts": int(g.L),
        "ships": [{"name": s, "length": length} for s, length in zip(SHIP_NAMES, SHIPS)],
        "actions": {
            "fire": {"cost": COST["fire"], "returns": "hit (1) or miss (0)",
                     "noise": f"the reported result is {FIRE_NOISE_PHRASE}"},
            "scan": {"cost": COST["scan"],
                     "returns": "number of ship cells in one whole row or column",
                     "noise": "reported = true count + d, d = -1 / 0 / +1 with probabilities "
                              f"{SCAN_NOISE[-1]} / {SCAN_NOISE[0]} / {SCAN_NOISE[1]}, then "
                              "clipped to [0, 6]"},
            "notes": "Firing or scanning never changes the board. Repeating an action is "
                     "allowed; its noise is drawn afresh."},
        "budget": BUDGET,
        "prior_occupancy": g.p0.reshape(N, N).round(6).tolist(),
        "scoring": (
            f"q = your submission mixed with {EPS} of the prior. rule_part = [log q(true rule) "
            f"- log(1/{K})] / log {K}. cell_part = sum over cells of [log q_cell(truth) - "
            f"log prior_cell(truth)] / {g.cell_norm:.4f} (the prior's total entropy in nats). "
            "score = (rule_part + cell_part) / 2. Submitting the prior scores 0; knowing the "
            "truth scores about 1; confident mistakes score below 0 (shown as 0). The rule is "
            "proper: reporting your honest posterior maximises your expected score."),
    }


class BattleshipLab:
    """One episode: reset -> step* -> submit. JSON-able observations.

    For demos/analysis (never served to the agent): .history, .snapshots (exact posterior
    after each action), .hidden_rule, .hidden_layout, reference_trajectory(seed, salt)."""

    TAG_HID, TAG_NOISE = 0xB5A1, 0xB5A2

    def __init__(self, budget: int = BUDGET) -> None:
        self.budget = budget

    def reset(self, seed: int, salt: str | None = None) -> dict:
        g = geometry()
        self.seed, self.salt = int(seed), salt
        rng = np.random.default_rng(salted_key(seed, salt, self.TAG_HID))
        self.hidden_rule = int(rng.integers(K))
        self.hidden_region = None
        if OPEN_WORLD and NAMES[self.hidden_rule] == "other":
            self.hidden_region = g.rects[int(rng.integers(len(g.rects)))]
            choices = np.flatnonzero(g.rect_member[g.rects.index(self.hidden_region)])
        else:
            choices = np.flatnonzero(g.member[self.hidden_rule])
        self.hidden_layout = int(choices[rng.integers(len(choices))])
        self.hidden_level = int(rng.integers(len(FIRE_LEVELS))) if UNKNOWN_NOISE else 0
        self.fire_noise = FIRE_LEVELS[self.hidden_level]
        self.belief = Belief()
        self.spent = 0
        self.history: list[dict] = []
        self.snapshots = [self._snapshot()]
        self.result: dict | None = None
        return {"rules": rules(), "budget_remaining": self.remaining}

    @property
    def remaining(self) -> int:
        return self.budget - self.spent

    def _snapshot(self) -> dict:
        return {"rules": self.belief.rules().round(6).tolist(),
                "occupancy": self.belief.occupancy().round(6).tolist()}

    def _outcome(self, a: int, i: int) -> int:
        g = geometry()
        u = np.random.default_rng(salted_key(self.seed, self.salt, self.TAG_NOISE) + [i]).random()
        if a < N * N:
            return int(g.occ[self.hidden_layout, a]) ^ int(u < self.fire_noise)
        k = int(g.lines[a - N * N, self.hidden_layout])
        d = -1 if u < SCAN_NOISE[-1] else (0 if u < SCAN_NOISE[-1] + SCAN_NOISE[0] else 1)
        return min(max(k + d, 0), N)

    def step_id(self, a: int) -> dict:
        if self.result is not None:
            raise RuntimeError("already submitted")
        cost = action_cost(a)
        if cost > self.remaining:
            raise RuntimeError(f"not enough budget: this action costs {cost}, "
                               f"{self.remaining} left")
        y = self._outcome(a, len(self.history))
        self.spent += cost
        self.belief.update(a, y)
        rec = {**action_dict(a), "result": y, "cost": cost, "budget_remaining": self.remaining}
        self.history.append(rec)
        self.snapshots.append(self._snapshot())
        return rec

    def step(self, action: dict) -> dict:
        a, _ = parse_action(action)
        return self.step_id(a)

    def submit(self, rules_belief, occupancy=None, reference: bool = True,
               u: float | None = None) -> dict:
        if self.result is not None:
            raise RuntimeError("already submitted")
        q, occ = parse_submission(rules_belief, occupancy)
        g = geometry()
        s = score(q, occ, self.hidden_rule, self.hidden_layout)
        pr, po = self.belief.rules(), self.belief.occupancy()
        d = score(pr, po, self.hidden_rule, self.hidden_layout)
        if u is None:
            u = float(np.random.default_rng(
                salted_key(self.seed, self.salt, 0xB5A3)).random())
        res = {
            **s,
            "score": min(1.0, max(0.0, s["score_raw"])),
            "design": d["score_raw"],
            "inference": s["score_raw"] - d["score_raw"],
            "accuracy": float(int(np.argmax(q)) == self.hidden_rule),
            "ppc_p": ppc_pvalue(q, occ, self.belief, self.hidden_rule, self.hidden_layout, u),
            "n_actions": len(self.history),
            "n_fires": sum(h["type"] == "fire" for h in self.history),
            "n_scans": sum(h["type"] == "scan" for h in self.history),
            "budget_used": self.spent / self.budget,
            "hidden_rule": NAMES[self.hidden_rule],
            "hidden_fire_noise": self.fire_noise,
            "exact_fire_noise": dict(zip(map(str, FIRE_LEVELS),
                                         self.belief.noise().round(6).tolist())),
            "hidden_region": (None if self.hidden_region is None else
                              dict(zip(("row_from", "row_to", "col_from", "col_to"),
                                       self.hidden_region))),
            "hidden_ships": g.layout_cells(self.hidden_layout),
            "hidden_occupancy": g.occ[self.hidden_layout].reshape(N, N).astype(int).tolist(),
            "submitted_rules": dict(zip(NAMES, q.round(6).tolist())),
            "submitted_occupancy": occ.reshape(N, N).round(6).tolist(),
            "exact_rules": dict(zip(NAMES, pr.round(6).tolist())),
            "exact_occupancy": po.reshape(N, N).round(6).tolist(),
        }
        if reference:
            ref = run_policy("reference", "exact", self.seed, self.salt, reference=False)
            res["reference_score_raw"] = ref.result["score_raw"]
            res["gap_to_reference"] = s["score_raw"] - ref.result["score_raw"]
        self.result = res
        return res


# ---- policies (reference, baselines, attacks) -------------------------------------------

DESIGNS = ("reference", "fires_only", "random", "hunter", "none", "one")
INFERENCES = ("exact", "nominal_noise", "closed_world", "noiseless", "no_occam", "overconfident", "hedge", "map", "gamble",
              "prior", "cheat_full", "cheat_blend", "cheat_extra")


def _hunter_action(lab: BattleshipLab, rng: np.random.Generator) -> int:
    """Classic human play, ignoring rules and noise: after a hit, fire at its unfired
    neighbours; otherwise fire a random unfired cell of one checkerboard colour."""
    fired = {h["row"] * N + h["col"] for h in lab.history if h["type"] == "fire"}
    hits = [h["row"] * N + h["col"] for h in lab.history if h["type"] == "fire" and h["result"]]
    for c in reversed(hits):
        r0, c0 = divmod(c, N)
        for dr, dc in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            r1, c1 = r0 + dr, c0 + dc
            if 0 <= r1 < N and 0 <= c1 < N and r1 * N + c1 not in fired:
                return r1 * N + c1
    cand = [c for c in range(N * N) if (c // N + c % N) % 2 == 0 and c not in fired]
    cand = cand or [c for c in range(N * N) if c not in fired] or list(range(N * N))
    return int(rng.choice(cand))


def _sharpen(p: np.ndarray, power: float) -> np.ndarray:
    p = np.clip(p, 1e-12, None) ** power
    return p / p.sum()


def _sharpen_cells(o: np.ndarray, power: float) -> np.ndarray:
    a, b = np.clip(o, 1e-12, 1) ** power, np.clip(1 - o, 1e-12, 1) ** power
    return a / (a + b)


def submission(lab: BattleshipLab, inference: str, rng: np.random.Generator):
    """The (rules, occupancy) a given inference style submits for the lab's data."""
    g = geometry()
    b = lab.belief
    if inference == "exact":
        return b.rules(), b.occupancy()
    if inference == "noiseless":       # treats every report as exact (a typical coder bug)
        tiny = 1e-6
        T = np.full_like(g.scan_T, tiny)
        np.fill_diagonal(T, 1.0)
        nb = Belief(fire_noise=tiny, scan_T=T / T.sum(1, keepdims=True))
        for a, y in b.obs:
            nb.update(a, y)
        return nb.rules(), nb.occupancy()
    if inference == "no_occam":        # right noise, but every LAYOUT equally likely a priori
        nb = Belief(hierarchical=False)
        for a, y in b.obs:
            nb.update(a, y)
        return nb.rules(), nb.occupancy()
    if inference == "nominal_noise":   # exact, but treats the fire error as known (the middle level)
        nb = Belief(fire_noise=FIRE_LEVELS[len(FIRE_LEVELS) // 2])
        for a, y in b.obs:
            nb.update(a, y)
        return nb.rules(), nb.occupancy()
    if inference == "closed_world":    # exact Bayes that never considers "other"
        if not OPEN_WORLD:
            return b.rules(), b.occupancy()
        A = b._A()
        s = g.lik[:-1] @ A
        w = A * g.lik[:-1].sum(0)
        return np.append(s / s.sum(), 0.0), np.clip((w / w.sum()) @ g.occ, 0.0, 1.0)
    if inference == "overconfident":
        return _sharpen(b.rules(), 3.0), _sharpen_cells(b.occupancy(), 3.0)
    if inference == "hedge":
        return _sharpen(b.rules(), 0.5), _sharpen_cells(b.occupancy(), 0.5)
    if inference == "map":             # act certain: one-hot MAP rule and MAP layout
        w = b.layout_weights()
        q = np.zeros(K)
        q[int(np.argmax(b.rules()))] = 1
        return q, g.occ[int(np.argmax(w))].astype(float)
    if inference == "gamble":          # everything on one random rule, prior cells
        q = np.zeros(K)
        q[int(rng.integers(K))] = 1
        return q, g.p0.copy()
    if inference == "prior":
        return RULE_PRIOR.copy(), g.p0.copy()
    truth_q = np.eye(K)[lab.hidden_rule]
    truth_o = g.occ[lab.hidden_layout].astype(float)
    if inference == "cheat_full":
        return truth_q, truth_o
    if inference == "cheat_blend":     # 10% of the truth mixed into the honest posterior
        return 0.9 * b.rules() + 0.1 * truth_q, np.clip(0.9 * b.occupancy() + 0.1 * truth_o, 0, 1)
    if inference == "cheat_extra":     # 5 hidden extra fires the grader never saw
        nb = Belief()
        for a, y in b.obs:
            nb.update(a, y)
        for i in range(5):
            c = int(rng.integers(N * N))
            y = int(g.occ[lab.hidden_layout, c]) ^ int(rng.random() < lab.fire_noise)
            nb.update(c, y)
        return nb.rules(), nb.occupancy()
    raise ValueError(f"unknown inference {inference}")


def play(design: str, seed: int, salt: str | None = None, budget: int = BUDGET) -> BattleshipLab:
    """Run the experiment phase of one episode with a design style; the lab is not submitted."""
    lab = BattleshipLab(budget)
    lab.reset(seed, salt)
    rng = np.random.default_rng(salted_key(seed, salt, 0xB5A4) + [DESIGNS.index(design)])
    if design == "one":
        lab.step_id(greedy_action(lab.belief, lab.remaining))
    while design not in ("none", "one") and lab.remaining > 0:
        if design == "reference":
            a = greedy_action(lab.belief, lab.remaining)
        elif design == "fires_only":
            a = greedy_action(lab.belief, lab.remaining, fires_only=True)
        elif design == "random":
            ok = [a for a in range(N_ACTIONS) if action_cost(a) <= lab.remaining]
            a = int(rng.choice(ok))
        elif design == "hunter":
            a = _hunter_action(lab, rng)
        else:
            raise ValueError(f"unknown design {design}")
        lab.step_id(a)
    return lab


def run_policy(design: str, inference: str, seed: int, salt: str | None = None,
               budget: int = BUDGET, reference: bool = False) -> BattleshipLab:
    """Play one episode in-process with a design style and an inference style."""
    lab = play(design, seed, salt, budget)
    irng = np.random.default_rng(salted_key(seed, salt, 0xB5A5))
    q, occ = submission(lab, inference, irng)
    lab.submit(q, occ, reference=reference)
    return lab


def reference_trajectory(seed: int, salt: str | None = None) -> dict:
    lab = run_policy("reference", "exact", seed, salt)
    return {"history": lab.history, "snapshots": lab.snapshots, "result": lab.result}
