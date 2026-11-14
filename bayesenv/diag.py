"""Finite diagnostic lab: a table of causes, nuisance states and tests; everything exact.

A table (specs/tables/<name>.yaml, format in docs/DIAG.md) defines
  * causes c with prior p0(c)                      -- what the agent must report on
  * nuisance factors with P(n | c)                 -- hidden, not asked for, but tests depend on them
  * tests t with a cost and P(outcome | c, n)      -- discrete, noisy
  * a budget in cost units

The agent runs tests one at a time (each test at most once, total cost <= budget) and then
submits a probability for each cause. Reward = log q(c*) - log p0(c*) with the same epsilon
mixing as bayesenv.chem_reward, so the prior scores exactly 0.

The hidden state is the pair (c, n): C * N values, so the posterior is an exact enumeration.
The belief depends only on the SET of (test, outcome) pairs seen, not their order, which is
what makes exact dynamic programming cheap: the state space is "which tests, which outcomes".

Nothing in this module is specific to one table.

Policies have the signature  policy(table, w, obs, remaining) -> test index or None (stop)
  w          unnormalised joint weights over (cause, nuisance), shape (C, N)
  obs        tuple of (test index, outcome index) in the order taken
  remaining  budget left
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np

from .chem_lab import salted_key
from .chem_reward import EPS

TABLE_DIR = Path(__file__).resolve().parent.parent / "specs" / "tables"
TOL = 1e-12          # gains below this count as zero
COST_TOL = 1e-9


# ---- the table ---------------------------------------------------------------------------

@dataclass
class Table:
    name: str
    causes: list[str]
    prior: np.ndarray                 # (C,)
    nuisances: list[str]              # flat nuisance state names, length N
    p_nuis: np.ndarray                # (C, N): P(n | c)
    tests: list[str]
    costs: np.ndarray                 # (T,)
    outcomes: list[list[str]]
    lik: list[np.ndarray]             # per test (C, N, O): P(outcome | c, n)
    budget: float
    roles: list[str] = field(default_factory=list)
    description: str = ""

    def __post_init__(self):
        self.prior = np.asarray(self.prior, float)
        self.p_nuis = np.asarray(self.p_nuis, float)
        self.costs = np.asarray(self.costs, float)
        self.lik = [np.asarray(a, float) for a in self.lik]
        if not self.roles:
            self.roles = [""] * len(self.tests)
        C, N = len(self.causes), len(self.nuisances)
        if self.prior.shape != (C,) or abs(self.prior.sum() - 1) > 1e-9 or np.any(self.prior <= 0):
            raise ValueError("cause priors must be positive and sum to 1")
        if self.p_nuis.shape != (C, N) or np.abs(self.p_nuis.sum(1) - 1).max() > 1e-9:
            raise ValueError("P(nuisance | cause) rows must sum to 1")
        for name, a, outs in zip(self.tests, self.lik, self.outcomes):
            if a.shape != (C, N, len(outs)) or np.any(a < 0) or np.abs(a.sum(2) - 1).max() > 1e-9:
                raise ValueError(f"test {name}: outcome probabilities must be >= 0 and sum to 1")
        if np.any(self.costs <= 0):
            raise ValueError("test costs must be positive")
        self.log_prior = np.log(self.prior)
        self.joint = self.prior[:, None] * self.p_nuis        # (C, N)

    @property
    def C(self) -> int:
        return len(self.causes)

    @property
    def T(self) -> int:
        return len(self.tests)

    def index(self, test) -> int:
        if isinstance(test, str):
            if test not in self.tests:
                raise ValueError(f"unknown test {test!r}; valid: {self.tests}")
            return self.tests.index(test)
        if isinstance(test, bool) or not isinstance(test, (int, np.integer)) \
                or not 0 <= int(test) < self.T:
            raise ValueError(f"test must be a name or an index in [0, {self.T})")
        return int(test)

    def without(self, names) -> "Table":
        """The same problem with some tests removed from the menu."""
        drop = {self.index(n) for n in ([names] if isinstance(names, str) else names)}
        keep = [t for t in range(self.T) if t not in drop]
        return replace(self, tests=[self.tests[t] for t in keep], costs=self.costs[keep],
                       outcomes=[self.outcomes[t] for t in keep],
                       lik=[self.lik[t] for t in keep], roles=[self.roles[t] for t in keep])

    def with_budget(self, budget: float) -> "Table":
        return replace(self, budget=float(budget))

    def by_role(self, role: str) -> list[str]:
        return [n for n, r in zip(self.tests, self.roles) if r == role]


def _as_list(v):
    return list(v) if isinstance(v, (list, tuple)) else [v]


def _prob(v, k: int, what: str) -> np.ndarray:
    p = np.array([float(x) for x in v])
    if p.shape != (k,) or np.any(p < 0) or abs(p.sum() - 1) > 1e-6:
        raise ValueError(f"{what}: need {k} probabilities summing to 1, got {list(v)}")
    return p / p.sum()


def table_from_spec(spec: dict) -> Table:
    """Build a Table from the YAML structure (see docs/DIAG.md)."""
    causes = list(spec["causes"])
    C = len(causes)
    prior = np.array([float(spec["causes"][c]["prior"] if isinstance(spec["causes"][c], dict)
                            else spec["causes"][c]) for c in causes])
    prior = _prob(prior, C, "cause priors")

    factors = list((spec.get("nuisances") or {}).items())
    fstates = [list(f["states"]) for _, f in factors]
    fnames = [n for n, _ in factors]
    shape = [len(s) for s in fstates]
    N = int(np.prod(shape)) if shape else 1
    combos = list(np.ndindex(*shape)) if shape else [()]
    nuis_names = ["/".join(fstates[i][j] for i, j in enumerate(cb)) or "none" for cb in combos]
    p_nuis = np.ones((C, N))
    for fi, (fname, f) in enumerate(factors):
        k = len(fstates[fi])
        base = _prob(f["prob"], k, f"nuisance {fname}")
        if "given_cause" in f and "given_nuisance" in f:
            raise ValueError(f"nuisance {fname}: use given_cause or given_nuisance, not both")
        for ci, c in enumerate(causes):
            for ni, cb in enumerate(combos):
                p = base
                if c in (f.get("given_cause") or {}):
                    p = _prob(f["given_cause"][c], k, f"nuisance {fname} given {c}")
                for parent, tab in (f.get("given_nuisance") or {}).items():
                    if parent not in fnames[:fi]:
                        raise ValueError(f"nuisance {fname}: parent {parent} must be defined earlier")
                    pstate = fstates[fnames.index(parent)][cb[fnames.index(parent)]]
                    if pstate in tab:
                        p = _prob(tab[pstate], k, f"nuisance {fname} given {parent}={pstate}")
                p_nuis[ci, ni] *= p[cb[fi]]
    for f in factors:
        unknown = set(f[1].get("given_cause") or {}) - set(causes)
        if unknown:
            raise ValueError(f"nuisance {f[0]}: unknown causes {sorted(unknown)}")

    tests, costs, outcomes, lik, roles = [], [], [], [], []
    for tname, t in spec["tests"].items():
        outs = list(t["outcomes"])
        a = np.empty((C, N, len(outs)))
        a[:] = _prob(t["default"], len(outs), f"test {tname} default")
        for row in t.get("rows") or []:
            cmask = np.ones(C, bool)
            nmask = np.ones(N, bool)
            for key, val in row["when"].items():
                vals = _as_list(val)
                if key == "cause":
                    if set(vals) - set(causes):
                        raise ValueError(f"test {tname}: unknown causes {set(vals) - set(causes)}")
                    cmask &= np.array([c in vals for c in causes])
                elif key in fnames:
                    fi = fnames.index(key)
                    if set(vals) - set(fstates[fi]):
                        raise ValueError(f"test {tname}: unknown {key} states {vals}")
                    nmask &= np.array([fstates[fi][cb[fi]] in vals for cb in combos])
                else:
                    raise ValueError(f"test {tname}: 'when' key {key!r} is not 'cause' or a nuisance")
            a[np.ix_(cmask, nmask)] = _prob(row["p"], len(outs), f"test {tname} row {row['when']}")
        tests.append(tname)
        costs.append(float(t["cost"]))
        outcomes.append(outs)
        lik.append(a)
        roles.append(str(t.get("role", "")))
    return Table(name=str(spec.get("name", "table")), causes=causes, prior=prior,
                 nuisances=nuis_names, p_nuis=p_nuis, tests=tests, costs=np.array(costs),
                 outcomes=outcomes, lik=lik, budget=float(spec["budget"]), roles=roles,
                 description=str(spec.get("description", "")))


def load_spec(name_or_path) -> dict:
    import yaml
    p = Path(name_or_path)
    if not p.exists():
        p = TABLE_DIR / f"{name_or_path}.yaml"
    return yaml.safe_load(p.read_text(encoding="utf-8"))


def load_table(name_or_path) -> Table:
    return table_from_spec(load_spec(name_or_path))


# ---- exact inference ---------------------------------------------------------------------

def joint_weights(table: Table, obs) -> np.ndarray:
    """Unnormalised P(c, n, observations), shape (C, N). Its sum is P(observations)."""
    w = table.joint.copy()
    for t, o in obs:
        w = w * table.lik[t][:, :, o]
    return w


def posterior(table: Table, obs) -> np.ndarray:
    """Exact posterior over (cause, nuisance), shape (C, N)."""
    w = joint_weights(table, obs)
    return w / w.sum()


def cause_marginal(w: np.ndarray) -> np.ndarray:
    m = w.sum(-1)
    return m / m.sum()


def _entropy(p: np.ndarray) -> float:
    p = p[p > 0]
    return float(-(p * np.log(p)).sum())


def expected_entropy(table: Table, w: np.ndarray, t: int) -> float:
    """E over the outcome of test t of the entropy of the cause posterior, belief w."""
    pco = np.einsum("cn,cno->co", w, table.lik[t])
    pco = pco / pco.sum()
    po = pco.sum(0)
    h = 0.0
    for o in range(pco.shape[1]):
        if po[o] > 0:
            h += po[o] * _entropy(pco[:, o] / po[o])
    return h


def info_gain(table: Table, w: np.ndarray, t: int) -> float:
    """One-step expected information gain (nats) of test t about the CAUSE, belief w."""
    return _entropy(cause_marginal(w)) - expected_entropy(table, w, t)


def mix(table: Table, q: np.ndarray) -> np.ndarray:
    return (1 - EPS) * q + EPS * table.prior


def _terminal(table: Table, w: np.ndarray):
    """For unnormalised weights w (..., C, N): (P * expected reward of reporting the exact
    posterior, P * probability the argmax is right, P), where P = w.sum() per state."""
    wc = w.sum(-1)
    tot = wc.sum(-1)
    p = wc / np.where(tot > 0, tot, 1.0)[..., None]
    q = (1 - EPS) * p + EPS * table.prior
    r = (wc * (np.log(q) - table.log_prior)).sum(-1)
    acc = np.take_along_axis(wc, np.argmax(q, -1)[..., None], -1)[..., 0]
    return r, acc, tot


def expected_reward(table: Table, w: np.ndarray) -> float:
    """Expected reward of stopping now and reporting the exact posterior, belief w."""
    r, _, tot = _terminal(table, w)
    return float(r / tot)


def parse_belief(table: Table, belief) -> np.ndarray:
    """dict cause -> prob (missing = 0) or a list aligned with table.causes; normalised."""
    if isinstance(belief, dict):
        unknown = set(belief) - set(table.causes)
        if unknown:
            raise ValueError(f"unknown causes {sorted(unknown)}; valid: {table.causes}")
        vals = [belief.get(c, 0.0) for c in table.causes]
    elif isinstance(belief, (list, tuple, np.ndarray)) and len(belief) == table.C:
        vals = list(belief)
    else:
        raise ValueError(f"belief must be a dict over causes or a list of {table.C} numbers")
    try:
        q = np.array([float(v) for v in vals])
    except (TypeError, ValueError):
        raise ValueError("probabilities must be numbers") from None
    if not np.all(np.isfinite(q)) or np.any(q < 0) or q.sum() <= 0:
        raise ValueError("probabilities must be finite, >= 0, and not all zero")
    return q / q.sum()


def score(table: Table, q: np.ndarray, c: int, p_exact: np.ndarray) -> dict:
    """reward = log q(c*) - log p0(c*) on the cause marginal, plus the usual decomposition."""
    qm = mix(table, q)
    lp0 = float(table.log_prior[c])
    lq = math.log(qm[c])
    lpd = math.log(max(float(p_exact[c]), 1e-300))
    return {"reward": lq - lp0, "design": lpd - lp0, "inference": lq - lpd,
            "accuracy": float(int(np.argmax(qm)) == c),
            "submitted": {n: float(v) for n, v in zip(table.causes, q)},
            "exact_posterior": {n: float(v) for n, v in zip(table.causes, p_exact)}}


# ---- policies ----------------------------------------------------------------------------

def affordable(table: Table, obs, remaining: float) -> list[int]:
    used = {t for t, _ in obs}
    return [t for t in range(table.T) if t not in used and table.costs[t] <= remaining + COST_TOL]


def greedy_policy(table, w, obs, remaining, per_cost: bool = False):
    """The affordable test with the highest one-step information gain about the cause (or
    gain per unit cost). Ties: lowest index. Stops when nothing is affordable or every
    affordable test has zero gain."""
    best, best_v = None, TOL
    for t in affordable(table, obs, remaining):
        g = info_gain(table, w, t)
        v = g / table.costs[t] if per_cost else g
        if g > TOL and v > best_v + 1e-15:
            best, best_v = t, v
    return best


def greedy_per_cost_policy(table, w, obs, remaining):
    return greedy_policy(table, w, obs, remaining, per_cost=True)


def lookahead2_policy(table, w, obs, remaining):
    """Two-step lookahead: the first test of the best (test, then best adaptive second test)
    pair by expected information about the cause. Re-planned at every step."""
    h0 = _entropy(cause_marginal(w))
    tot = w.sum()
    best, best_gain = None, TOL
    for t in affordable(table, obs, remaining):
        h = 0.0
        for o in range(table.lik[t].shape[2]):
            wo = w * table.lik[t][:, :, o]
            po = wo.sum() / tot
            if po <= 0:
                continue
            ho = _entropy(cause_marginal(wo))
            for t2 in affordable(table, obs + ((t, o),), remaining - table.costs[t]):
                ho = min(ho, expected_entropy(table, wo, t2))
            h += po * ho
        if h0 - h > best_gain + 1e-15:
            best, best_gain = t, h0 - h
    return best


def make_random_policy(rng: np.random.Generator):
    def policy(table, w, obs, remaining):
        aff = affordable(table, obs, remaining)
        return int(rng.choice(aff)) if aff else None
    return policy


# ---- exact dynamic programming over (set of tests, outcomes) ------------------------------

def _affordable_subsets(table: Table, budget: float) -> list[tuple[int, ...]]:
    out = []

    def rec(start, s, cost):
        out.append(s)
        for t in range(start, table.T):
            if cost + table.costs[t] <= budget + COST_TOL:
                rec(t + 1, s + (t,), cost + table.costs[t])
    rec(0, (), 0.0)
    return out


def _sweep(table: Table, budget: float, leaf_fn):
    """Visit every affordable subset S of tests (sorted tuple) with its weight tensor
    W_S[o_1, ..., o_k, c, n] = P(c, n, outcomes) and store leaf_fn(S, W_S)."""
    Lt = [np.moveaxis(a, 2, 0) for a in table.lik]          # (O, C, N)
    store = {}

    def rec(start, s, cost, w):
        store[s] = leaf_fn(s, w)
        for t in range(start, table.T):
            if cost + table.costs[t] <= budget + COST_TOL:
                rec(t + 1, s + (t,), cost + table.costs[t], w[..., None, :, :] * Lt[t])
    rec(0, (), 0.0, table.joint)
    return store


def _extensions(table: Table, s: tuple, budget: float):
    """(test, new sorted subset, axis of the test in it) for each affordable unused test."""
    spent = sum(table.costs[t] for t in s)
    out = []
    for t in range(table.T):
        if t not in s and spent + table.costs[t] <= budget + COST_TOL:
            i = sum(1 for u in s if u < t)
            out.append((t, s[:i] + (t,) + s[i:], i))
    return out


@dataclass
class DPResult:
    value: float                 # optimal expected reward
    action: dict                 # sorted subset -> int array over outcomes (-1 = stop)
    n_states: int                # reachable (subset, outcomes) states, incl. the empty one
    n_subsets: int
    seconds: float
    budget: float

    def policy(self, table, w, obs, remaining):
        so = sorted(obs)
        a = int(self.action[tuple(t for t, _ in so)][tuple(o for _, o in so)])
        return None if a < 0 else a


def exact_dp(table: Table, budget: float | None = None) -> DPResult:
    """Backward induction over every (set of tests, outcomes) state reachable within the
    budget. No pruning, no sampling: the value is the exact maximum over all adaptive
    policies (each test at most once, stopping allowed) of the expected reward of reporting
    the exact posterior. Values are kept unnormalised, U(S, o) = P(o) * V(belief), so the
    expectation over the next outcome is a plain sum over one axis."""
    budget = table.budget if budget is None else float(budget)
    t0 = time.perf_counter()
    n_states = 0

    def leaf(s, w):
        nonlocal n_states
        r, _, tot = _terminal(table, w)
        n_states += int((tot > 0).sum())
        return r
    stop = _sweep(table, budget, leaf)
    U, action = {}, {}
    for s in sorted(stop, key=len, reverse=True):
        best = stop[s].copy()
        act = np.full(best.shape, -1, dtype=np.int16)
        for t, s2, axis in _extensions(table, s, budget):
            cont = U[s2].sum(axis=axis)
            better = cont > best + TOL
            best = np.where(better, cont, best)
            act = np.where(better, t, act)
        U[s], action[s] = best, act
    return DPResult(value=float(U[()]), action=action, n_states=n_states, n_subsets=len(stop),
                    seconds=time.perf_counter() - t0, budget=budget)


def _metrics_dict(table: Table, m: np.ndarray, extra: dict | None = None) -> dict:
    T = table.T
    return {"reward": float(m[0]), "accuracy": float(m[1]),
            "usage": {n: float(v) for n, v in zip(table.tests, m[2:2 + T])},
            "mean_tests": float(m[2 + T]), "mean_cost": float(m[3 + T]), **(extra or {})}


def evaluate_policy(table: Table, policy, budget: float | None = None) -> dict:
    """Exact expectation for a deterministic policy by enumerating every outcome sequence it
    can produce. Returns reward, accuracy of the final argmax, P(each test is run), mean
    number of tests and mean cost."""
    budget = table.budget if budget is None else float(budget)
    T = table.T
    m = np.zeros(T + 4)
    leaves = 0

    def rec(w, obs, remaining):
        nonlocal leaves
        t = policy(table, w, obs, remaining)
        if t is None:
            r, acc, tot = _terminal(table, w)
            m[0] += r
            m[1] += acc
            for u, _ in obs:
                m[2 + u] += tot
            m[2 + T] += tot * len(obs)
            m[3 + T] += tot * (budget - remaining)
            leaves += 1
            return
        if t in {u for u, _ in obs} or table.costs[t] > remaining + COST_TOL:
            raise RuntimeError(f"policy chose an unavailable test {table.tests[t]}")
        for o in range(table.lik[t].shape[2]):
            w2 = w * table.lik[t][:, :, o]
            if w2.sum() > 0:
                rec(w2, obs + ((t, o),), remaining - table.costs[t])
    rec(table.joint.copy(), (), budget)
    return _metrics_dict(table, m, {"leaves": leaves})


def evaluate_random(table: Table, budget: float | None = None) -> dict:
    """Exact expectation for uniformly random testing (uniform over the affordable unused
    tests, until none is affordable), then the exact posterior. Same state space as the DP,
    with a mean over tests instead of a max."""
    budget = table.budget if budget is None else float(budget)
    T = table.T

    def leaf(s, w):
        r, acc, tot = _terminal(table, w)
        ind = np.zeros(T)
        ind[list(s)] = 1.0
        cost = sum(table.costs[t] for t in s)
        return np.concatenate([np.stack([r, acc], -1), tot[..., None] * ind,
                               tot[..., None] * np.array([len(s), cost])], -1)
    term = _sweep(table, budget, leaf)
    M = {}
    for s in sorted(term, key=len, reverse=True):
        ext = _extensions(table, s, budget)
        M[s] = sum(M[s2].sum(axis=axis) for _, s2, axis in ext) / len(ext) if ext else term[s]
    return _metrics_dict(table, M[()])


def exhaustive_value(table: Table, budget: float | None = None) -> float:
    """Optimal expected reward by plain recursion over ordered histories (no memoisation, no
    set trick). Exponential; only for cross-checking exact_dp on tiny tables."""
    budget = table.budget if budget is None else float(budget)

    def rec(w, used, remaining):
        best = _terminal(table, w)[0]
        for t in range(table.T):
            if t not in used and table.costs[t] <= remaining + COST_TOL:
                v = sum(rec(w * table.lik[t][:, :, o], used | {t}, remaining - table.costs[t])
                        for o in range(table.lik[t].shape[2]))
                best = max(best, v)
        return best
    return float(rec(table.joint.copy(), frozenset(), budget))


# ---- environment -------------------------------------------------------------------------

def rules(table: Table) -> dict:
    return {
        "description": table.description,
        "causes": [{"name": c, "prior": float(p)} for c, p in zip(table.causes, table.prior)],
        "nuisance_states": list(table.nuisances),
        "p_nuisance_given_cause": {c: table.p_nuis[i].tolist() for i, c in enumerate(table.causes)},
        "tests": [{"name": n, "cost": float(table.costs[t]), "outcomes": table.outcomes[t],
                   "p_outcome_given_cause_nuisance": table.lik[t].tolist()}
                  for t, n in enumerate(table.tests)],
        "budget": table.budget,
        "scoring": (f"reward = log q(true cause) - log prior(true cause), where q = "
                    f"{1 - EPS} * your submitted distribution + {EPS} * prior. Submitting the "
                    "prior scores 0. Each test can be run at most once."),
    }


class DiagLab:
    """One episode at a time: reset -> step* -> submit, same shape as ChemLab.

    Every test has one fixed reading per episode (it is a property of the retained sample,
    not fresh noise), drawn from a per-test uniform; so repeats are rejected, and two policies
    on the same (seed, salt) see the same reading for the same test (common random numbers).

    Exposed for demos/analysis (not for the agent):
      .history     list of {"index", "test", "outcome", "cost"}
      .posteriors  exact cause posterior after 0, 1, ..., n tests
      .joints      exact (cause, nuisance) posterior after each test
      .hidden / .hidden_nuisance
    """

    TAG_HID, TAG_OUT = 0xD1A6, 0xD1A7

    def __init__(self, table: Table | str, budget: float | None = None):
        self.table = load_table(table) if isinstance(table, str) else table
        self.budget = float(self.table.budget if budget is None else budget)
        self._c: int | None = None

    def reset(self, seed: int, salt: str | None = None) -> dict:
        tb = self.table
        self.seed, self.salt = int(seed), salt
        flat = int(np.random.default_rng(salted_key(seed, salt, self.TAG_HID)).choice(
            tb.joint.size, p=tb.joint.ravel() / tb.joint.sum()))
        self._c, self._n = divmod(flat, tb.joint.shape[1])
        self._u = np.random.default_rng(salted_key(seed, salt, self.TAG_OUT)).random(tb.T)
        self.obs: tuple = ()
        self.spent = 0.0
        self.history: list[dict] = []
        self.joints: list[np.ndarray] = [tb.joint / tb.joint.sum()]
        self.posteriors: list[np.ndarray] = [tb.prior.copy()]
        self.result: dict | None = None
        return {**rules(tb), "budget": self.budget, "budget_remaining": self.remaining,
                "posterior": self._post_dict()}

    @property
    def hidden(self) -> str:
        return self.table.causes[self._c]

    @property
    def hidden_nuisance(self) -> str:
        return self.table.nuisances[self._n]

    @property
    def remaining(self) -> float:
        return self.budget - self.spent

    def available(self) -> list[str]:
        return [self.table.tests[t] for t in affordable(self.table, self.obs, self.remaining)]

    def step(self, test) -> dict:
        tb = self.table
        if self._c is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("episode is over (already submitted)")
        t = tb.index(test)                       # ValueError on unknown tests
        if t in {u for u, _ in self.obs}:
            raise ValueError(f"test {tb.tests[t]} was already run; each test can be run once")
        if tb.costs[t] > self.remaining + COST_TOL:
            raise ValueError(f"test {tb.tests[t]} costs {tb.costs[t]:g}, only "
                             f"{self.remaining:g} of the budget is left")
        cdf = np.cumsum(tb.lik[t][self._c, self._n])
        o = min(int(np.searchsorted(cdf, self._u[t], side="right")), len(cdf) - 1)
        self.obs += ((t, o),)
        self.spent += float(tb.costs[t])
        rec = {"index": len(self.history), "test": tb.tests[t], "outcome": tb.outcomes[t][o],
               "cost": float(tb.costs[t])}
        self.history.append(rec)
        j = self.joints[-1] * tb.lik[t][:, :, o]
        j = j / j.sum()
        self.joints.append(j)
        self.posteriors.append(j.sum(1))
        return {"result": rec, "budget_remaining": self.remaining, "posterior": self._post_dict()}

    def _post_dict(self) -> dict:
        return dict(zip(self.table.causes, map(float, self.posteriors[-1])))

    def exact_posterior(self) -> np.ndarray:
        return self.posteriors[-1].copy()

    def submit(self, belief) -> dict:
        if self._c is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("already submitted")
        q = parse_belief(self.table, belief)
        out = score(self.table, q, self._c, self.posteriors[-1])
        out.update(n_tests=len(self.obs), cost=self.spent, hidden=self.hidden,
                   hidden_nuisance=self.hidden_nuisance)
        self.result = out
        return out


def run_policy(table: Table, policy, seed: int, salt: str | None = None,
               budget: float | None = None) -> DiagLab:
    """Play one episode in-process with a policy function, then submit the exact posterior.
    policy=None submits the prior without testing."""
    lab = DiagLab(table, budget)
    lab.reset(seed, salt)
    while policy is not None:
        t = policy(lab.table, lab.joints[-1], lab.obs, lab.remaining)
        if t is None:
            break
        lab.step(t)
    lab.submit(lab.exact_posterior())
    return lab


# ---- random tables (robustness check) ------------------------------------------------------

def _partition_test(rng, C: int, n_groups: int, acc: float) -> np.ndarray:
    """(C, O): each cause belongs to one of n_groups groups; the test reports the group with
    probability acc, otherwise one of the other groups uniformly."""
    g = np.concatenate([np.arange(n_groups), rng.integers(0, n_groups, C - n_groups)])
    rng.shuffle(g)
    a = np.full((C, n_groups), (1 - acc) / (n_groups - 1))
    a[np.arange(C), g] = acc
    return a


def random_table(rng: np.random.Generator, n_causes: int = 8,
                 instrument_effect: str = "shift") -> Table:
    """A random table with the same structural ingredients as the hand-designed one, and no
    tuning. Documented in docs/DIAG.md ("Random tables").

    Hidden: n_causes causes, prior ~ Dirichlet(2); nuisance A (binary, independent of the
    cause, P(A=1) ~ U(0.2, 0.5)); nuisance B (binary, P(B=1 | cause) ~ U(0.05, 0.3), and
    U(0.5, 0.85) for two random causes). Tests (11):
      1 control          reports A with accuracy U(0.9, 0.99); cost 1
      4 instrument tests random split of the causes into 2 or 3 groups, accuracy U(0.8, 0.95);
                         if A=1 the reported group label is shifted by one; cost in {1, 2, 3}
                         (instrument_effect="noise": if A=1 the reading is instead mixed
                         with uniform noise, weight U(0.5, 1), so A only degrades it)
      2 B-dependent      random split, accuracy U(0.75, 0.95); if B=1 the reading is mixed
                         with uniform noise, weight U(0.5, 1); cost in {1, 2, 3}
      1 B check          reports B with accuracy U(0.85, 0.97); cost 1
      3 specific tests   one-vs-rest for the three most probable causes, sensitivity
                         U(0.8, 0.95), false positives U(0.02, 0.1); cost in {2, 3, 4}
    Budget = 5 * mean test cost, rounded (about five tests)."""
    C = n_causes
    prior = rng.dirichlet(np.full(C, 2.0))
    pa = rng.uniform(0.2, 0.5)
    pb = rng.uniform(0.05, 0.3, C)
    pb[rng.choice(C, 2, replace=False)] = rng.uniform(0.5, 0.85, 2)
    # nuisance order: (A, B) = (0,0), (0,1), (1,0), (1,1)
    A = np.array([0, 0, 1, 1])
    B = np.array([0, 1, 0, 1])
    p_nuis = np.where(A, pa, 1 - pa)[None, :] * np.where(B[None, :], pb[:, None], 1 - pb[:, None])
    tests, costs, outcomes, lik, roles = [], [], [], [], []

    def add(name, cost, a, role):
        tests.append(name)
        costs.append(float(cost))
        outcomes.append([f"o{i}" for i in range(a.shape[2])])
        lik.append(a)
        roles.append(role)

    acc = rng.uniform(0.9, 0.99)
    a = np.empty((C, 4, 2))
    a[:, A == 0] = [acc, 1 - acc]
    a[:, A == 1] = [1 - acc, acc]
    add("control_A", 1, a, "control")
    for i in range(4):
        k = int(rng.integers(2, 4))
        base = _partition_test(rng, C, k, rng.uniform(0.8, 0.95))
        a = np.empty((C, 4, k))
        a[:, A == 0] = base[:, None, :]
        if instrument_effect == "shift":
            bad = np.roll(base, 1, axis=1)
        else:
            lam = rng.uniform(0.5, 1.0)
            bad = (1 - lam) * base + lam / k
        a[:, A == 1] = bad[:, None, :]
        add(f"instrument_{i}", rng.integers(1, 4), a, "instrument")
    for i in range(2):
        k = int(rng.integers(2, 4))
        base = _partition_test(rng, C, k, rng.uniform(0.75, 0.95))
        lam = rng.uniform(0.5, 1.0)
        a = np.empty((C, 4, k))
        a[:, B == 0] = base[:, None, :]
        a[:, B == 1] = ((1 - lam) * base + lam / k)[:, None, :]
        add(f"b_dependent_{i}", rng.integers(1, 4), a, "nuisance_dependent")
    acc = rng.uniform(0.85, 0.97)
    a = np.empty((C, 4, 2))
    a[:, B == 0] = [acc, 1 - acc]
    a[:, B == 1] = [1 - acc, acc]
    add("check_B", 1, a, "nuisance_check")
    for i, c in enumerate(np.argsort(-prior)[:3]):
        sens, fp = rng.uniform(0.8, 0.95), rng.uniform(0.02, 0.1)
        a = np.empty((C, 4, 2))
        a[:] = [1 - fp, fp]
        a[c] = [1 - sens, sens]
        add(f"specific_{i}", rng.integers(2, 5), a, "specific")
    return Table(name="random", causes=[f"c{i}" for i in range(C)], prior=prior,
                 nuisances=["a0/b0", "a0/b1", "a1/b0", "a1/b1"], p_nuis=p_nuis, tests=tests,
                 costs=np.array(costs), outcomes=outcomes, lik=lik,
                 budget=float(round(5 * np.mean(costs))), roles=roles)


def jitter_spec(spec: dict, rng: np.random.Generator, scale: float = 0.35) -> dict:
    """A perturbed copy of a YAML table: every probability vector in it (cause priors,
    nuisance probabilities, test rows) gets independent Normal(0, scale^2) noise on its
    log-probabilities and is renormalised. Structure (which test depends on what), costs and
    budget are unchanged."""
    import copy
    s = copy.deepcopy(spec)

    def jit(p):
        p = np.array([float(x) for x in p])
        q = p * np.exp(scale * rng.standard_normal(len(p)))
        return (q / q.sum()).tolist()
    names = list(s["causes"])
    pri = jit([s["causes"][c]["prior"] if isinstance(s["causes"][c], dict) else s["causes"][c]
               for c in names])
    for c, p in zip(names, pri):
        if isinstance(s["causes"][c], dict):
            s["causes"][c]["prior"] = p
        else:
            s["causes"][c] = p
    for f in (s.get("nuisances") or {}).values():
        f["prob"] = jit(f["prob"])
        for k in list(f.get("given_cause") or {}):
            f["given_cause"][k] = jit(f["given_cause"][k])
        for tab in (f.get("given_nuisance") or {}).values():
            for k in list(tab):
                tab[k] = jit(tab[k])
    for t in s["tests"].values():
        t["default"] = jit(t["default"])
        for row in t.get("rows") or []:
            row["p"] = jit(row["p"])
    return s
