"""DAG lab: learn a hidden causal Bayesian network from a few small experiments, then forecast
the effect of held-out interventions.

Model (everything here is disclosed to the agent by `rules()`; only the particular DAG and its
probability tables are hidden):

  * n binary variables X0..X{n-1}. The DAG is drawn UNIFORMLY from all DAGs on n labelled
    nodes in which every node has at most `max_indegree` parents (default: no limit, so all
    29,281 DAGs on 5 nodes).
  * For every node i and every configuration c of its parents, theta[i, c] = P(X_i = 1 | c)
    is drawn independently from Beta(alpha, alpha).
  * An experiment is a batch of independent joint samples, either observational or under one
    perfect intervention do(X_i = v): X_i is set to v whatever its parents are, every other
    variable is drawn from its own table given its parents.
  * After the experiments, queries are revealed: P(X_t = 1 | do(X_a = v)) and
    P(X_t = 1 | do(X_a = v, X_b = w)). The agent submits one probability per query.

Because n is small, everything is exact:

  * marginal likelihood of a DAG = product over nodes i and parent configurations c of
    B(alpha + n1, alpha + n0) / B(alpha, alpha), where n1/n0 count the samples with that
    parent configuration and X_i = 1/0 AMONG THE SAMPLES IN WHICH i WAS NOT INTERVENED ON;
  * the posterior over all DAGs is by enumeration;
  * the posterior predictive of a query is the posterior-weighted average over DAGs of the
    query computed with posterior-MEAN tables (exact, because a joint probability is a product
    of distinct, independent table entries);
  * the expected information gain of one more sample about (DAG, tables) is closed form.

State encoding: a joint state is an integer x in [0, 2^n) with bit i = value of X_i. A parent
set is a bitmask. Tables are stored "expanded" over all 2^n states (value depends only on the
parent bits), which makes every operation a gather or an einsum.

Usage (see docs/DAGNET.md):

    lab = DagLab()
    obs = lab.reset(seed=0, salt="secret")
    obs = lab.step({"X2": 1})            # batch of samples under do(X2 = 1); {} = observe
    queries = lab.finish()["queries"]
    res = lab.submit([0.5] * len(queries))   # the prior predictive: scores exactly 0
"""

from __future__ import annotations

import math
import time
from dataclasses import asdict, dataclass
from functools import lru_cache

import numpy as np
from scipy.special import betaln, digamma, logsumexp

from .chem_lab import salted_key

P_MIN, P_MAX = 1e-3, 1 - 1e-3   # submitted probabilities are clamped to this range


@dataclass(frozen=True)
class Config:
    n: int = 5               # number of binary variables
    max_indegree: int = 4    # every node has at most this many parents (4 = no limit for n = 5)
    alpha: float = 0.5       # theta ~ Beta(alpha, alpha), independently per node and parent config
    batch: int = 3           # joint samples returned by one experiment
    budget: int = 6          # number of experiments
    n_single: int = 12       # queries with one intervened variable
    n_double: int = 12       # queries with two intervened variables

    @property
    def n_queries(self) -> int:
        return self.n_single + self.n_double


DEFAULT = Config()

# Per-task normalising constant: prior average of [score knowing the truth - score of the prior
# predictive], estimated once by `estimate_norm` (see scripts/dagnet_calibrate.py --norm) and
# stored. Keyed by (n, max_indegree, alpha, n_single, n_double). The default task's value is
# from 4,000,000 prior draws (standard error 0.00006); other configs are estimated on demand.
NORMS: dict[tuple, float] = {(5, 4, 0.5, 12, 12): 0.24465}


def norm_constant(cfg: Config = DEFAULT) -> float:
    key = (cfg.n, cfg.max_indegree, cfg.alpha, cfg.n_single, cfg.n_double)
    if key not in NORMS:
        NORMS[key] = estimate_norm(cfg, draws=20_000)["norm"]
    return NORMS[key]


# ---- DAG enumeration and fixed lookup tables ---------------------------------------------

def enumerate_dags(n: int, max_indegree: int | None = None) -> np.ndarray:
    """All DAGs on n labelled nodes with in-degree <= max_indegree, as (G, n) parent bitmasks."""
    k = n - 1 if max_indegree is None else max_indegree
    opts = [np.array([m for m in range(1 << n) if not (m >> i) & 1 and bin(m).count("1") <= k],
                     dtype=np.int16) for i in range(n)]
    pm = np.stack([g.ravel() for g in np.meshgrid(*opts, indexing="ij")], 1)
    removed = np.zeros(len(pm), np.int16)      # nodes peeled off so far (sources first)
    for _ in range(n):
        for i in range(n):
            ok = (pm[:, i] & ~removed) == 0
            removed |= ok.astype(np.int16) << i
    return pm[removed == (1 << n) - 1].astype(np.int64)


