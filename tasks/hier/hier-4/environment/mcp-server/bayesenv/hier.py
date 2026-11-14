"""Hierarchical lab: experiments on a population of units, graded on known AND new units.
Generative model (everything here is disclosed to the agent by `rules()`):
    mu        ~ Uniform(MU_LO, MU_HI)                       population mean threshold
    log(tau)  ~ Uniform(log TAU_LO, log TAU_HI)             population sd of thresholds
    theta_i   ~ Normal(mu, tau^2),  i = 0..K-1              one threshold per unit
    y | unit i, design x  ~  Bernoulli( sigmoid( a_i * (x - theta_i) ) )
with known per-unit slopes a_i (how sharply unit i switches from 0 to 1 around its threshold).
An experiment picks BOTH a unit and a design x. After the budget, held-out queries ask for
P(y = 1) at (a) new designs on the K units and (b) designs on NEW units, whose thresholds are
fresh draws from Normal(mu, tau^2): those can only be predicted from what was learned about
(mu, tau).
Why this model: one scalar per unit and two hyperparameters keep the reference exact by
quadrature (no Monte Carlo), while the Bernoulli-logistic likelihood is not conjugate, so there
is no closed form to type in: the right answer needs p(mu, tau | all data) with every theta_i
integrated out (partial pooling), and new-unit predictions need the integral over (mu, tau),
not a point estimate of them.
Exact posterior. Units are independent given phi = (mu, tau), so
    p(phi | D) ∝ p(phi) * prod_i m_i(phi),    m_i(phi) = ∫ Normal(theta; mu, tau^2) L_i(theta) dtheta
with L_i the likelihood of unit i's own data. phi lives on a Gauss-Legendre tensor grid in
(mu, log tau) (the hyperprior is uniform there, so the nodes' weights ARE the prior), theta on
a uniform grid (trapezoid rule; spectrally accurate for these smooth integrands because the
grid step is half of TAU_LO). tests/test_hier.py checks it against an independent brute force.
Usage:
    lab = HierLab()
    lab.reset(seed=0, salt="secret")
    lab.step({"unit": 3, "design": 0.5})          # -> {"result": {..., "outcome": 0 or 1}, ...}
    queries = lab.finish()                         # reveals the held-out queries
    res = lab.submit([0.5] * len(queries))         # one probability per query, once
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
import numpy as np
from scipy.special import expit, xlogy
from . import hier_reward as R
from .chem_lab import salted_key

# ---- configuration (all public) -----------------------------------------------------------
@dataclass(frozen=True)
class Config:
    slopes: tuple = (0.5, 1.0, 2.0, 4.0) * 3   # a_i, one per unit (K = len = 12)
    new_slopes: tuple = (4.0,)   # a new unit's slope is one of these (given per query)
    budget: int = 12             # as many experiments as units: allocation is a real choice
    mu_lo: float = -3.0
    mu_hi: float = 3.0
    tau_lo: float = 0.2
    tau_hi: float = 2.0
    x_lo: float = -8.0
    x_hi: float = 8.0
    n_a: int = 16          # queries on the K known units
    n_b: int = 16          # queries on new units
    @property
    def k(self) -> int:
        return len(self.slopes)

DEFAULT = Config()

class Model:
    """Quadrature grids and everything that depends only on the configuration."""
    def __init__(self, cfg: Config = DEFAULT, n_mu: int = 48, n_tau: int = 32,
                 h: float | None = None, n_cand: int = 33, norm: tuple | None = None):
        self.cfg = cfg
        self.K = cfg.k
        self.slopes = np.array(cfg.slopes, float)
        self.new_slopes = np.array(cfg.new_slopes, float)
        zm, wm = np.polynomial.legendre.leggauss(n_mu)
        zt, wt = np.polynomial.legendre.leggauss(n_tau)
        mu = 0.5 * (cfg.mu_hi + cfg.mu_lo) + 0.5 * (cfg.mu_hi - cfg.mu_lo) * zm
        lt = 0.5 * (math.log(cfg.tau_hi) + math.log(cfg.tau_lo)) + 0.5 * math.log(
            cfg.tau_hi / cfg.tau_lo) * zt
        self.mu = np.repeat(mu, n_tau)                      # (P,)
        self.tau = np.tile(np.exp(lt), n_mu)                # (P,)
        self.w0 = np.outer(wm / 2, wt / 2).ravel()          # prior mass of each node, sums to 1
        h = h or cfg.tau_lo / 2
        lo, hi = cfg.mu_lo - 6 * cfg.tau_hi, cfg.mu_hi + 6 * cfg.tau_hi
        self.theta = np.linspace(lo, hi, int(round((hi - lo) / h)) + 1)     # (T,)
        self.h = float(self.theta[1] - self.theta[0])
        z = (self.theta[None, :] - self.mu[:, None]) / self.tau[:, None]
        # W[p, t] = Normal(theta_t; mu_p, tau_p^2) * h : integrates a function of theta
        self.W = np.exp(-0.5 * z * z) / (self.tau[:, None] * math.sqrt(2 * math.pi)) * self.h
        self.prior_theta = self.w0 @ self.W                 # prior marginal of one theta (mass)
        self.xc = np.linspace(cfg.x_lo, cfg.x_hi, n_cand)   # candidate designs / query stand-ins
        self.SK = [self.sig(a, self.xc) for a in self.slopes]             # (T, C) per unit
        self.GN = np.concatenate([self.W @ self.sig(a, self.xc) for a in self.new_slopes], 1)
        if norm is None and cfg == DEFAULT:
            norm = (R.NORM_A, R.NORM_B)
        self._norm = norm
    @property
    def norm(self) -> tuple:
        if self._norm is None:      # non-default configuration: estimate once and keep
            self._norm = estimate_norm(self, 100_000)
        return self._norm
    def sig(self, a: float, x) -> np.ndarray:
        """P(y=1 | theta_t, slope a, design x_j): (T, n)."""
        x = np.atleast_1d(np.asarray(x, float))
        return expit(a * (x[None, :] - self.theta[:, None]))
    def prior_predictive(self, a, x) -> np.ndarray:
        """P(y=1) before any data, for slope(s) a and design(s) x (same for known/new units)."""
        a, x = np.broadcast_arrays(np.asarray(a, float), np.asarray(x, float))
        return expit(a[:, None] * (x[:, None] - self.theta[None, :])) @ self.prior_theta
    def population_curve(self, mu: float, tau: float, a, x) -> np.ndarray:
        """P(y=1) for a new unit when (mu, tau) are known: ∫ Normal(theta; mu, tau^2) sigmoid."""
        a, x = np.broadcast_arrays(np.asarray(a, float), np.asarray(x, float))
        d = np.exp(-0.5 * ((self.theta - mu) / tau) ** 2) / (tau * math.sqrt(2 * math.pi)) * self.h
        return expit(a[:, None] * (x[:, None] - self.theta[None, :])) @ d

_MODELS: dict = {}

def get_model(cfg: Config = DEFAULT) -> Model:
    if cfg not in _MODELS:
        _MODELS[cfg] = Model(cfg)
    return _MODELS[cfg]

def estimate_norm(model: Model, n: int = 400_000, seed: int = 0) -> tuple[float, float]:
    """(Z_a, Z_b): prior average of [score knowing the hidden parameters - score of the prior
    predictive], per query, for known-unit and new-unit queries. Monte Carlo over the prior."""
    cfg, rng = model.cfg, np.random.default_rng([seed, 0x2E])
    za = zb = 0.0
    done = 0
    while done < n:
        m = min(20_000, n - done)
        mu = rng.uniform(cfg.mu_lo, cfg.mu_hi, m)
        tau = np.exp(rng.uniform(math.log(cfg.tau_lo), math.log(cfg.tau_hi), m))
        x = np.round(rng.uniform(cfg.x_lo, cfg.x_hi, m), 3)
        # (a) a known unit: its own theta is the truth
        a = rng.choice(model.slopes, m)
        p = expit(a * (x - rng.normal(mu, tau)))
        q0 = model.prior_predictive(a, x)
        za += float((R.expected_logscore(p, p) - R.expected_logscore(p, q0)).sum())
        # (b) a new unit: the truth is the population curve at the true (mu, tau)
        a = rng.choice(model.new_slopes, m)
        z = (model.theta[None, :] - mu[:, None]) / tau[:, None]
        d = np.exp(-0.5 * z * z) / (tau[:, None] * math.sqrt(2 * math.pi)) * model.h
        p = (d * expit(a[:, None] * (x[:, None] - model.theta[None, :]))).sum(1)
        q0 = model.prior_predictive(a, x)
        zb += float((R.expected_logscore(p, p) - R.expected_logscore(p, q0)).sum())
        done += m
    return za / n, zb / n

# ---- exact hierarchical posterior ---------------------------------------------------------
def _binary_mi(p1: np.ndarray, q1: np.ndarray, p11: np.ndarray) -> np.ndarray:
    """Mutual information (nats) of two binary variables: p1 (C,1), q1 (1,Q), joint p11 (C,Q)."""
    out = np.zeros_like(p11)
    for pj, pa, pb in ((p11, p1, q1), (p1 - p11, p1, 1 - q1), (q1 - p11, 1 - p1, q1),
                       (1 - p1 - q1 + p11, 1 - p1, 1 - q1)):
        pj = np.maximum(pj, 0.0)
        out += xlogy(pj, pj) - xlogy(pj, np.maximum(pa * pb, 1e-300))
    return np.maximum(out, 0.0)

class Belief:
    """Exact posterior of the hierarchical model given (unit, design, outcome) triples."""
    def __init__(self, model: Model):
        self.m = model
        T, P = len(model.theta), len(model.w0)
        self.logL = np.zeros((model.K, T))                    # log L_i(theta_t)
        self.M = np.tile(model.W.sum(1), (model.K, 1))        # m_i(phi_p)
        self._G: dict[int, np.ndarray] = {}
        self.n = np.zeros(model.K, int)
    def update(self, unit: int, x: float, y: int) -> None:
        z = self.m.slopes[unit] * (x - self.m.theta)
        self.logL[unit] += -np.logaddexp(0.0, -z) if y else -np.logaddexp(0.0, z)
        # floor: a node whose marginal likelihood underflows has posterior mass 0 anyway
        self.M[unit] = np.maximum(self.m.W @ np.exp(self.logL[unit]), 1e-290)
        self._G.pop(unit, None)
        self.n[unit] += 1
    def hyper(self) -> np.ndarray:
        """Posterior mass on each (mu, tau) node."""
        lw = np.log(self.m.w0) + np.log(self.M).sum(0)
        w = np.exp(lw - lw.max())
        return w / w.sum()
    def theta_marginal(self, unit: int, w: np.ndarray | None = None) -> np.ndarray:
        """p(theta_unit | all data) as masses on the theta grid."""
        w = self.hyper() if w is None else w
        return np.exp(self.logL[unit]) * ((w / self.M[unit]) @ self.m.W)
    def predict(self, units, slopes, xs) -> np.ndarray:
        """Posterior predictive P(y=1) per query. units[j] = unit index, or -1 for a new unit
        (then slopes[j] is its slope)."""
        w = self.hyper()
        pop = w @ self.m.W
        out = np.empty(len(xs))
        cache: dict[int, np.ndarray] = {}
        for j, (u, a, x) in enumerate(zip(units, slopes, xs)):
            if u < 0:
                d, a = pop, a
            else:
                if u not in cache:
                    cache[u] = self.theta_marginal(u, w)
                d, a = cache[u], self.m.slopes[u]
            out[j] = expit(a * (x - self.m.theta)) @ d
        return out
    def _g(self, u: int) -> np.ndarray:
        """G_u[p, c] = P(y=1 | unit u, design xc_c, phi_p, unit u's data)."""
        if u not in self._G:
            L = np.exp(self.logL[u])
            self._G[u] = np.clip((self.m.W @ (L[:, None] * self.m.SK[u])) / self.M[u][:, None],
                                 0.0, 1.0)
        return self._G[u]
    def utility(self) -> np.ndarray:
        """Expected one-step gain in the SCORED quantity for every (unit, candidate design).
        For an experiment outcome y and a future query outcome y_q, the expected improvement
        of the posterior predictive's log score on that query is the mutual information
        I(y; y_q). The queries are not known yet, but their distribution is public, so the
        utility is that information averaged over it: n_a queries on a uniformly chosen known
        unit and n_b on new units, designs uniform. Returns (K, C), nats per episode's queries.
        """
        m, cfg = self.m, self.m.cfg
        K, C = m.K, len(m.xc)
        w = self.hyper()
        A = np.concatenate([self._g(u) for u in range(K)], 1)          # (P, K*C)
        wA = w[:, None] * A
        p1 = wA.sum(0)                                                 # (K*C,)
        P11 = A.T @ wA                                                 # other-unit queries
        for u in range(K):                                             # same-unit queries
            d = self.theta_marginal(u, w)
            sl = slice(u * C, (u + 1) * C)
            P11[sl, sl] = (m.SK[u] * d[:, None]).T @ m.SK[u]
        mi_known = _binary_mi(p1[:, None], p1[None, :], P11).sum(1) / (K * C)
        q1 = w @ m.GN
        mi_new = _binary_mi(p1[:, None], q1[None, :], wA.T @ m.GN).sum(1) / m.GN.shape[1]
        return (cfg.n_a * mi_known + cfg.n_b * mi_new).reshape(K, C)
    # -- shortcut inferences on the SAME data (what a hurried analyst might do) --------------
    def predict_no_pooling(self, units, slopes, xs) -> np.ndarray:
        """Each unit on its own data, prior = the hyperprior's marginal for one theta; new
        units from the prior predictive."""
        m, out = self.m, np.empty(len(xs))
        for j, (u, a, x) in enumerate(zip(units, slopes, xs)):
            if u < 0:
                d = m.prior_theta
            else:
                d, a = m.prior_theta * np.exp(self.logL[u]), m.slopes[u]
                d = d / d.sum()
            out[j] = expit(a * (x - m.theta)) @ d
        return out
    def predict_complete_pooling(self, units, slopes, xs) -> np.ndarray:
        """All units share ONE theta (prior = the same marginal); new units get it too."""
        m = self.m
        d = m.prior_theta * np.exp(self.logL.sum(0) - self.logL.sum(0).max())
        d = d / d.sum()
        a = np.where(np.asarray(units) < 0, slopes, m.slopes[np.maximum(units, 0)])
        return expit(a[:, None] * (np.asarray(xs, float)[:, None] - m.theta[None, :])) @ d
    def plugin_node(self) -> int:
        """Empirical Bayes: the (mu, tau) node maximising the marginal likelihood (equivalently
        the posterior mode in (mu, log tau), where the hyperprior is flat)."""
        return int(np.argmax(np.log(self.M).sum(0)))
    def predict_plugin(self, units, slopes, xs) -> np.ndarray:
        """Point-estimate (mu, tau), then predict as if they were known."""
        m, p = self.m, self.plugin_node()
        out = np.empty(len(xs))
        for j, (u, a, x) in enumerate(zip(units, slopes, xs)):
            d = m.W[p]
            if u >= 0:
                d, a = d * np.exp(self.logL[u]), m.slopes[u]
            out[j] = expit(a * (x - m.theta)) @ (d / d.sum())
        return out
    # -- design rules of the shortcut models -------------------------------------------------
    def eig_no_pooling(self) -> np.ndarray:
        """I(y; theta_u) under independent units: (K, C)."""
        m = self.m
        out = np.empty((m.K, len(m.xc)))
        for u in range(m.K):
            d = m.prior_theta * np.exp(self.logL[u])
            out[u] = _theta_eig(d / d.sum(), m.SK[u])
        return out
    def eig_complete_pooling(self) -> np.ndarray:
        m = self.m
        d = m.prior_theta * np.exp(self.logL.sum(0) - self.logL.sum(0).max())
        d = d / d.sum()
        return np.stack([_theta_eig(d, m.SK[u]) for u in range(m.K)])

def _h2(p: np.ndarray) -> np.ndarray:
    return -(xlogy(p, p) + xlogy(1 - p, 1 - p))

def _theta_eig(d: np.ndarray, S: np.ndarray) -> np.ndarray:
    return _h2(d @ S) - d @ _h2(S)

# ---- rules (what the agent is told) --------------------------------------------------------
def rules(cfg: Config = DEFAULT) -> dict:
    return {
        "description": (
            f"There are K = {cfg.k} units (think: patients with individual tolerance thresholds), "
            "numbered 0..K-1. Unit i has a hidden threshold theta_i. Each experiment chooses a "
            "unit AND a design x (a dose) and returns a binary outcome y. The thresholds come "
            "from a population whose mean and spread are also hidden. After the experiments you "
            "must give P(y = 1) for held-out queries of two kinds: (a) new designs on the K "
            "units, and (b) designs on NEW units that you could never test, whose thresholds are "
            "fresh draws from the same population. Nothing about the model is hidden except "
            "the drawn values of mu, tau and the thresholds."),
        "model": [
            f"mu ~ Uniform({cfg.mu_lo}, {cfg.mu_hi})",
            f"log(tau) ~ Uniform(log {cfg.tau_lo}, log {cfg.tau_hi})   "
            f"(natural log; density of tau proportional to 1/tau on [{cfg.tau_lo}, {cfg.tau_hi}])",
            "theta_i ~ Normal(mean = mu, sd = tau), independently for every unit, known or new",
            "y | unit i, design x ~ Bernoulli(p),  p = 1 / (1 + exp(-a_i * (x - theta_i)))",
            "a_i is the unit's known slope (see 'slopes'); outcomes are independent given theta_i",
        ],
        "slopes": {str(i): a for i, a in enumerate(cfg.slopes)},
        "new_unit_slopes": list(cfg.new_slopes),
        "design_bounds": [cfg.x_lo, cfg.x_hi],
        "budget": cfg.budget,
        "experiments": (
            "run_experiment(unit, design): unit an integer 0..K-1, design a number within "
            "design_bounds. Repeating a unit or a design is allowed. Invalid requests are "
            "rejected and do not use up budget."),
        "queries": (
            f"finish_experiments reveals {cfg.n_a + cfg.n_b} queries and ends the experiment "
            f"phase. {cfg.n_a} are of kind 'known_unit': the unit is uniform at random over the "
            f"K units, the design uniform over design_bounds. {cfg.n_b} are of kind 'new_unit': "
            "each refers to a different new unit with theta ~ Normal(mu, tau) for the same "
            "hidden (mu, tau), its slope uniform over new_unit_slopes and given in the query, "
            "the design uniform over design_bounds. Designs are rounded to 3 decimals."),
        "submission": (
            "submit_predictions(predictions): a list with one probability P(y = 1) per query, "
            "in the order of the queries. Only one submission is accepted."),
        "scoring": (
            "Per query, with q your probability clamped to [0.001, 0.999] and p* the true "
            "probability: s = p* log q + (1 - p*) log(1 - q) (the expected log score; no outcome "
            "is sampled). For a known_unit query p* = sigmoid(a_i (x - theta_i)) with the true "
            "theta_i. For a new_unit query p* = integral of Normal(theta; mu, tau) * "
            "sigmoid(a (x - theta)) d theta with the true (mu, tau): the true population "
            "response. reward = (mean s of your predictions - mean s of the prior predictive) / "
            "Z, clipped to [0, 1]. The prior predictive is P(y = 1) under the model above with "
            "no data, so submitting it scores exactly 0. Z is a fixed constant of this task: the "
            "prior-average gain of someone who knows mu, tau and every theta_i "
            f"(Z_known = {R.NORM_A if cfg == DEFAULT else 'see task'}, Z_new = "
            f"{R.NORM_B if cfg == DEFAULT else 'see task'} nats per query, combined in "
            "proportion to the number of queries of each kind). The log score is proper: for "
            "your data, the best possible submission is the exact posterior predictive of the "
            "model above."),
    }

def validate(action, cfg: Config = DEFAULT) -> tuple[int, float]:
    """{"unit": int, "design": number} -> (unit, design). ValueError on anything else."""
    if not isinstance(action, dict) or set(action) != {"unit", "design"}:
        raise ValueError('action must be {"unit": <int>, "design": <number>}')
    u, x = action["unit"], action["design"]
    if isinstance(u, bool) or isinstance(x, bool):
        raise ValueError("unit must be an integer and design a number")
    try:
        uf, x = float(u), float(x)
    except (TypeError, ValueError):
        raise ValueError("unit must be an integer and design a number") from None
    if not math.isfinite(uf) or uf != int(uf) or not 0 <= int(uf) < cfg.k:
        raise ValueError(f"unit must be an integer in 0..{cfg.k - 1}")
    if not math.isfinite(x) or not cfg.x_lo <= x <= cfg.x_hi:
        raise ValueError(f"design must be a finite number in [{cfg.x_lo}, {cfg.x_hi}]")
    return int(uf), x

# ---- environment --------------------------------------------------------------------------
class HierLab:
    """One episode: reset -> step* -> finish -> submit. Observations are JSON-able.
    For analysis only (never sent to the agent): .hidden, .history, .belief (the exact
    posterior given the agent's own data), .score_only(q).
    """
    TAG_HYPER, TAG_THETA, TAG_QUERY, TAG_NOISE = 0x41E1, 0x41E2, 0x41E3, 0x41E4
    def __init__(self, model: Model | None = None):
        self.m = model or get_model()
        self.cfg = self.m.cfg
        self.budget = self.cfg.budget
        self._theta = None
    def reset(self, seed: int, salt: str | None = None) -> dict:
        cfg, m = self.cfg, self.m
        self.seed, self.salt = int(seed), salt
        key = lambda tag: np.random.default_rng(salted_key(seed, salt, tag))
        r = key(self.TAG_HYPER)
        self._mu = float(r.uniform(cfg.mu_lo, cfg.mu_hi))
        self._tau = float(math.exp(r.uniform(math.log(cfg.tau_lo), math.log(cfg.tau_hi))))
        self._theta = self._mu + self._tau * key(self.TAG_THETA).standard_normal(m.K)
        r = key(self.TAG_QUERY)
        qu = np.concatenate([r.integers(0, m.K, cfg.n_a), np.full(cfg.n_b, -1)])
        qa = np.concatenate([m.slopes[qu[:cfg.n_a]], r.choice(m.new_slopes, cfg.n_b)])
        qx = np.round(r.uniform(cfg.x_lo, cfg.x_hi, cfg.n_a + cfg.n_b), 3)
        self._q = (qu, qa, qx)
        self._is_new = qu < 0
        self._p_true = np.where(
            self._is_new, m.population_curve(self._mu, self._tau, qa, qx),
            expit(qa * (qx - self._theta[np.maximum(qu, 0)])))
        self._p_prior = m.prior_predictive(qa, qx)
        # common random numbers: the i-th experiment uses uniform U_i whatever is asked
        self._u = key(self.TAG_NOISE).random(self.budget)
        self.belief = Belief(m)
        self.history: list[dict] = []
        self.finished = False
        self.result: dict | None = None
        return {**rules(cfg), "experiments_remaining": self.budget}
    @property
    def remaining(self) -> int:
        return self.budget - len(self.history)
    @property
    def hidden(self) -> dict:
        return {"mu": self._mu, "tau": self._tau, "theta": self._theta.tolist()}
    def step(self, action) -> dict:
        if self._theta is None:
            raise RuntimeError("call reset first")
        if self.finished or self.result is not None:
            raise RuntimeError("the experiment phase is over")
        if self.remaining <= 0:
            raise RuntimeError("experiment budget exhausted")
        u, x = validate(action, self.cfg)
        i = len(self.history)
        p = float(expit(self.m.slopes[u] * (x - self._theta[u])))
        y = int(self._u[i] < p)
        self.belief.update(u, x, y)
        rec = {"index": i, "unit": u, "design": x, "outcome": y}
        self.history.append(rec)
        return {"result": rec, "experiments_remaining": self.remaining}
    def finish(self) -> list[dict]:
        """End the experiment phase and reveal the queries."""
        if self._theta is None:
            raise RuntimeError("call reset first")
        self.finished = True
        return self.queries()
    def queries(self) -> list[dict]:
        qu, qa, qx = self._q
        return [{"id": j, "kind": "new_unit" if u < 0 else "known_unit",
                 "unit": None if u < 0 else int(u), "slope": float(a), "design": float(x)}
                for j, (u, a, x) in enumerate(zip(qu, qa, qx))]
    def query_arrays(self) -> tuple:
        return self._q
    def score_only(self, q) -> dict:
        """Score a prediction vector without ending the episode (analysis only)."""
        return R.score(self._p_true, self._p_prior, self._is_new, q, *self.m.norm)
    def exact_predictive(self) -> np.ndarray:
        return np.clip(self.belief.predict(*self._q), 0.0, 1.0)
    def submit(self, predictions, with_reference: bool = False) -> dict:
        if self._theta is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("already submitted")
        q = R.parse_predictions(predictions, len(self._p_true))
        self.finished = True
        out = self.score_only(q)
        # decomposition: what the agent's own data supported vs what it made of them
        exact = self.score_only(self.exact_predictive())
        out["design_raw"] = exact["raw"]                 # exact posterior on the agent's data
        out["inference_raw"] = out["raw"] - exact["raw"]
        out["n_experiments"] = len(self.history)
        out["units_tested"] = int((self.belief.n > 0).sum())
        if with_reference:
            ref = run_policy("reference", self.seed, self.salt, self.m).result
            out["reference_raw"] = ref["raw"]
            out["reference_raw_a"], out["reference_raw_b"] = ref["raw_a"], ref["raw_b"]
            out["gap_to_reference"] = out["raw"] - ref["raw"]
        self.result = out
        return out

# ---- policies -----------------------------------------------------------------------------
DESIGN_POLICIES = ("reference", "random", "random_unit_eig_design", "round_robin_eig_design",
                   "eig_unit_random_design", "no_pooling", "complete_pooling", "prior")

def reference_action(belief: Belief, unit: int | None = None) -> dict:
    """Greedy maximiser of Belief.utility(); optionally restricted to one unit."""
    U = belief.utility()
    if unit is None:
        unit, c = np.unravel_index(int(np.argmax(U)), U.shape)
    else:
        c = int(np.argmax(U[unit]))
    return {"unit": int(unit), "design": float(belief.m.xc[c])}

def run_policy(policy: str, seed: int, salt: str | None = None, model: Model | None = None,
               submit: str | None = None) -> HierLab:
    """Play one episode in-process and return the finished lab (.history, .result).
    Experiment rules:
      reference                 greedy expected gain in the scored predictions, over (unit, design)
      random                    uniform random unit and design
      random_unit_eig_design    uniform random unit, reference's best design for that unit
      round_robin_eig_design    units in turn, reference's best design for that unit
      eig_unit_random_design    reference's best unit, uniform random design
      no_pooling                argmax I(y; theta_u) treating units as independent
      complete_pooling          units in turn, argmax I(y; theta) treating all units as one
      prior                     no experiments
    Inference (`submit`): "exact" (default), "no_pooling", "complete_pooling", "plugin",
    "prior". The policies no_pooling / complete_pooling / prior default to their own inference.
    """
    lab = HierLab(model)
    lab.reset(seed, salt)
    m, cfg, b = lab.m, lab.cfg, lab.belief
    rng = np.random.default_rng([int(seed), 0xAA])
    if policy not in DESIGN_POLICIES:
        raise KeyError(policy)
    while policy != "prior" and lab.remaining:
        i = len(lab.history)
        if policy == "reference":
            act = reference_action(b)
        elif policy == "random":
            act = {"unit": int(rng.integers(m.K)), "design": float(rng.uniform(cfg.x_lo, cfg.x_hi))}
        elif policy == "random_unit_eig_design":
            act = reference_action(b, int(rng.integers(m.K)))
        elif policy == "round_robin_eig_design":
            act = reference_action(b, i % m.K)
        elif policy == "eig_unit_random_design":
            act = {"unit": int(np.argmax(b.utility().max(1))),
                   "design": float(rng.uniform(cfg.x_lo, cfg.x_hi))}
        elif policy == "no_pooling":
            E = b.eig_no_pooling()
            u, c = np.unravel_index(int(np.argmax(E)), E.shape)
            act = {"unit": int(u), "design": float(m.xc[c])}
        else:  # complete_pooling
            u = i % m.K
            act = {"unit": u, "design": float(m.xc[int(np.argmax(b.eig_complete_pooling()[u]))])}
        lab.step(act)
    lab.finish()
    submit = submit or (policy if policy in ("no_pooling", "complete_pooling", "prior") else "exact")
    lab.submit(predict(lab, submit))
    return lab

def predict(lab: HierLab, how: str = "exact") -> np.ndarray:
    q = lab.query_arrays()
    b = lab.belief
    if how == "prior":
        return lab.m.prior_predictive(q[1], q[2])
    f = {"exact": b.predict, "no_pooling": b.predict_no_pooling,
         "complete_pooling": b.predict_complete_pooling, "plugin": b.predict_plugin}[how]
    return np.clip(f(*q), 0.0, 1.0)      # quadrature masses sum to 1 only up to rounding

FIELDS = ("raw", "raw_a", "raw_b", "reward")

def evaluate_seed(seed: int, salt: str | None = "calibration", model: Model | None = None,
                  policies: tuple = DESIGN_POLICIES) -> dict:
    """All calibration rows for one seed: {row name: [raw, raw_a, raw_b, clipped reward]}.
    `<p>` = design policy p with its default inference; `reference+<inference>` = the
    reference's experiments (identical data on this seed) with a shortcut inference, which
    isolates the inference error from the choice of experiments."""
    out, extra = {}, {}
    for p in policies:
        lab = run_policy(p, seed, salt, model)
        out[p] = [lab.result[f] for f in FIELDS]
        if p == "reference":
            for how in ("plugin", "no_pooling", "complete_pooling"):
                s = lab.score_only(predict(lab, how))
                out[f"reference+{how}"] = [s[f] for f in FIELDS]
            pn = lab.belief.plugin_node()
            extra = {"mu": lab._mu, "tau": lab._tau, "plugin_tau": float(lab.m.tau[pn]),
                     "alloc": lab.belief.n.tolist()}
    out["_info"] = extra
    return out

def reference_trajectory(seed: int, salt: str | None = None, model: Model | None = None) -> dict:
    lab = run_policy("reference", seed, salt, model)
    return {"history": lab.history, "queries": lab.queries(), "result": lab.result}
