"""Light switch: an optogenetics circuit-mapping lab built on the DAG lab (bayesenv.dagnet).

A hidden circuit over four neuron populations (VTA, NAc, PFC, BLA) and one behavioural readout
(LEVER, a lever press) is drawn from a fully disclosed prior. The agent maps it causally under a
cost budget, with the pitfalls of real optogenetics, and then forecasts held-out IDEAL
interventions (perfect clamps of one or two populations, including pairs it may never have
silenced together).

Everything below is disclosed to the agent by `rules()`; only the particular draw is hidden.

  * Circuit. The populations form a DAG drawn uniformly from all 543 DAGs on the 4 labelled
    populations. LEVER has no children; each population is a direct input of LEVER
    independently with probability 1/2. Population tables: theta[i, c] ~ Beta(0.5, 0.5)
    independently per parent configuration (as in dagnet). LEVER: with no inputs, one rate
    ~ Beta(0.5, 0.5); with >= 1 input, an OR gate with probability 1/2 (P(press) = 0.9 if any
    input is active, 0.05 if none) and otherwise a free table with Beta(0.5, 0.5) entries.
  * Record: passive imaging of a naive animal, a batch of observational joint samples.
  * Express an opsin (ChR2 = excite, clamps to 1; ArchT = silence, clamps to 0) in one or two
    populations of a new animal. Each injection has a hidden expression level (low / medium /
    high, disclosed prior), independent across injections.
  * Light session on an animal at intensity I: on every trial, every opsin-expressing population
    is independently clamped with probability e = I^2 / (I^2 + K_level^2) (a Hill curve),
    otherwise it follows its own table. Strong light heats tissue: with probability h(I) per
    trial LEVER reads 1 whatever its inputs. All five variables are imaged on every trial; the
    agent never sees whether the clamp took on a given trial.

Exact inference (everything enumerable):

  * The posterior factorises into (population DAG, population tables, expression levels) and
    (LEVER model = input set + gate, LEVER table), because the likelihood is a product of node
    terms and LEVER is a sink.
  * A node's term, for a given parent set and a given assignment of expression levels to its
    injections, is a product over parent configurations of Beta integrals of polynomials in
    theta: a trial where the clamp may or may not have taken contributes (theta + e (1 - theta))
    (ChR2, X = 1) or ((1 - theta) + e theta) (ArchT, X = 0); a trial that contradicts the clamp
    contributes (1 - e) theta^x (1 - theta)^(1 - x). Expanding the product of binomials gives a
    finite sum of Beta functions. The expression levels are summed out exactly (3^k terms for k
    injections in a node). LEVER's heat artefact is the same polynomial with e = h(I), known.
  * Posterior predictive of an ideal intervention = posterior-weighted sum over population DAGs
    and LEVER models of the query computed with posterior-mean tables. Exact: within one joint
    state each node contributes one table entry, and nodes are independent given the structure.

State encoding: a joint state is an integer with bit i = value of node i (LEVER is bit 4).
Parents are always populations, so tables are indexed [parent mask over the 4 population bits,
population state] (expanded, as in dagnet).
"""

from __future__ import annotations

import itertools
import math
import time
from dataclasses import asdict, dataclass, replace
from functools import lru_cache

import numpy as np
from scipy.special import betaln, gammaln, logsumexp

from .chem_lab import salted_key
from .dagnet import P_MAX, P_MIN, enumerate_dags, parse_probabilities

POPS = ("VTA", "NAc", "PFC", "BLA")
BEHAVIOUR = "LEVER"
OPSINS = {"ChR2": 1, "ArchT": 0}          # clamp value
LEVELS = ("low", "medium", "high")


@dataclass(frozen=True)
class Config:
    alpha: float = 0.5                            # Beta(alpha, alpha) tables
    or_prob: float = 0.7                          # P(LEVER is an OR gate | >= 1 input)
    or_on: float = 0.95                           # OR gate: P(press | any input active)
    or_off: float = 0.02                          # OR gate: P(press | no input active)
    level_k: tuple = (10.0, 3.0, 1.0)             # half-activation intensity per level (mW/mm^2)
    level_prior: tuple = (0.3, 0.4, 0.3)
    hill: float = 2.0
    intensities: tuple = (1.0, 3.0, 10.0, 30.0)   # mW/mm^2
    heat: tuple = (0.0, 0.0, 0.3, 0.7)            # P(LEVER forced to 1) per trial, per intensity
    record_trials: int = 4
    session_trials: int = 4
    cost_record: int = 1
    cost_session: int = 1
    cost_express1: int = 3
    cost_express2: int = 4
    budget: int = 12
    max_animals: int = 5
    n_lever_single: int = 6        # of the 8 P(LEVER | do(P = v))
    n_lever_silence: int = 6       # of the 6 P(LEVER | do(P = 0, Q = 0)) (combined silencing)
    n_lever_double: int = 0        # of the 18 other P(LEVER | do(P = v, Q = w))
    n_pop_single: int = 4          # of the 24 P(T | do(P = v)), T a population
    n_pop_double: int = 4          # of the 48 P(T | do(P = v, Q = w)), T a population

    @property
    def n_queries(self) -> int:
        return sum(_n_per_pool(self).values())


DEFAULT = Config()
NP = len(POPS)            # populations
N = NP + 1                # nodes (LEVER = index NP)
L = NP                    # LEVER's index
XP = 1 << NP              # population states / parent masks
NAMES = POPS + (BEHAVIOUR,)

# Normalising constant C: prior average of [S(truth) - S(prior predictive)], keyed by the
# fields that affect it. Estimated with `estimate_norm`; see scripts/optolab_calibrate.py --norm.
NORMS: dict[tuple, float] = {
    # default task: 4,000,000 prior draws, standard error 0.00005
    (0.5, 0.7, 0.95, 0.02, 6, 6, 0, 4, 4): 0.26397,
}


def _norm_key(cfg: Config) -> tuple:
    return (cfg.alpha, cfg.or_prob, cfg.or_on, cfg.or_off) + tuple(_n_per_pool(cfg).values())


def norm_constant(cfg: Config = DEFAULT) -> float:
    k = _norm_key(cfg)
    if k not in NORMS:
        NORMS[k] = estimate_norm(cfg, draws=40_000)["norm"]
    return NORMS[k]


def efficacy(cfg: Config) -> np.ndarray:
    """e[intensity index, level index] = I^h / (I^h + K^h)."""
    I = np.array(cfg.intensities)[:, None]
    K = np.array(cfg.level_k)[None, :]
    return I ** cfg.hill / (I ** cfg.hill + K ** cfg.hill)


# ---- fixed lookup tables -------------------------------------------------------------------

class _Struct:
    def __init__(self):
        self.pd = enumerate_dags(NP)                                   # (Gp, NP) parent masks
        self.Gp = len(self.pd)
        x = np.arange(XP)
        self.bit = ((x[None, :] >> np.arange(NP)[:, None]) & 1).astype(float)   # (NP, XP)
        self.A = (((x[:, None] ^ x[None, :])[None] & x[:, None, None]) == 0).astype(float)
        self.pop = np.array([bin(m).count("1") for m in range(XP)])
        self.mult = 2.0 ** (NP - self.pop)
        self.nodes = np.arange(NP)[None, :]
        # LEVER models: (input mask, gate) with gate 0 = free table, 1 = OR gate (mask != 0)
        self.lm = [(s, 0) for s in range(XP)] + [(s, 1) for s in range(1, XP)]
        self.lm_mask = np.array([s for s, _ in self.lm])
        self.lm_gate = np.array([g for _, g in self.lm])
        self.any_on = (x[None, :] & np.arange(XP)[:, None]) != 0        # [mask, state]
        self.pd_edge = ((self.pd[:, None, :] >> np.arange(NP)[None, :, None]) & 1).astype(float)