class _Struct:
    def __init__(self, n: int, k: int):
        self.n, self.X = n, 1 << n
        self.ps = enumerate_dags(n, k)                                   # (G, n)
        self.G = len(self.ps)
        x = np.arange(self.X)
        self.bit = ((x[None, :] >> np.arange(n)[:, None]) & 1).astype(float)   # (n, X)
        # A[S, x, x'] = 1 if x and x' agree on the bits in S
        self.A = (((x[:, None] ^ x[None, :])[None] & x[:, None, None]) == 0).astype(float)
        pop = np.array([bin(m).count("1") for m in range(self.X)])
        self.pop = pop
        self.mult = 2.0 ** (n - pop)                                     # states per parent config
        self.nodes = np.arange(n)[None, :]
        self.edge = ((self.ps[:, None, :] >> np.arange(n)[None, :, None]) & 1).astype(float)  # [g, j, i]: j -> i
        self.mec = self._mec_keys()

    def _mec_keys(self) -> np.ndarray:
        """Integer key of the Markov equivalence class: skeleton + v-structures."""
        n, adj = self.n, self.edge.astype(bool)
        skel = adj | adj.transpose(0, 2, 1)
        key, b = np.zeros(self.G, np.int64), 0
        for a in range(n):
            for c in range(a + 1, n):
                key |= skel[:, a, c].astype(np.int64) << b
                b += 1
                for t in range(n):
                    if t not in (a, c):
                        key |= (adj[:, a, t] & adj[:, c, t] & ~skel[:, a, c]).astype(np.int64) << b
                        b += 1
        return key


@lru_cache(maxsize=None)
def structures(n: int, max_indegree: int) -> _Struct:
    return _Struct(n, max_indegree)


def var_name(i: int) -> str:
    return f"X{i}"


def action_menu(cfg: Config = DEFAULT) -> list[dict[int, int]]:
    """Every allowed experiment: observe ({}), or do(X_i = v) for one variable."""
    return [{}] + [{i: v} for i in range(cfg.n) for v in (0, 1)]


def all_queries(cfg: Config = DEFAULT) -> tuple[list, list]:
    """(single, double): every (do-dict, target) with one / two intervened variables."""
    n = cfg.n
    single = [({a: v}, t) for a in range(n) for v in (0, 1) for t in range(n) if t != a]
    double = [({a: v, b: w}, t) for a in range(n) for b in range(a + 1, n)
              for v in (0, 1) for w in (0, 1) for t in range(n) if t not in (a, b)]
    return single, double


def parse_do(action, cfg: Config = DEFAULT, max_vars: int = 1) -> dict[int, int]:
    """Action -> {variable index: value}. Accepts {} / None (observe), {"X2": 1}, {2: 1}, or
    {"do": {...}}. Raises ValueError on anything else."""
    if action is None:
        return {}
    if isinstance(action, dict) and set(action) == {"do"}:
        action = action["do"]
    if not isinstance(action, dict):
        raise ValueError('action must be a dict such as {} (observe) or {"X2": 1}')
    out: dict[int, int] = {}
    for k, v in action.items():
        if isinstance(k, str) and k[:1] in "Xx" and k[1:].isdigit():
            i = int(k[1:])
        elif isinstance(k, (int, np.integer)) and not isinstance(k, bool):
            i = int(k)
        else:
            raise ValueError(f"unknown variable {k!r}; variables are X0..X{cfg.n - 1}")
        if not 0 <= i < cfg.n:
            raise ValueError(f"unknown variable {k!r}; variables are X0..X{cfg.n - 1}")
        if isinstance(v, bool) or not isinstance(v, (int, np.integer, float)) or v not in (0, 1):
            raise ValueError(f"value for X{i} must be 0 or 1")
        if i in out:
            raise ValueError(f"X{i} given twice")
        out[i] = int(v)
    if len(out) > max_vars:
        raise ValueError(f"an experiment can intervene on at most {max_vars} variable(s)")
    return out


# ---- true networks -----------------------------------------------------------------------

def expand_tables(u: np.ndarray, masks: np.ndarray) -> np.ndarray:
    """u: (..., n, X) iid draws; masks: (..., n) parent bitmasks. Returns theta with
    theta[..., i, x] = u[..., i, x & mask_i]: a table that depends only on the parent bits."""
    X = u.shape[-1]
    idx = np.arange(X) & masks[..., None]
    return np.take_along_axis(u, idx, axis=-1)


def interventional_joint(theta: np.ndarray, do: dict[int, int], bit: np.ndarray) -> np.ndarray:
    """Exact joint distribution over the 2^n states under do(...). theta: (..., n, X)."""
    f = np.where(bit > 0, theta, 1 - theta)
    out = np.ones(theta.shape[:-2] + theta.shape[-1:])
    for i in range(theta.shape[-2]):
        out = out * ((bit[i] == do[i]) if i in do else f[..., i, :])
    return out


def estimate_norm(cfg: Config = DEFAULT, draws: int = 200_000, seed: int = 0) -> dict:
    """Monte Carlo estimate of E_prior[ S(truth) - S(prior predictive) ] with its standard
    error. S = mean over queries of p* log q + (1 - p*) log(1 - q); the prior predictive is 0.5
    for every query, so S(prior) = log 0.5."""
    st = structures(cfg.n, cfg.max_indegree)
    rng = np.random.default_rng([seed, 0xD0A6])
    single, double = all_queries(cfg)
    vals = []
    for lo in range(0, draws, 20_000):
        b = min(20_000, draws - lo)
        masks = st.ps[rng.integers(st.G, size=b)]
        theta = expand_tables(rng.beta(cfg.alpha, cfg.alpha, size=(b, cfg.n, st.X)), masks)
        tot = np.zeros(b)
        for qs, wgt in ((single, cfg.n_single), (double, cfg.n_double)):
            acc, cache = np.zeros(b), {}
            for do, t in qs:
                key = tuple(sorted(do.items()))
                if key not in cache:
                    cache[key] = interventional_joint(theta, do, st.bit)
                p = cache[key] @ st.bit[t]
                q = np.clip(p, P_MIN, P_MAX)
                acc += p * np.log(q) + (1 - p) * np.log1p(-q)
            tot += wgt / cfg.n_queries * acc / len(qs)
        vals.append(tot - math.log(0.5))
    v = np.concatenate(vals)
    return {"norm": float(v.mean()), "se": float(v.std(ddof=1) / math.sqrt(len(v))), "draws": len(v)}


# ---- exact Bayesian inference ------------------------------------------------------------