@lru_cache(maxsize=None)
def structures() -> _Struct:
    return _Struct()


def lever_log_prior(cfg: Config) -> np.ndarray:
    st = structures()
    lp = np.full(len(st.lm), -math.log(XP))
    for k, (s, g) in enumerate(st.lm):
        if s:
            p = cfg.or_prob if g else 1 - cfg.or_prob
            lp[k] += math.log(p) if p > 0 else -np.inf
    return lp


def or_table(cfg: Config) -> np.ndarray:
    """theta[mask, state] of the OR gate."""
    return np.where(structures().any_on, cfg.or_on, cfg.or_off)


# ---- queries --------------------------------------------------------------------------------

def query_pools() -> dict[str, list]:
    """Every ideal-intervention query (do-dict over populations, target node), by category."""
    single = [({a: v}, t) for a in range(NP) for v in (0, 1) for t in range(N) if t != a]
    double = [({a: v, b: w}, t) for a in range(NP) for b in range(a + 1, NP)
              for v in (0, 1) for w in (0, 1) for t in range(N) if t not in (a, b)]
    silence = lambda q: q[1] == L and set(q[0].values()) == {0}
    return {"lever_single": [q for q in single if q[1] == L],
            "lever_silence": [q for q in double if silence(q)],
            "lever_double": [q for q in double if q[1] == L and not silence(q)],
            "pop_single": [q for q in single if q[1] != L],
            "pop_double": [q for q in double if q[1] != L]}


def _n_per_pool(cfg: Config) -> dict[str, int]:
    return {"lever_single": cfg.n_lever_single, "lever_silence": cfg.n_lever_silence,
            "lever_double": cfg.n_lever_double,
            "pop_single": cfg.n_pop_single, "pop_double": cfg.n_pop_double}


def describe_query(do: dict, t: int) -> dict:
    return {"do": {NAMES[i]: v for i, v in do.items()}, "target": NAMES[t]}


# ---- true networks --------------------------------------------------------------------------

def expand(u: np.ndarray, masks: np.ndarray) -> np.ndarray:
    """u: (..., k, XP), masks: (..., k) -> table[..., i, x] = u[..., i, x & mask_i]."""
    idx = np.arange(XP) & masks[..., None]
    return np.take_along_axis(u, idx, axis=-1)


def pop_joint(theta: np.ndarray, do: dict) -> np.ndarray:
    """Exact joint over the population states under ideal do(...). theta: (..., NP, XP)."""
    st = structures()
    out = np.ones(theta.shape[:-2] + (XP,))
    for i in range(NP):
        if i in do:
            out = out * (st.bit[i] == do[i])
        else:
            out = out * np.where(st.bit[i] > 0, theta[..., i, :], 1 - theta[..., i, :])
    return out


def query_values(theta_pop: np.ndarray, theta_lever: np.ndarray, queries) -> np.ndarray:
    """P(target = 1 | do) for each query; theta_pop (..., NP, XP), theta_lever (..., XP)."""
    st, cache, out = structures(), {}, []
    for do, t in queries:
        key = tuple(sorted(do.items()))
        if key not in cache:
            cache[key] = pop_joint(theta_pop, do)
        j = cache[key]
        out.append((j * theta_lever).sum(-1) if t == L else j @ st.bit[t])
    return np.stack(out, -1)


def draw_prior(rng: np.random.Generator, cfg: Config, size: int) -> dict:
    """Vectorised prior draws of the hidden circuit."""
    st = structures()
    pd = rng.integers(st.Gp, size=size)
    masks = st.pd[pd]
    theta_pop = expand(rng.beta(cfg.alpha, cfg.alpha, size=(size, NP, XP)), masks)
    lmask = rng.integers(XP, size=size)
    gate = (lmask > 0) & (rng.random(size) < cfg.or_prob)
    free = expand(rng.beta(cfg.alpha, cfg.alpha, size=(size, 1, XP)), lmask[:, None])[:, 0]
    theta_lever = np.where(gate[:, None], or_table(cfg)[lmask], free)
    return {"pd": pd, "theta_pop": theta_pop, "lmask": lmask, "gate": gate.astype(int),
            "theta_lever": theta_lever}


def prior_predictive(cfg: Config = DEFAULT) -> dict[str, np.ndarray]:
    b = Belief(cfg)
    return {k: b.predict(qs) for k, qs in query_pools().items()}


def _gain(p, q, q0):
    return p * (np.log(q) - np.log(q0)) + (1 - p) * (np.log1p(-q) - np.log1p(-q0))


def estimate_norm(cfg: Config = DEFAULT, draws: int = 200_000, seed: int = 0) -> dict:
    """Monte Carlo E_prior[S(truth) - S(prior predictive)] (per-query mean, with the task's mix
    of query categories) and its standard error."""
    rng = np.random.default_rng([seed, 0x0F70])
    pools, npp, q0s = query_pools(), _n_per_pool(cfg), prior_predictive(cfg)
    q0s = {k: np.clip(v, P_MIN, P_MAX) for k, v in q0s.items()}
    nq = cfg.n_queries
    vals = []
    for lo in range(0, draws, 20_000):
        b = min(20_000, draws - lo)
        d = draw_prior(rng, cfg, b)
        tot = np.zeros(b)
        for k, qs in pools.items():
            p = query_values(d["theta_pop"], d["theta_lever"], qs)          # (b, |pool|)
            g = _gain(p, np.clip(p, P_MIN, P_MAX), q0s[k][None, :])
            tot += npp[k] / nq * g.mean(1)
        vals.append(tot)
    v = np.concatenate(vals)
    return {"norm": float(v.mean()), "se": float(v.std(ddof=1) / math.sqrt(len(v))), "draws": len(v)}


# ---- exact Bayesian inference ---------------------------------------------------------------

def _poly_binomial(m: np.ndarray, e: np.ndarray, v: int, D: int) -> np.ndarray:
    """Coefficients over a = number of extra theta factors (0..D) of
    (theta + e (1 - theta))^m  (v = 1)  or  ((1 - theta) + e theta)^m  (v = 0).
    m: (S, X) counts; e: (C,) -> (C, S, X, D + 1)."""
    a = np.arange(D + 1)
    j = (m[..., None] - a) if v == 1 else np.broadcast_to(a, m.shape + (D + 1,))
    ok = (j >= 0) & (j <= m[..., None]) & (a <= m[..., None])
    jj = np.where(ok, j, 0)
    lc = gammaln(m[..., None] + 1) - gammaln(jj + 1) - gammaln(m[..., None] - jj + 1)
    with np.errstate(divide="ignore"):
        le = np.log(e)[:, None, None, None] * jj[None]
    return np.where(ok[None], np.exp(lc[None] + le), 0.0)


def _conv(p: np.ndarray, q: np.ndarray) -> np.ndarray:
    Dp, Dq = p.shape[-1] - 1, q.shape[-1] - 1
    out = np.zeros(np.broadcast_shapes(p.shape[:-1], q.shape[:-1]) + (Dp + Dq + 1,))
    for s in range(Dq + 1):
        out[..., s:s + Dp + 1] += p * q[..., s:s + 1]
    return out