class Belief:
    """Sufficient statistics of the public data, and everything computed from them.

    `free[i, x]` counts samples with joint state x in which node i was NOT intervened on;
    `pooled[x]` counts all samples. `log` keeps the raw batches (for the shortcut baselines)."""

    def __init__(self, cfg: Config = DEFAULT):
        self.cfg, self.st = cfg, structures(cfg.n, cfg.max_indegree)
        self.free = np.zeros((cfg.n, self.st.X))
        self.pooled = np.zeros(self.st.X)
        self.log: list[tuple[dict[int, int], np.ndarray]] = []
        self._memo: dict = {}

    def add(self, do: dict[int, int], samples) -> None:
        s = np.asarray(samples, dtype=np.int64).reshape(-1, self.cfg.n)
        states = s @ (1 << np.arange(self.cfg.n))
        c = np.bincount(states, minlength=self.st.X).astype(float)
        self.pooled += c
        for i in range(self.cfg.n):
            if i not in do:
                self.free[i] += c
        self.log.append((dict(do), states))
        self._memo.clear()

    # -- per node / parent set quantities, each (n, S, X) or (n, S) --

    def counts(self, keep_term: bool = False) -> tuple[np.ndarray, np.ndarray]:
        """n1[i, S, x], n0[i, S, x]: samples whose S-bits agree with x and X_i = 1 / 0.
        keep_term=True is the WRONG variant that also counts samples where i was set."""
        key = ("counts", keep_term)
        if key not in self._memo:
            st = self.st
            cnt = np.broadcast_to(self.pooled, self.free.shape) if keep_term else self.free
            n1 = np.einsum("sxy,iy->isx", st.A, cnt * st.bit)
            n0 = np.einsum("sxy,iy->isx", st.A, cnt * (1 - st.bit))
            self._memo[key] = (n1, n0)
        return self._memo[key]

    def local_scores(self, mode: str = "exact") -> np.ndarray:
        """Log score of each (node, parent set): (n, S). mode: "exact" (Beta-Bernoulli marginal
        likelihood), "keep_term" (same, wrongly keeping intervened samples), "bic"."""
        st, a = self.st, self.cfg.alpha
        n1, n0 = self.counts(mode == "keep_term")
        if mode == "bic":
            with np.errstate(divide="ignore", invalid="ignore"):
                ll = np.where(n1 > 0, n1 * np.log(n1 / (n1 + n0)), 0) + \
                     np.where(n0 > 0, n0 * np.log(n0 / (n1 + n0)), 0)
            ntot = np.maximum(self.free.sum(1), 1.0)
            return ll.sum(-1) / st.mult - 0.5 * (2.0 ** st.pop)[None, :] * np.log(ntot)[:, None]
        return (betaln(a + n1, a + n0) - betaln(a, a)).sum(-1) / st.mult

    def log_weights(self, mode: str = "exact") -> np.ndarray:
        """Normalised log posterior over all DAGs (uniform prior)."""
        key = ("lw", mode)
        if key not in self._memo:
            lw = self.local_scores(mode)[self.st.nodes, self.st.ps].sum(1)
            self._memo[key] = lw - logsumexp(lw)
        return self._memo[key]

    def weights(self, mode: str = "exact") -> np.ndarray:
        return np.exp(self.log_weights(mode))

    def tables(self, kind: str = "mean", keep_term: bool = False) -> np.ndarray:
        """P(X_i = 1 | parent config of x) for every node and parent set: (n, S, X).
        kind: "mean" (posterior mean, exact), "mle" (0.5 where there is no data), "laplace"."""
        n1, n0 = self.counts(keep_term)
        if kind == "mean":
            return (self.cfg.alpha + n1) / (2 * self.cfg.alpha + n1 + n0)
        if kind == "laplace":
            return (1 + n1) / (2 + n1 + n0)
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(n1 + n0 > 0, n1 / (n1 + n0), 0.5)

    # -- predictions --

    def predict(self, queries, weights: np.ndarray | None = None, kind: str = "mean",
                keep_term: bool = False) -> np.ndarray:
        """P(X_t = 1 | do(...)) for each (do, t), averaged over DAGs with `weights` (default:
        the exact posterior), using `kind` tables. Exact Bayes for the defaults."""
        st = self.st
        w = self.weights("keep_term" if keep_term else "exact") if weights is None else weights
        sel = np.flatnonzero(w > 0)
        p1 = self.tables(kind, keep_term)
        f = np.where(st.bit[:, None, :] > 0, p1, 1 - p1)
        F = f[st.nodes, st.ps[sel]]                                # (g, n, X)
        cache, out = {}, []
        for do, t in queries:
            key = tuple(sorted(do.items()))
            if key not in cache:
                joint = np.ones((len(sel), st.X))
                for i in range(st.n):
                    joint *= (st.bit[i] == do[i]) if i in do else F[:, i, :]
                cache[key] = w[sel] @ joint
            out.append(float(cache[key] @ st.bit[t]))
        return np.clip(np.array(out), 0.0, 1.0)   # guards float round-off only

    def eig(self, target: str = "joint") -> np.ndarray:
        """Expected information gain (nats) of ONE more joint sample under each action of
        `action_menu`, exact. target="joint": about (DAG, tables); "dag": about the DAG only."""
        st, a = self.st, self.cfg.alpha
        w = self.weights()
        n1, n0 = self.counts()
        p1 = (a + n1) / (2 * a + n1 + n0)
        one = st.bit[:, None, :] > 0
        logf = np.log(np.where(one, p1, 1 - p1))
        logF = logf[st.nodes, st.ps]                                # (G, n, X)
        sumlog = logF.sum(1)
        if target == "joint":
            # E[theta log theta] / E[theta] for the Beta posterior of the entry used by state x
            e = digamma(a + np.where(one, n1, n0) + 1) - digamma(2 * a + n1 + n0 + 1)
            E = e[st.nodes, st.ps]
            sumE = E.sum(1)
        out = []
        for do in action_menu(self.cfg):
            if do:
                (i, v), = do.items()
                lj = sumlog - logF[:, i, :]
                ind = st.bit[i] == v
            else:
                lj, ind = sumlog, 1.0
            joint = np.exp(lj) * ind
            pbar = w @ joint
            h = -float(np.sum(pbar[pbar > 0] * np.log(pbar[pbar > 0])))
            inner = (sumE - E[:, i, :] if do else sumE) if target == "joint" else lj
            out.append(h + float(w @ (joint * inner).sum(1)))
        return np.array(out)

    # -- summaries for demos and diagnostics --

    def edge_probabilities(self) -> np.ndarray:
        """P(X_j -> X_i | data) as a matrix [j][i]."""
        return np.einsum("g,gji->ji", self.weights(), self.st.edge)

    def summary(self, top: int = 3) -> dict:
        w = self.weights()
        order = np.argsort(-w)[:top]
        n = self.cfg.n
        return {
            "edge_probabilities": [[round(float(v), 4) for v in row] for row in self.edge_probabilities()],
            "entropy_nats": float(-np.sum(w[w > 0] * np.log(w[w > 0]))),
            "max_entropy_nats": math.log(self.st.G),
            "top_dags": [{"probability": float(w[g]),
                          "edges": [f"X{j}->X{i}" for i in range(n) for j in range(n)
                                    if (self.st.ps[g, i] >> j) & 1]} for g in order],
        }

    # -- shortcut baselines (deliberately not Bayes) --

    def predict_see_as_do(self, queries) -> np.ndarray:
        """Correlational shortcut: P(X_t = 1 | X_a = v, ...) in the pooled data, as if do were
        see. Laplace-smoothed."""
        st, out = self.st, []
        for do, t in queries:
            m = np.ones(st.X)
            for i, v in do.items():
                m = m * (st.bit[i] == v)
            c = self.pooled * m
            out.append((1 + c @ st.bit[t]) / (2 + c.sum()))
        return np.array(out)

    def predict_empirical(self, queries) -> np.ndarray:
        """Hurried-coder shortcut: Laplace-smoothed frequency of X_t = 1 among samples from a
        matching interventional batch; for a two-variable query, samples from do(a) with
        X_b = w or from do(b) with X_a = v; if there are none, pooled conditioning."""
        st, out = self.st, []
        for do, t in queries:
            c = np.zeros(st.X)
            for d, states in self.log:
                if d and all(do.get(i) == v for i, v in d.items()):
                    cc = np.bincount(states, minlength=st.X).astype(float)
                    for i, v in do.items():
                        cc = cc * (st.bit[i] == v)
                    c += cc
            if c.sum() == 0:
                c = self.pooled.copy()
                for i, v in do.items():
                    c = c * (st.bit[i] == v)
            out.append((1 + c @ st.bit[t]) / (2 + c.sum()))
        return np.array(out)