def _node_terms(alpha, n1, n0, conds, combos_e, log_prior_c):
    """Exact Beta-polynomial integrals for one node, all parent masks and expanded states.

    n1, n0: (S, X) natural counts aggregated by parent configuration.
    conds: list of (v, my, mn, cidx) where my = trials with X = v, mn = trials with X != v, both
    (S, X); cidx indexes the efficacy column of combos_e for this condition.
    combos_e: (C, n_cond_cols) efficacy (or heat) per combination of hidden levels.
    Returns logml_c (C, S), Eth_c (C, S, X), log Z per cell (C, S, X)."""
    st = structures()
    C = combos_e.shape[0]
    poly = np.ones((C,) + n1.shape + (1,))
    const = np.zeros((C,) + n1.shape)
    M = np.zeros(n1.shape)
    for v, my, mn, ci in conds:
        e = combos_e[:, ci]
        Dx = int(my.max()) if my.size else 0
        if Dx > 0:
            poly = _conv(poly, _poly_binomial(my, e, v, Dx))
        M = M + my
        const = const + np.log1p(-e)[:, None, None] * mn[None]
        if v == 1:            # trials contradicting the clamp: (1 - e) theta^x(1-theta)^(1-x)
            n0 = n0 + mn      # X = 0 under ChR2
        else:
            n1 = n1 + mn      # X = 1 under ArchT
    D = poly.shape[-1] - 1
    a = np.arange(D + 1)
    b = M[..., None] - a                                          # extra (1 - theta) factors
    ok = b >= 0
    bb = np.where(ok, b, 0)
    with np.errstate(divide="ignore"):
        lp = np.where(ok[None], np.log(poly), -np.inf)
    base = betaln(alpha, alpha)
    lz = logsumexp(lp + betaln(alpha + n1[..., None] + a, alpha + n0[..., None] + bb)[None], -1)
    lzp = logsumexp(lp + betaln(alpha + n1[..., None] + a + 1, alpha + n0[..., None] + bb)[None], -1)
    logz = const + lz - base
    eth = np.exp(lzp - lz)
    logml_c = (logz / st.mult[None, :, None]).sum(-1)              # each cell counted mult times
    return logml_c, eth, logz