# ---- environment -------------------------------------------------------------------------

def rules(cfg: Config = DEFAULT) -> dict:
    st = structures(cfg.n, cfg.max_indegree)
    n = cfg.n
    return {
        "description": (
            f"A hidden causal Bayesian network over {n} binary variables X0..X{n - 1}. You run "
            f"up to {cfg.budget} experiments; each returns {cfg.batch} independent joint samples "
            "of all variables, either observational or under one intervention do(X_i = v). Then "
            "you call finish_experiments, which reveals the queries: each asks for "
            "P(X_t = 1 | do(...)) under an intervention on one or two variables. You submit one "
            "probability per query. Only the particular DAG and its probability tables are "
            "hidden; the process that generated them is given exactly below."),
        "variables": [var_name(i) for i in range(n)],
        "generative_model": {
            "dag": (f"Drawn uniformly at random from the set of ALL directed acyclic graphs on "
                    f"the {n} labelled nodes"
                    + ("" if cfg.max_indegree >= n - 1 else
                       f" in which every node has at most {cfg.max_indegree} parents")
                    + (f" (a node may have up to {n - 1} parents)" if cfg.max_indegree >= n - 1 else "")
                    + f". There are {st.G} such graphs, each with prior probability "
                    f"1/{st.G}. (The labels carry no order: X0 is as likely to be a child of X4 "
                    "as the reverse.)"),
            "tables": (f"For every node i and every configuration c of its parents (2^|parents| "
                       "configurations; one for a node without parents), "
                       f"theta[i, c] = P(X_i = 1 | parents = c) is drawn independently from "
                       f"Beta({cfg.alpha}, {cfg.alpha})."),
            "observation": ("A sample draws every variable in topological order: "
                            "X_i ~ Bernoulli(theta[i, values of its parents])."),
            "intervention": ("Under do(X_i = v), X_i is set to v regardless of its parents; "
                             "every other variable is drawn from its own unchanged table given "
                             "its parents (which may include X_i). Under do(X_a = v, X_b = w) "
                             "both are set."),
            "independence": "All samples are independent given the DAG and the tables.",
        },
        "experiments": {
            "budget": cfg.budget,
            "samples_per_experiment": cfg.batch,
            "allowed": ("{} (pure observation) or exactly one variable set to 0 or 1, e.g. "
                        '{"X2": 1}. Two-variable interventions are NOT available as experiments. '
                        "Every experiment costs 1, whatever it is."),
            "invalid_actions": "rejected with an error; they do not consume budget",
        },
        "queries": {
            "count": cfg.n_queries,
            "how_drawn": (
                f"{cfg.n_single} drawn uniformly without replacement from the {2 * n * (n - 1)} "
                "single-intervention queries (a, v, t): P(X_t = 1 | do(X_a = v)), t != a; and "
                f"{cfg.n_double} drawn uniformly without replacement from the "
                f"{n * (n - 1) // 2 * 4 * (n - 2)} double-intervention queries "
                "(a < b, v, w, t): P(X_t = 1 | do(X_a = v, X_b = w)), t not in {a, b}. They are "
                "drawn independently of the network and of your experiments, and are revealed "
                "only by finish_experiments."),
        },
        "scoring": {
            "clamp": [P_MIN, P_MAX],
            "formula": (
                "Let p*_k be the TRUE value of query k (computed exactly from the hidden tables, "
                "no sampling) and q_k your probability clamped to [0.001, 0.999]. "
                "S = mean_k [ p*_k log q_k + (1 - p*_k) log(1 - q_k) ]. "
                "raw = (S - log 0.5) / C with the constant C below; "
                "score = min(1, max(0, raw))."),
            "prior_predictive": ("By the symmetry of Beta(a, a), the prior predictive of every "
                                 "query is exactly 0.5; submitting 0.5 everywhere (or nothing) "
                                 "scores exactly 0."),
            "C": norm_constant(cfg),
            "C_meaning": ("prior average of [S(submitting the true p*) - log 0.5], estimated "
                          "once by Monte Carlo and fixed"),
            "advice": ("The expected score is maximised by the exact posterior predictive "
                       "probability of each query given your data. Overconfident answers are "
                       "punished heavily: log(0.001) = -6.9."),
        },
        "prior_strength_note": (f"Beta({cfg.alpha}, {cfg.alpha}) is U-shaped: many table entries "
                                "are close to 0 or 1."),
    }