class Belief:
    """Sufficient statistics of the public data and the exact posterior computed from them.

    Flags reproduce shortcut agents (for calibration only):
      perfect_clamp=True  light sessions treated as ideal do(): the targeted node's trials dropped
      model_heat=False    heat ignored: LEVER trials under light counted as natural
      or_prob=None        override the prior P(OR gate) (0 = an agent that ignores OR gates)."""

    def __init__(self, cfg: Config = DEFAULT, perfect_clamp: bool = False, model_heat: bool = True,
                 or_prob: float | None = None):
        self.cfg, self.st = cfg, structures()
        self.perfect_clamp, self.model_heat = perfect_clamp, model_heat
        self.or_prob = cfg.or_prob if or_prob is None else or_prob
        self.eff = efficacy(cfg)
        self.nat = np.zeros((N, 2, XP))            # [node, value, population state]
        self.cond: list[dict] = [dict() for _ in range(N)]   # node -> {key: (v, counts (2, XP))}
        self.injections: list[tuple[int, int]] = []          # (node, clamp value)
        self.animals: list[list[int]] = []                   # injection ids per animal
        self.pooled = np.zeros(1 << N)
        self.log: list[dict] = []
        self._memo: dict = {}

    # -- data --

    def add_animal(self, opsin_value: int, nodes) -> int:
        ids = []
        for j in nodes:
            self.injections.append((int(j), int(opsin_value)))
            ids.append(len(self.injections) - 1)
        self.animals.append(ids)
        self._memo.clear()
        return len(self.animals) - 1

    def add(self, samples, animal: int | None = None, intensity: int | None = None) -> None:
        """samples: (b, N) 0/1 rows. animal=None: a record (no light)."""
        s = np.asarray(samples, dtype=np.int64).reshape(-1, N)
        xp = s[:, :NP] @ (1 << np.arange(NP))
        self.pooled += np.bincount(s @ (1 << np.arange(N)), minlength=1 << N)
        targeted = {}
        if animal is not None:
            for q in self.animals[animal]:
                targeted[self.injections[q][0]] = q
        h = self.cfg.heat[intensity] if animal is not None else 0.0
        for j in range(N):
            c = np.zeros((2, XP))
            np.add.at(c, (s[:, j], xp), 1)
            if j in targeted:
                if self.perfect_clamp:
                    continue
                q = targeted[j]
                key = ("inj", q, intensity)
                self._acc(j, key, self.injections[q][1], c)
            elif j == L and h > 0 and self.model_heat:
                self._acc(j, ("heat", intensity), 1, c)
            else:
                self.nat[j] += c
        self.log.append({"animal": animal, "intensity": intensity, "samples": s})
        self._memo.clear()

    def _acc(self, j, key, v, c):
        if key in self.cond[j]:
            self.cond[j][key] = (v, self.cond[j][key][1] + c)
        else:
            self.cond[j][key] = (v, c)

    # -- per node posterior --

    def _agg(self, c: np.ndarray) -> np.ndarray:
        return np.einsum("sxy,y->sx", self.st.A, c)

    def node(self, j: int) -> dict:
        """Exact posterior quantities of node j for every parent mask (population nodes) or every
        LEVER model. Cached until new data arrive."""
        key = ("node", j)
        if key in self._memo:
            return self._memo[key]
        cfg, st = self.cfg, self.st
        n1, n0 = self._agg(self.nat[j, 1]), self._agg(self.nat[j, 0])
        if j < NP:
            inj = sorted({k[1] for k in self.cond[j]})
            combos = np.array(list(itertools.product(range(len(LEVELS)), repeat=len(inj))), dtype=int)
            combos = combos.reshape(len(combos), len(inj))
            lpc = np.log(np.array(cfg.level_prior))[combos].sum(1)
            conds, cols = [], []
            for kk, (v, c) in self.cond[j].items():
                _, q, ii = kk
                cols.append(self.eff[ii][combos[:, inj.index(q)]])
                conds.append((v, self._agg(c[v]), self._agg(c[1 - v]), len(cols) - 1))
            ce = np.stack(cols, 1) if cols else np.zeros((len(combos), 0))
            logml_c, eth_c, _ = _node_terms(cfg.alpha, n1, n0, conds, ce, lpc)
            lml = logsumexp(lpc[:, None] + logml_c, 0)                       # (S,)
            wc = np.exp(lpc[:, None] + logml_c - lml[None])                  # (C, S)
            out = {"logml": lml, "Eth": np.einsum("cs,csx->sx", wc, eth_c), "wc": wc,
                   "eth_c": eth_c, "combos": combos, "inj": inj}
        else:
            conds, cols = [], []
            for kk, (v, c) in self.cond[j].items():
                cols.append(cfg.heat[kk[1]])
                conds.append((1, self._agg(c[1]), self._agg(c[0]), len(cols) - 1))
            ce = np.array([cols]) if cols else np.zeros((1, 0))
            logml_c, eth_c, _ = _node_terms(cfg.alpha, n1, n0, conds, ce, np.zeros(1))
            # OR gate: fixed table, likelihood straight from the per-state counts
            th = or_table(cfg)                                               # (S, X)
            lor = (self.nat[j, 1] * np.log(th) + self.nat[j, 0] * np.log1p(-th)).sum(-1)
            for kk, (v, c) in self.cond[j].items():
                h = cfg.heat[kk[1]]
                lor = lor + (c[1] * np.log(h + (1 - h) * th) + c[0] * np.log((1 - h) * (1 - th))).sum(-1)
            lp = lever_log_prior(replace(cfg, or_prob=self.or_prob))
            with np.errstate(divide="ignore"):
                lml = np.where(st.lm_gate == 1, lor[st.lm_mask], logml_c[0][st.lm_mask])
                lml = np.where(np.isfinite(lp), lml, -np.inf)
            Eth = np.where(st.lm_gate[:, None] == 1, th[st.lm_mask], eth_c[0][st.lm_mask])  # (M, X)
            lw = lp + lml
            out = {"logml": lml, "Eth": Eth, "lw": lw - logsumexp(lw)}
        self._memo[key] = out
        return out

    def pd_log_weights(self) -> np.ndarray:
        key = "pdw"
        if key not in self._memo:
            lm = np.stack([self.node(j)["logml"] for j in range(NP)])        # (NP, S)
            lw = lm[self.st.nodes, self.st.pd].sum(1)
            self._memo[key] = lw - logsumexp(lw)
        return self._memo[key]

    def pd_weights(self) -> np.ndarray:
        return np.exp(self.pd_log_weights())

    def lever_weights(self) -> np.ndarray:
        return np.exp(self.node(L)["lw"])

    # -- predictive tables under a regime --

    def _targeted_table(self, j: int, q: int | None, ii: int, v: int) -> np.ndarray:
        """P(X_j = 1 | parent mask, state) on a trial where node j is illuminated: existing
        injection q (hidden level from its posterior) or a new one (q=None, prior level)."""
        nd = self.node(j)
        if q is None:
            e = float(np.dot(self.cfg.level_prior, self.eff[ii]))
            return e + (1 - e) * nd["Eth"] if v == 1 else (1 - e) * nd["Eth"]
        if q not in nd["inj"]:                                    # injection without data yet
            e = float(np.dot(self.cfg.level_prior, self.eff[ii]))
            return e + (1 - e) * nd["Eth"] if v == 1 else (1 - e) * nd["Eth"]
        e = self.eff[ii][nd["combos"][:, nd["inj"].index(q)]][:, None, None]
        inner = e + (1 - e) * nd["eth_c"] if v == 1 else (1 - e) * nd["eth_c"]
        return np.einsum("cs,csx->sx", nd["wc"], inner)

    def regime_tables(self, targets: dict | None = None, ii: int | None = None):
        """targets: {node: (injection id or None, clamp value)}; ii: intensity index or None.
        Returns pop tables f (NP, S, X) and LEVER tables g (M, X) for one trial."""
        targets = targets or {}
        f = np.stack([self._targeted_table(j, *targets[j][:1], ii, targets[j][1]) if j in targets
                      else self.node(j)["Eth"] for j in range(NP)])
        g = self.node(L)["Eth"]
        if ii is not None and self.cfg.heat[ii] > 0:
            h = self.cfg.heat[ii]
            g = h + (1 - h) * g
        return f, g

    def _pop_joint_all(self, f: np.ndarray, do: dict | None = None) -> np.ndarray:
        """A[pd, x]: P(population state x | population DAG pd) with tables f; do = ideal clamps."""
        st, do = self.st, do or {}
        F = f[st.nodes, st.pd]                                     # (Gp, NP, X)
        A = np.ones((st.Gp, XP))
        for i in range(NP):
            A *= (st.bit[i] == do[i]) if i in do else np.where(st.bit[i] > 0, F[:, i], 1 - F[:, i])
        return A

    # -- predictions --

    def predict(self, queries) -> np.ndarray:
        """Exact posterior predictive P(target = 1 | ideal do) per query."""
        st = self.st
        w, u = self.pd_weights(), self.lever_weights()
        f, g = self.regime_tables()
        gbar = u @ g                                               # (X,)
        cache, out = {}, []
        for do, t in queries:
            key = tuple(sorted(do.items()))
            if key not in cache:
                cache[key] = w @ self._pop_joint_all(f, do)
            j = cache[key]
            out.append(float(j @ gbar) if t == L else float(j @ st.bit[t]))
        return np.clip(np.array(out), 0.0, 1.0)

    def eig(self, targets: dict | None = None, ii: int | None = None) -> float:
        """Exact expected information gain (nats) of ONE trial about the structure (population
        DAG and LEVER model), with tables and expression levels integrated out."""
        w, u = self.pd_weights(), self.lever_weights()
        f, g = self.regime_tables(targets, ii)
        A = self._pop_joint_all(f)                                  # (Gp, X)
        Abar = w @ A
        ent = lambda p: -np.sum(np.where(p > 0, p * np.log(np.where(p > 0, p, 1)), 0), -1)
        h2 = lambda p: ent(np.stack([p, 1 - p], -1))
        gbar = u @ g
        return float(ent(Abar) - w @ ent(A) + Abar @ (h2(gbar) - u @ h2(g)))

    # -- summaries --

    def edge_probabilities(self) -> np.ndarray:
        """P(j -> i | data) over all five nodes, [j][i]."""
        out = np.zeros((N, N))
        out[:NP, :NP] = np.einsum("g,gji->ji", self.pd_weights(), self.st.pd_edge)
        u = self.lever_weights()
        for j in range(NP):
            out[j, L] = float(u[(self.st.lm_mask >> j) & 1 == 1].sum())
        return out

    def summary(self) -> dict:
        u = self.lever_weights()
        return {"edge_probabilities": [[round(float(v), 4) for v in r] for r in self.edge_probabilities()],
                "p_or_gate": float(u[self.st.lm_gate == 1].sum())}

    # -- correlational shortcut --

    def predict_see_as_do(self, queries) -> np.ndarray:
        bit = ((np.arange(1 << N)[None, :] >> np.arange(N)[:, None]) & 1)
        out = []
        for do, t in queries:
            m = np.ones(1 << N)
            for i, v in do.items():
                m = m * (bit[i] == v)
            c = self.pooled * m
            out.append((1 + c @ bit[t]) / (2 + c.sum()))
        return np.array(out)


# ---- actions --------------------------------------------------------------------------------

def _pop_index(name) -> int:
    if isinstance(name, str):
        for i, p in enumerate(POPS):
            if name.strip().lower() == p.lower():
                return i
    raise ValueError(f"unknown population {name!r}; populations are {list(POPS)}")


def _intensity_index(x, cfg: Config) -> int:
    try:
        v = float(x)
    except (TypeError, ValueError):
        raise ValueError(f"intensity must be one of {list(cfg.intensities)}") from None
    for i, I in enumerate(cfg.intensities):
        if abs(v - I) < 1e-9:
            return i
    raise ValueError(f"intensity must be one of {list(cfg.intensities)} (mW/mm^2)")


def parse_action(action, cfg: Config = DEFAULT) -> dict:
    """Validate an action dict. Returns a normalised dict; raises ValueError."""
    if not isinstance(action, dict) or "action" not in action:
        raise ValueError('action must be a dict with key "action": "record", "express" or "light"')
    kind = action["action"]
    if kind == "record":
        return {"action": "record"}
    if kind == "express":
        op = action.get("opsin")
        if op not in OPSINS:
            raise ValueError(f"opsin must be one of {list(OPSINS)}")
        pops = action.get("populations")
        if isinstance(pops, str):
            pops = [pops]
        if not isinstance(pops, (list, tuple)) or len(pops) not in (1, 2):
            raise ValueError("populations must be a list of one or two population names")
        idx = [_pop_index(p) for p in pops]
        if len(set(idx)) != len(idx):
            raise ValueError("the two populations must differ")
        return {"action": "express", "opsin": op, "populations": sorted(idx)}
    if kind == "light":
        a = action.get("animal")
        if isinstance(a, bool) or not isinstance(a, (int, np.integer, float)) or int(a) != a:
            raise ValueError("animal must be an integer id returned by express")
        return {"action": "light", "animal": int(a), "intensity": _intensity_index(action.get("intensity"), cfg)}
    raise ValueError('action must be "record", "express" or "light"')


def action_cost(act: dict, cfg: Config = DEFAULT) -> int:
    if act["action"] == "record":
        return cfg.cost_record
    if act["action"] == "light":
        return cfg.cost_session
    return cfg.cost_express1 if len(act["populations"]) == 1 else cfg.cost_express2


# ---- environment ----------------------------------------------------------------------------

class OptoLab:
    """reset -> step* (record / express / light) -> finish -> submit. JSON-able observations.

    For analysis (NOT given to the agent): .pd_index, .theta_pop, .lever_mask, .gate,
    .theta_lever, .levels (per injection), .belief (exact posterior), .truth."""

    TAG_STRUCT, TAG_TABLE, TAG_LEVER, TAG_LEVEL, TAG_NOISE, TAG_QUERY = 0x0F71, 0x0F72, 0x0F73, 0x0F74, 0x0F75, 0x0F76

    def __init__(self, cfg: Config = DEFAULT, belief_kw: dict | None = None):
        self.cfg, self.st = cfg, structures()
        self.belief_kw = belief_kw or {}
        self._ready = False

    def reset(self, seed: int, salt: str | None = None) -> dict:
        cfg, st = self.cfg, self.st
        self.seed, self.salt = int(seed), salt
        key = lambda tag: np.random.default_rng(salted_key(seed, salt, tag))
        self.pd_index = int(key(self.TAG_STRUCT).integers(st.Gp))
        self.parents = st.pd[self.pd_index].copy()
        self.theta_pop = expand(key(self.TAG_TABLE).beta(cfg.alpha, cfg.alpha, size=(NP, XP)), self.parents)
        rl = key(self.TAG_LEVER)
        self.lever_mask = int(rl.integers(XP))
        self.gate = int(self.lever_mask > 0 and rl.random() < cfg.or_prob)
        free = expand(rl.beta(cfg.alpha, cfg.alpha, size=(1, XP)), np.array([self.lever_mask]))[0]
        self.theta_lever = or_table(cfg)[self.lever_mask] if self.gate else free
        # expression level of the k-th injection made in this episode (common random numbers)
        self._levels = key(self.TAG_LEVEL).choice(len(LEVELS), size=2 * cfg.budget, p=cfg.level_prior)
        nmax = max(cfg.record_trials, cfg.session_trials)
        rn = key(self.TAG_NOISE)
        self._u = rn.random((cfg.budget, nmax, N))       # natural draws
        self._uc = rn.random((cfg.budget, nmax, NP))     # clamp success
        self._uh = rn.random((cfg.budget, nmax))         # heat artefact
        rq, pools = key(self.TAG_QUERY), query_pools()
        self._queries, self._qcat = [], []
        for k, n in _n_per_pool(cfg).items():
            pool = pools[k]
            self._queries += [pool[j] for j in rq.choice(len(pool), n, replace=False)]
            self._qcat += [k] * n
        self.truth = query_values(self.theta_pop, self.theta_lever, self._queries)
        self.prior_q = Belief(cfg).predict(self._queries)
        self._order = self._topo(self.parents)
        self.belief = Belief(cfg, **self.belief_kw)
        self.animals: list[dict] = []
        self.levels: list[int] = []
        self.history: list[dict] = []
        self.spent, self.n_sessions = 0, 0
        self.finished, self.result = False, None
        self._ready = True
        return self.status()

    @staticmethod
    def _topo(parents) -> list[int]:
        order, done = [], 0
        while len(order) < len(parents):
            for i, m in enumerate(parents):
                if not (done >> i) & 1 and (int(m) & ~done) == 0:
                    order.append(i)
                    done |= 1 << i
        return order

    @property
    def remaining(self) -> int:
        return self.cfg.budget - self.spent

    def status(self) -> dict:
        return {"budget_remaining": self.remaining,
                "animals": [{"animal": k, "opsin": a["opsin"],
                             "populations": [POPS[j] for j in a["populations"]]}
                            for k, a in enumerate(self.animals)]}

    def _simulate(self, b: int, clamps: dict, ii: int | None) -> np.ndarray:
        """b trials; clamps: {node: (clamp value, efficacy)}; ii: intensity index or None."""
        k = self.n_sessions
        x = np.zeros(b, np.int64)
        for i in self._order:
            nat = self._u[k, :b, i] < self.theta_pop[i, x & (XP - 1)]
            if i in clamps:
                v, e = clamps[i]
                val = np.where(self._uc[k, :b, i] < e, v, nat)
            else:
                val = nat
            x |= val.astype(np.int64) << i
        lev = self._u[k, :b, L] < self.theta_lever[x & (XP - 1)]
        if ii is not None:
            lev = lev | (self._uh[k, :b] < self.cfg.heat[ii])
        x |= lev.astype(np.int64) << L
        self.n_sessions += 1
        return ((x[:, None] >> np.arange(N)) & 1).astype(int)

    def step(self, action) -> dict:
        if not self._ready:
            raise RuntimeError("call reset first")
        if self.finished:
            raise RuntimeError("the experiment phase is over")
        act = parse_action(action, self.cfg)
        cost = action_cost(act, self.cfg)
        if act["action"] == "express" and len(self.animals) >= self.cfg.max_animals:
            raise ValueError(f"at most {self.cfg.max_animals} animals per study")
        if act["action"] == "light" and not 0 <= act["animal"] < len(self.animals):
            raise ValueError(f"no animal {act['animal']}; express an opsin first (animals: "
                             f"{list(range(len(self.animals)))})")
        if cost > self.remaining:
            raise ValueError(f"not enough budget: this costs {cost}, {self.remaining} left")
        self.spent += cost
        rec = {"index": len(self.history), "cost": cost}
        if act["action"] == "record":
            s = self._simulate(self.cfg.record_trials, {}, None)
            self.belief.add(s)
            rec.update(action="record", samples=s.tolist())
        elif act["action"] == "express":
            v = OPSINS[act["opsin"]]
            for _ in act["populations"]:
                self.levels.append(int(self._levels[len(self.levels)]))
            first = len(self.levels) - len(act["populations"])
            self.animals.append({"opsin": act["opsin"], "populations": act["populations"],
                                 "levels": self.levels[first:]})
            aid = self.belief.add_animal(v, act["populations"])
            rec.update(action="express", opsin=act["opsin"], animal=aid,
                       populations=[POPS[j] for j in act["populations"]])
        else:
            a = self.animals[act["animal"]]
            v, ii = OPSINS[a["opsin"]], act["intensity"]
            eff = efficacy(self.cfg)[ii]
            clamps = {j: (v, eff[lv]) for j, lv in zip(a["populations"], a["levels"])}
            s = self._simulate(self.cfg.session_trials, clamps, ii)
            self.belief.add(s, act["animal"], ii)
            rec.update(action="light", animal=act["animal"], intensity=self.cfg.intensities[ii],
                       samples=s.tolist())
        self.history.append(rec)
        return {"result": rec, "budget_remaining": self.remaining}

    def finish(self) -> dict:
        if not self._ready:
            raise RuntimeError("call reset first")
        self.finished = True
        return {"queries": [{"index": k, **describe_query(do, t), "prior_predictive": round(float(q0), 6)}
                            for k, ((do, t), q0) in enumerate(zip(self._queries, self.prior_q))],
                "n_queries": len(self._queries)}

    @property
    def queries(self) -> list:
        if not self.finished:
            raise RuntimeError("queries are revealed by finish()")
        return list(self._queries)

    def score(self, probabilities) -> dict:
        q = parse_probabilities(probabilities, len(self._queries))
        p, q0 = self.truth, np.clip(self.prior_q, P_MIN, P_MAX)
        g = float(np.mean(_gain(p, q, q0)))
        gt = float(np.mean(_gain(p, np.clip(p, P_MIN, P_MAX), q0)))
        c = norm_constant(self.cfg)
        ls0 = float(np.mean(p * np.log(q0) + (1 - p) * np.log1p(-q0)))
        return {"reward_raw": g / c, "score": min(1.0, max(0.0, g / c)), "log_score": g + ls0,
                "log_score_prior": ls0, "log_score_truth": gt + ls0, "raw_knowing_truth": gt / c,
                "norm": c}

    def submit(self, probabilities, with_reference: bool = False) -> dict:
        if not self._ready:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("already submitted")
        if not self.finished:
            raise RuntimeError("call finish first: the queries have not been revealed")
        out = self.score(probabilities)
        out["spent"] = self.spent
        if with_reference:
            ref = run_policy("reference", self.seed, self.salt, self.cfg)
            out["reference_raw"] = ref.result["reward_raw"]
            out["gap_to_reference"] = out["reward_raw"] - out["reference_raw"]
            out["exact_on_own_data_raw"] = self.score(self.belief.predict(self._queries))["reward_raw"]
        self.result = out
        return out