class DagLab:
    """One episode at a time: reset -> step* -> finish -> submit. JSON-able observations.

    Exposed for demos/analysis (NOT given to the agent through the MCP server):
      .history       list of {"index", "do", "samples"}
      .belief        exact Belief over DAGs given the data so far (.summary(), .weights(), ...)
      .parents, .theta, .true_dag_index, .truth   the hidden network and the true query values
    """

    TAG_DAG, TAG_TABLE, TAG_NOISE, TAG_QUERY = 0xDA61, 0xDA62, 0xDA63, 0xDA64

    def __init__(self, cfg: Config = DEFAULT, track: bool = True):
        self.cfg, self.track = cfg, track
        self.st = structures(cfg.n, cfg.max_indegree)
        self._g: int | None = None

    def reset(self, seed: int, salt: str | None = None) -> dict:
        cfg, st = self.cfg, self.st
        self.seed, self.salt = int(seed), salt
        key = lambda tag: np.random.default_rng(salted_key(seed, salt, tag))
        self._g = int(key(self.TAG_DAG).integers(st.G))
        self.parents = st.ps[self._g].copy()
        self.theta = expand_tables(key(self.TAG_TABLE).beta(cfg.alpha, cfg.alpha, size=(cfg.n, st.X)),
                                   self.parents)
        # common random numbers: experiment k, sample s, node i always uses the same uniform
        self._u = key(self.TAG_NOISE).random((cfg.budget, cfg.batch, cfg.n))
        single, double = all_queries(cfg)
        rq = key(self.TAG_QUERY)
        self._queries = ([single[j] for j in rq.choice(len(single), cfg.n_single, replace=False)]
                         + [double[j] for j in rq.choice(len(double), cfg.n_double, replace=False)])
        self.truth = np.array([interventional_joint(self.theta, do, st.bit) @ st.bit[t]
                               for do, t in self._queries])
        self._order = self._topo(self.parents)
        self.belief = Belief(cfg)
        self.history: list[dict] = []
        self.finished = False
        self.result: dict | None = None
        out = {"experiments_remaining": cfg.budget}
        if self.track:
            out["posterior"] = self.belief.summary()
        return out

    @staticmethod
    def _topo(parents: np.ndarray) -> list[int]:
        order, done = [], 0
        while len(order) < len(parents):
            for i, m in enumerate(parents):
                if not (done >> i) & 1 and (int(m) & ~done) == 0:
                    order.append(i)
                    done |= 1 << i
        return order

    @property
    def true_dag_index(self) -> int:
        return self._g

    @property
    def remaining(self) -> int:
        return self.cfg.budget - len(self.history)

    def step(self, action) -> dict:
        if self._g is None:
            raise RuntimeError("call reset first")
        if self.finished:
            raise RuntimeError("the experiment phase is over")
        if self.remaining <= 0:
            raise RuntimeError("experiment budget exhausted")
        do = parse_do(action, self.cfg)
        k = len(self.history)
        x = np.zeros(self.cfg.batch, np.int64)
        for i in self._order:
            v = np.full(self.cfg.batch, do[i]) if i in do else (self._u[k, :, i] < self.theta[i, x])
            x |= v.astype(np.int64) << i
        samples = ((x[:, None] >> np.arange(self.cfg.n)) & 1).astype(int)
        self.belief.add(do, samples)
        rec = {"index": k, "do": {var_name(i): v for i, v in do.items()},
               "samples": samples.tolist()}
        self.history.append(rec)
        out = {"result": rec, "experiments_remaining": self.remaining}
        if self.track:
            out["posterior"] = self.belief.summary()
        return out

    def queries_public(self) -> list[dict]:
        return [{"index": k, "do": {var_name(i): v for i, v in do.items()}, "target": var_name(t)}
                for k, (do, t) in enumerate(self._queries)]

    def finish(self) -> dict:
        """End the experiment phase; only now are the queries revealed."""
        if self._g is None:
            raise RuntimeError("call reset first")
        self.finished = True
        return {"queries": self.queries_public(), "n_queries": self.cfg.n_queries}

    @property
    def queries(self) -> list:
        if not self.finished:
            raise RuntimeError("queries are revealed by finish()")
        return list(self._queries)

    def score(self, probabilities) -> dict:
        """Reward of a vector of probabilities (does not end the episode)."""
        q = parse_probabilities(probabilities, self.cfg.n_queries)
        p, half = self.truth, math.log(0.5)
        # gain over the prior predictive, term by term, so that q = 0.5 gives exactly 0.0
        gain = lambda r: float(np.mean(p * (np.log(r) - half) + (1 - p) * (np.log(1 - r) - half)))
        g, g_truth = gain(q), gain(np.clip(p, P_MIN, P_MAX))
        c = norm_constant(self.cfg)
        raw = g / c
        return {"reward_raw": raw, "score": min(1.0, max(0.0, raw)), "log_score": g + half,
                "log_score_prior": half, "log_score_truth": g_truth + half,
                "raw_knowing_truth": g_truth / c, "norm": c}

    def submit(self, probabilities, with_reference: bool = False) -> dict:
        if self._g is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("already submitted")
        if not self.finished:
            raise RuntimeError("call finish first: the queries have not been revealed")
        out = self.score(probabilities)
        out["n_experiments"] = len(self.history)
        if with_reference:
            ref = run_policy("reference", self.seed, self.salt, self.cfg)
            out["reference_raw"] = ref.result["reward_raw"]
            out["reference_score"] = ref.result["score"]
            out["gap_to_reference"] = out["reward_raw"] - out["reference_raw"]
            # what exact inference would have scored on the agent's OWN data: splits the gap
            # into design (data choice) and inference
            own = self.score(self.belief.predict(self._queries))
            out["exact_on_own_data_raw"] = own["reward_raw"]
        self.result = out
        return out