# ---- rules shown to the agent ---------------------------------------------------------------

def rules(cfg: Config = DEFAULT) -> dict:
    st = structures()
    eff = efficacy(cfg)
    return {
        "description": (
            "Map a hidden neural circuit with optogenetics. Four neuron populations (VTA, NAc, PFC, "
            "BLA) and one behavioural readout (LEVER: did the animal press the lever on that trial) "
            "are binary on every trial (1 = active / pressed). Spend a budget on passive recordings, "
            "opsin expression in new animals, and light sessions. Then call finish_experiments, "
            "which reveals queries: each asks for P(target = 1) under an IDEAL intervention that "
            "clamps one or two populations (every trial, exactly, no side effects). Submit one "
            "probability per query. Only the particular circuit, its probability tables and the "
            "animals' expression levels are hidden; the process that generated them is given "
            "exactly below."),
        "nodes": list(NAMES),
        "generative_model": {
            "population_graph": (
                f"The direct connections among the 4 populations form a DAG drawn uniformly at "
                f"random from ALL {st.Gp} directed acyclic graphs on the 4 labelled populations "
                f"(each with probability 1/{st.Gp}; a population may have 0 to 3 inputs; names "
                "carry no anatomical information)."),
            "population_tables": (
                "For every population i and every configuration c of its inputs (2^|inputs| "
                "configurations; one if it has no inputs), theta[i, c] = P(i active | inputs = c) "
                f"~ Beta({cfg.alpha}, {cfg.alpha}), independently."),
            "lever_inputs": ("LEVER has no outputs. Each population is a direct input of LEVER "
                             "independently with probability 1/2 (so all 16 input sets are equally "
                             "likely), independently of the population graph."),
            "lever_table": (
                f"If LEVER has no inputs: P(press) ~ Beta({cfg.alpha}, {cfg.alpha}). If it has at "
                f"least one input: with probability {cfg.or_prob} it is an OR gate, "
                f"P(press) = {cfg.or_on} if ANY input is active and {cfg.or_off} if none is; "
                f"otherwise (probability {1 - cfg.or_prob:.2g}) it has a free table, P(press | inputs = c) "
                f"~ Beta({cfg.alpha}, {cfg.alpha}) independently per input configuration. Gate type "
                "and tables are independent of everything else."),
            "natural_trial": ("Populations are drawn in topological order, each ~ Bernoulli(theta"
                              "[i, its inputs]); then LEVER from its gate/table given its inputs."),
            "independence": "Trials are independent given the circuit (and, in light sessions, the "
                            "animal's expression levels and the light intensity).",
        },
        "actions": {
            "record": (f"Passive calcium imaging of a naive animal: {cfg.record_trials} natural "
                       f"trials, all 5 variables observed. Cost {cfg.cost_record}."),
            "express": (
                "Create a new animal expressing one opsin in one or two populations: ChR2 "
                "(excitatory: when it takes, the population is clamped to 1) or ArchT (inhibitory: "
                "when it takes, clamped to 0). Both populations of a two-population animal get the "
                f"same opsin. Cost {cfg.cost_express1} (one population) or {cfg.cost_express2} (two). "
                "Returns the animal id. Produces no data by itself. At most "
                f"{cfg.max_animals} animals."),
            "light": (
                f"A light session on one of your animals at an intensity from {list(cfg.intensities)} "
                f"mW/mm^2: {cfg.session_trials} trials, light on during every trial, all 5 variables "
                f"observed (including the illuminated ones). Cost {cfg.cost_session}. Sessions on "
                "the same animal can be repeated at any intensity."),
            "invalid_actions": "rejected with an error; they consume no budget",
            "budget": cfg.budget,
        },
        "opsin_model": {
            "expression_level": (
                f"Each injected population of each animal has a hidden expression level in "
                f"{list(LEVELS)} with prior probabilities {list(cfg.level_prior)}, independently "
                "across injections (the two populations of a two-population animal have independent "
                "levels). A level is fixed for the animal's lifetime."),
            "efficacy": (
                f"On each trial of a light session at intensity I, each illuminated population is "
                f"independently clamped (to 1 for ChR2, 0 for ArchT) with probability "
                f"e = I^{cfg.hill:g} / (I^{cfg.hill:g} + K^{cfg.hill:g}), with K = "
                + ", ".join(f"{k:g} ({n})" for n, k in zip(LEVELS, cfg.level_k))
                + " mW/mm^2; otherwise it follows its own table given its inputs, as on a natural "
                  "trial. The other populations always follow their tables (their inputs may "
                  "include the clamped one). You do not see whether the clamp took on a trial."),
            "efficacy_table": {f"I={I:g}": {n: round(float(eff[i, l]), 4) for l, n in enumerate(LEVELS)}
                               for i, I in enumerate(cfg.intensities)},
            "heating_artefact": (
                "Light heats tissue. On each trial of a light session at intensity I, independently, "
                "with probability h(I) LEVER reads 1 whatever its inputs (otherwise it follows its "
                "gate/table): h = "
                + ", ".join(f"{h:g} at I={I:g}" for I, h in zip(cfg.intensities, cfg.heat))
                + ". Populations are not affected. Recordings have no light and no artefact."),
        },
        "queries": {
            "count": cfg.n_queries,
            "how_drawn": (
                f"Uniformly without replacement, independently of the circuit and of your "
                f"experiments: {cfg.n_lever_single} of the 8 queries P(LEVER = 1 | do(P = v)); "
                f"{cfg.n_lever_silence} of the 6 combined-silencing queries "
                "P(LEVER = 1 | do(P = 0, Q = 0)); "
                f"{cfg.n_lever_double} of the 18 other queries P(LEVER = 1 | do(P = v, Q = w)); "
                f"{cfg.n_pop_single} of the 24 queries P(T = 1 | do(P = v)) for a population T != P; "
                f"{cfg.n_pop_double} of the 48 queries P(T = 1 | do(P = v, Q = w)) for a population "
                "T not in {P, Q}; P, Q are populations, v, w in {0, 1}. do() is an IDEAL clamp: on "
                "every trial, no efficacy loss, no heating; all other nodes follow their tables. "
                "Revealed only by finish_experiments, each with its prior predictive value."),
        },
        "scoring": {
            "clamp": [P_MIN, P_MAX],
            "formula": (
                "For query k let p*_k be its TRUE value (computed exactly from the hidden circuit, "
                "no sampling), q_k your probability and q0_k the prior predictive (the answer "
                "implied by the prior alone, before any data; given with each query), both "
                "clamped to [0.001, 0.999]. "
                "G = mean_k [ p*_k (log q_k - log q0_k) + (1 - p*_k) (log(1 - q_k) - log(1 - q0_k)) ]. "
                "raw = G / C with the constant C below; score = min(1, max(0, raw))."),
            "C": norm_constant(cfg),
            "C_meaning": ("prior average of G when submitting the true p* (estimated once by Monte "
                          "Carlo and fixed)"),
            "prior_predictive": "Submitting q0 (or nothing) scores exactly 0.",
            "advice": ("The expected score is maximised by the exact posterior predictive "
                       "probability of each query given all your data. Overconfident answers are "
                       "punished heavily."),
        },
    }