def parse_probabilities(probabilities, k: int) -> np.ndarray:
    try:
        q = np.asarray(probabilities, dtype=float).reshape(-1)
    except (TypeError, ValueError):
        raise ValueError("probabilities must be a list of numbers") from None
    if len(q) != k:
        raise ValueError(f"expected {k} probabilities (one per query, in query order), got {len(q)}")
    if not np.all(np.isfinite(q)) or np.any(q < 0) or np.any(q > 1):
        raise ValueError("every probability must be a finite number in [0, 1]")
    return np.clip(q, P_MIN, P_MAX)


# ---- policies ----------------------------------------------------------------------------

DESIGNS = ("reference", "eig_dag", "random", "observe", "round_robin", "prior")


def choose_action(belief: Belief, design: str, k: int, rng: np.random.Generator | None = None) -> dict:
    """Next experiment of a design policy, from public data only."""
    menu = action_menu(belief.cfg)
    if design == "reference":
        return menu[int(np.argmax(belief.eig("joint")))]
    if design == "eig_dag":
        return menu[int(np.argmax(belief.eig("dag")))]
    if design == "random":
        return menu[int(rng.integers(len(menu)))]
    if design == "observe":
        return {}
    if design == "round_robin":
        return menu[k % len(menu)]
    raise KeyError(design)


def run_policy(design: str, seed: int, salt: str | None = None, cfg: Config = DEFAULT,
               submit: bool = True, track: bool = False) -> DagLab:
    """Play one episode in-process with exact inference. design: "reference" (greedy expected
    information gain about (DAG, tables)), "eig_dag", "random", "observe", "round_robin",
    "prior" (no experiments, submit 0.5). Returns the lab (see .history, .belief, .result)."""
    lab = DagLab(cfg, track=track)
    lab.reset(seed, salt)
    rng = np.random.default_rng([int(seed), 0xDA6])
    if design != "prior":
        while lab.remaining:
            lab.step(choose_action(lab.belief, design, len(lab.history), rng))
    lab.finish()
    if submit:
        lab.submit(np.full(cfg.n_queries, 0.5) if design == "prior"
                   else lab.belief.predict(lab.queries))
    return lab


def reference_trajectory(seed: int, salt: str | None = None, cfg: Config = DEFAULT) -> dict:
    lab = run_policy("reference", seed, salt, cfg)
    return {"history": lab.history, "result": lab.result}


def shortcut_predictions(belief: Belief, queries) -> dict[str, np.ndarray]:
    """Every inference rule compared in the calibration, on the same data."""
    w = belief.weights()
    onehot = lambda lw: (np.arange(len(lw)) == int(np.argmax(lw))).astype(float)
    return {
        "exact": belief.predict(queries),
        # the single most probable DAG (exact scores), posterior-mean tables
        "best_graph": belief.predict(queries, onehot(belief.log_weights())),
        # exact DAG weights, maximum-likelihood tables (0.5 where no data)
        "plugin_mle": belief.predict(queries, w, kind="mle"),
        # the usual pipeline: best BIC graph, Laplace-smoothed tables
        "bic_best_laplace": belief.predict(queries, onehot(belief.log_weights("bic")), kind="laplace"),
        # exact averaging, but intervened samples are treated as observational
        "ignore_interventions": belief.predict(queries, keep_term=True),
        "see_as_do": belief.predict_see_as_do(queries),
        "empirical": belief.predict_empirical(queries),
    }