# ---- policies -------------------------------------------------------------------------------

DESIGNS = ("reference", "random", "record_only", "single_silence", "no_dual", "max_light",
           "min_light", "fixed_10")


def candidates(lab_or_belief, remaining: int, n_animals: int, cfg: Config) -> list[dict]:
    """Every affordable next step. New-animal candidates bundle express + first session."""
    b = lab_or_belief
    out = []
    if cfg.cost_record <= remaining:
        out.append({"kind": "record", "cost": cfg.cost_record, "trials": cfg.record_trials})
    if cfg.cost_session <= remaining:
        for a, ids in enumerate(b.animals):
            v = b.injections[ids[0]][1]
            for ii in range(len(cfg.intensities)):
                out.append({"kind": "session", "animal": a, "ii": ii, "v": v, "cost": cfg.cost_session,
                            "trials": cfg.session_trials,
                            "targets": {b.injections[q][0]: (q, v) for q in ids}, "dual": len(ids) == 2})
    if n_animals < cfg.max_animals:
        for op, v in OPSINS.items():
            for nodes in [(i,) for i in range(NP)] + list(itertools.combinations(range(NP), 2)):
                c = (cfg.cost_express1 if len(nodes) == 1 else cfg.cost_express2) + cfg.cost_session
                if c > remaining:
                    continue
                for ii in range(len(cfg.intensities)):
                    out.append({"kind": "new", "opsin": op, "v": v, "nodes": nodes, "ii": ii, "cost": c,
                                "trials": cfg.session_trials, "targets": {j: (None, v) for j in nodes},
                                "dual": len(nodes) == 2})
    return out


def _allowed(c: dict, design: str, cfg: Config = DEFAULT) -> bool:
    if design == "record_only":
        return c["kind"] == "record"
    if design == "single_silence":
        return c["kind"] == "record" or (c["v"] == 0 and not c["dual"])
    if design == "no_dual":
        return not c.get("dual", False)
    if design == "max_light":
        return c["kind"] == "record" or c["ii"] == len(cfg.intensities) - 1
    if design == "min_light":
        return c["kind"] == "record" or c["ii"] == 0
    if design == "fixed_10":
        return c["kind"] == "record" or cfg.intensities[c["ii"]] == 10.0
    return True


PLAN_SESSIONS = 2   # a new animal is valued as if it will get this many sessions
PRESELECT = 6       # candidates scored by the (costlier) query-value lookahead


def _per_cost(c: dict, per_trial: float, cfg: Config) -> float:
    v = per_trial * c["trials"]
    if c["kind"] == "new":
        return v * PLAN_SESSIONS / (c["cost"] + (PLAN_SESSIONS - 1) * cfg.cost_session)
    return v / c["cost"]


def value(belief: Belief, c: dict, cfg: Config) -> float:
    """Stage 1: exact information gain of one trial about the structure, per unit cost."""
    e = belief.eig() if c["kind"] == "record" else belief.eig(c["targets"], c["ii"])
    return _per_cost(c, e, cfg)


@lru_cache(maxsize=None)
def _weighted_pool(cfg: Config):
    qs, wt = [], []
    for k, pool in query_pools().items():
        n = _n_per_pool(cfg)[k]
        if n:
            qs += pool
            wt += [n / cfg.n_queries / len(pool)] * len(pool)
    return qs, np.array(wt)


def expected_score(belief: Belief) -> float:
    """Expected log score (up to the prior's constant) of the exact predictive, averaged over the
    query distribution: sum_k w_k * -H(q_k)."""
    qs, wt = _weighted_pool(belief.cfg)
    q = np.clip(belief.predict(qs), 1e-12, 1 - 1e-12)
    return float(wt @ (q * np.log(q) + (1 - q) * np.log1p(-q)))


def query_value(belief: Belief, c: dict, cfg: Config, base: float | None = None) -> float:
    """Stage 2: exact expected gain in the query score from ONE more trial of candidate c
    (preposterior analysis over all 32 outcomes), per unit cost."""
    import copy
    base = expected_score(belief) if base is None else base
    targets = c.get("targets") or {}
    f, g = belief.regime_tables(targets, c.get("ii"))
    Abar = belief.pd_weights() @ belief._pop_joint_all(f)                  # (XP,)
    gbar = belief.lever_weights() @ g
    py = np.concatenate([Abar * (1 - gbar), Abar * gbar])                 # index: lever * XP + x
    tot = 0.0
    for idx in np.flatnonzero(py > 1e-4):
        y, x = divmod(int(idx), XP)
        row = [(x >> i) & 1 for i in range(NP)] + [y]
        b = copy.deepcopy(belief)
        if c["kind"] == "record":
            b.add([row])
        elif c["kind"] == "session":
            b.add([row], c["animal"], c["ii"])
        else:
            a = b.add_animal(c["v"], c["nodes"])
            b.add([row], a, c["ii"])
        tot += py[idx] * expected_score(b)
    tot /= py[py > 1e-4].sum()
    return _per_cost(c, tot - base, cfg)


def choose(lab: OptoLab, design: str, rng: np.random.Generator) -> dict | None:
    cands = [c for c in candidates(lab.belief, lab.remaining, len(lab.animals), lab.cfg)
             if _allowed(c, design, lab.cfg)]
    if not cands:
        return None
    if design == "random":
        return cands[int(rng.integers(len(cands)))]
    vals = np.array([value(lab.belief, c, lab.cfg) for c in cands])
    if PRESELECT <= 1 or len(cands) == 1:
        return cands[int(np.argmax(vals))]
    top = np.argsort(-vals, kind="stable")[:PRESELECT]
    base = expected_score(lab.belief)
    qv = [query_value(lab.belief, cands[i], lab.cfg, base) for i in top]
    return cands[int(top[int(np.argmax(qv))])]


def execute(lab: OptoLab, c: dict) -> None:
    I = lab.cfg.intensities
    if c["kind"] == "record":
        lab.step({"action": "record"})
    elif c["kind"] == "session":
        lab.step({"action": "light", "animal": c["animal"], "intensity": I[c["ii"]]})
    else:
        r = lab.step({"action": "express", "opsin": c["opsin"], "populations": [POPS[j] for j in c["nodes"]]})
        lab.step({"action": "light", "animal": r["result"]["animal"], "intensity": I[c["ii"]]})


def run_policy(design: str, seed: int, salt: str | None = None, cfg: Config = DEFAULT,
               submit: bool = True, belief_kw: dict | None = None) -> OptoLab:
    """Play one episode in-process; inference is exact unless belief_kw selects a shortcut."""
    lab = OptoLab(cfg, belief_kw)
    lab.reset(seed, salt)
    rng = np.random.default_rng([int(seed), 0x0F7])
    if design != "prior":
        while True:
            c = choose(lab, design, rng)
            if c is None:
                break
            execute(lab, c)
    lab.finish()
    if submit:
        lab.submit(lab.prior_q if design == "prior" else lab.belief.predict(lab.queries))
    return lab


def reference_trajectory(seed: int, salt: str | None = None, cfg: Config = DEFAULT) -> dict:
    lab = run_policy("reference", seed, salt, cfg)
    return {"history": lab.history, "result": lab.result}


def replay(lab: OptoLab, **belief_kw) -> Belief:
    """The same data under a shortcut inference rule."""
    b = Belief(lab.cfg, **belief_kw)
    for a in lab.animals:
        b.add_animal(OPSINS[a["opsin"]], a["populations"])
    for rec in lab.history:
        if rec["action"] == "record":
            b.add(rec["samples"])
        elif rec["action"] == "light":
            b.add(rec["samples"], rec["animal"], lab.cfg.intensities.index(rec["intensity"]))
    return b


def shortcut_predictions(lab: OptoLab) -> dict[str, np.ndarray]:
    qs = lab.queries
    return {
        "exact": lab.belief.predict(qs),
        "naive_perfect_clamp": replay(lab, perfect_clamp=True, model_heat=False).predict(qs),
        "ignore_efficacy": replay(lab, perfect_clamp=True).predict(qs),
        "ignore_heat": replay(lab, model_heat=False).predict(qs),
        "no_or_gate_prior": replay(lab, or_prob=0.0).predict(qs),
        "see_as_do": lab.belief.predict_see_as_do(qs),
    }


# Full shortcut strategies: a restricted design followed by the inference a shortcut-taker uses.
INFERENCE = {
    "see_as_do": lambda lab: lab.belief.predict_see_as_do(lab.queries),
    "naive": lambda lab: replay(lab, perfect_clamp=True, model_heat=False).predict(lab.queries),
    "ignore_heat": lambda lab: replay(lab, model_heat=False).predict(lab.queries),
    "no_or": lambda lab: replay(lab, or_prob=0.0).predict(lab.queries),
}
STRATEGIES = {"record_only": ("see_as_do",), "max_light": ("ignore_heat", "naive"),
              "min_light": ("naive",), "single_silence": ("naive", "no_or"), "random": ("naive",)}


def evaluate_seed(seed: int, salt: str | None = "calibration", cfg: Config = DEFAULT,
                  designs: tuple = DESIGNS[1:]) -> dict:
    out: dict = {"seed": int(seed)}
    t0 = time.perf_counter()
    ref = run_policy("reference", seed, salt, cfg, submit=False)
    out["reference_seconds"] = time.perf_counter() - t0
    preds = shortcut_predictions(ref)
    sc = ref.score(preds["exact"])
    out["reference"] = sc["reward_raw"]
    out["truth"] = sc["raw_knowing_truth"]
    out["prior"] = ref.score(ref.prior_q)["reward_raw"]
    for k, p in preds.items():
        if k != "exact":
            out[k] = ref.score(p)["reward_raw"]
    for d in designs:
        lab = run_policy(d, seed, salt, cfg, submit=False)
        out[d] = lab.score(lab.belief.predict(lab.queries))["reward_raw"]
        for inf in STRATEGIES.get(d, ()):
            out[f"{d}+{inf}"] = lab.score(INFERENCE[inf](lab))["reward_raw"]
    # diagnostics of the reference's run and of the hidden circuit
    out["ref_n_animals"] = float(len(ref.animals))
    out["ref_n_dual"] = float(sum(len(a["populations"]) == 2 for a in ref.animals))
    out["ref_n_records"] = float(sum(r["action"] == "record" for r in ref.history))
    ints = [r["intensity"] for r in ref.history if r["action"] == "light"]
    out["ref_mean_intensity"] = float(np.mean(ints)) if ints else 0.0
    out["or_gate"] = float(ref.gate)
    out["p_or_gate_post"] = ref.belief.summary()["p_or_gate"]
    return out


DIAG = {"seed", "reference_seconds", "ref_n_animals", "ref_n_dual", "ref_n_records",
        "ref_mean_intensity", "or_gate", "p_or_gate_post"}


def summarise(rows: list[dict], n_boot: int = 4000, seed: int = 0, subset=None) -> dict:
    """Mean raw / clipped reward per policy and paired bootstrap 95% CIs of reference - policy."""
    rows = [r for r in rows if subset is None or subset(r)]
    rng = np.random.default_rng(seed)
    names = [k for k in rows[0] if k not in DIAG]
    v = {k: np.array([r[k] for r in rows]) for k in names}
    idx = rng.integers(len(rows), size=(n_boot, len(rows)))
    clip = lambda a: np.clip(a, 0.0, 1.0)
    out = {}
    for k in names:
        d_raw, d_clip = v["reference"] - v[k], clip(v["reference"]) - clip(v[k])
        ci = lambda d: [float(x) for x in np.percentile(d[idx].mean(1), [2.5, 97.5])]
        out[k] = {"mean_raw": float(v[k].mean()), "mean_score": float(clip(v[k]).mean()),
                  "ref_minus_raw": float(d_raw.mean()), "ref_minus_raw_ci95": ci(d_raw),
                  "ref_minus_score": float(d_clip.mean()), "ref_minus_score_ci95": ci(d_clip),
                  "share_ref_better": float(np.mean(d_raw > 1e-12))}
    diag = {k: float(np.mean([r[k] for r in rows])) for k in DIAG - {"seed"}}
    return {"n": len(rows), "policies": out, "diagnostics": diag}


def table(summary: dict) -> str:
    lines = [f"{'policy':22s} {'raw':>7s} {'score':>6s}  ref-raw [95% CI]            ref-score [95% CI]"]
    for k, s in summary["policies"].items():
        a, b = s["ref_minus_raw_ci95"], s["ref_minus_score_ci95"]
        lines.append(f"{k:22s} {s['mean_raw']:7.3f} {s['mean_score']:6.3f}  "
                     f"{s['ref_minus_raw']:7.3f} [{a[0]:7.3f},{a[1]:7.3f}]   "
                     f"{s['ref_minus_score']:6.3f} [{b[0]:6.3f},{b[1]:6.3f}]")
    return "\n".join(lines)