def evaluate_seed(seed: int, salt: str | None = "calibration", cfg: Config = DEFAULT,
                  extra_designs: tuple[str, ...] = ()) -> dict:
    """All calibration policies on one hidden network (paired). Returns raw rewards and
    diagnostics of the reference's posterior."""
    st = structures(cfg.n, cfg.max_indegree)
    out: dict = {"seed": int(seed)}
    t0 = time.perf_counter()
    ref = run_policy("reference", seed, salt, cfg, submit=False)
    preds = shortcut_predictions(ref.belief, ref.queries)
    out["reference_seconds"] = time.perf_counter() - t0   # includes the shortcut predictions
    sc = ref.score(preds["exact"])
    out["reference"] = sc["reward_raw"]
    out["truth"] = sc["raw_knowing_truth"]
    out["prior"] = ref.score(np.full(cfg.n_queries, 0.5))["reward_raw"]
    for k, p in preds.items():
        if k != "exact":
            out[k] = ref.score(p)["reward_raw"]
    for design in ("random", "observe", "round_robin") + tuple(extra_designs):
        lab = run_policy(design, seed, salt, cfg, submit=False)
        out[design] = lab.score(lab.belief.predict(lab.queries))["reward_raw"]
        if design == "round_robin":
            out["round_robin_empirical"] = lab.score(lab.belief.predict_empirical(lab.queries))["reward_raw"]
    # how concentrated is the reference's posterior?
    w, g = ref.belief.weights(), ref.true_dag_index
    mec = st.mec == st.mec[g]
    imec = mec.copy()
    for rec in ref.history:              # same parents of every intervened node (Hauser-Buhlmann)
        for name in rec["do"]:
            i = int(name[1:])
            imec &= st.ps[:, i] == st.ps[g, i]
    out.update(post_true=float(w[g]), post_mec=float(w[mec].sum()), post_imec=float(w[imec].sum()),
               map_is_true=float(np.argmax(w) == g), map_in_imec=float(imec[np.argmax(w)]),
               imec_size=float(imec.sum()),
               n_interventions=float(sum(bool(r["do"]) for r in ref.history)))
    return out


def summarise(rows: list[dict], n_boot: int = 4000, seed: int = 0) -> dict:
    """Mean raw / clipped reward per policy and paired bootstrap 95% CIs of reference - policy."""
    rng = np.random.default_rng(seed)
    skip = {"seed", "reference_seconds", "post_true", "post_mec", "post_imec", "map_is_true",
            "map_in_imec", "imec_size", "n_interventions"}
    names = [k for k in rows[0] if k not in skip]
    v = {k: np.array([r[k] for r in rows]) for k in names}
    idx = rng.integers(len(rows), size=(n_boot, len(rows)))
    clip = lambda a: np.clip(a, 0.0, 1.0)
    out = {}
    for k in names:
        d_raw, d_clip = v["reference"] - v[k], clip(v["reference"]) - clip(v[k])
        ci = lambda d: [float(x) for x in np.percentile(d[idx].mean(1), [2.5, 97.5])]
        out[k] = {"mean_raw": float(v[k].mean()), "mean_score": float(clip(v[k]).mean()),
                  "median_raw": float(np.median(v[k])),
                  "ref_minus_raw": float(d_raw.mean()), "ref_minus_raw_ci95": ci(d_raw),
                  "ref_minus_score": float(d_clip.mean()), "ref_minus_score_ci95": ci(d_clip),
                  "share_ref_better": float(np.mean(d_raw > 1e-12))}
    diag = {k: float(np.mean([r[k] for r in rows])) for k in skip - {"seed"}}
    diag["share_post_true_gt_0.5"] = float(np.mean([r["post_true"] > 0.5 for r in rows]))
    diag["share_post_imec_gt_0.5"] = float(np.mean([r["post_imec"] > 0.5 for r in rows]))
    diag["share_post_imec_gt_0.9"] = float(np.mean([r["post_imec"] > 0.9 for r in rows]))
    return {"n": len(rows), "policies": out, "diagnostics": diag}


def table(summary: dict) -> str:
    lines = [f"{'policy':24s} {'raw':>7s} {'score':>6s}  ref-raw [95% CI]            ref-score [95% CI]"]
    for k, s in summary["policies"].items():
        a, b = s["ref_minus_raw_ci95"], s["ref_minus_score_ci95"]
        lines.append(f"{k:24s} {s['mean_raw']:7.3f} {s['mean_score']:6.3f}  "
                     f"{s['ref_minus_raw']:7.3f} [{a[0]:7.3f},{a[1]:7.3f}]   "
                     f"{s['ref_minus_score']:6.3f} [{b[0]:6.3f},{b[1]:6.3f}]")
    return "\n".join(lines)
