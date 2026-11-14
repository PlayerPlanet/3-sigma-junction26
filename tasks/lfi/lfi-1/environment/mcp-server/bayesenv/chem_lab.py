"""Held-out C: Virtual Chemistry Lab. Diagnose a faulty reactor by running experiments.

A reaction A -> B runs with a co-reagent at concentration c (pseudo-first order in A):

    k(T, c)   = A0 * exp(-Ea / (R * T)) * c                     [1/min]
    yield     = 1 - exp(-k * t)                                 (fraction of A converted)
    measured  = yield + Normal(0, SIGMA^2)                      (noisy assay, NOT clipped)

Exactly one hypothesis h from a small discrete set (HYPOTHESES) is true. A fault changes what
the reactor actually does relative to the set conditions (T, t, c) of experiment number i
(0-based, in the order the experiments are run):

    T_act = T + dT_h               (thermocouple offset)
    c_act = max(s_h * c - delta_h, 0)   (stock dilution s_h, impurity that consumes delta_h M)
    k_act = A0 * exp(-Ea / (R T_act)) * c_act * d_h ** i   (catalyst losing activity per run)

Every fault acts through the rate constant, so at a single condition any of them looks like
"the reaction is a bit slow/fast" (confounded), but they differ in HOW the slowdown depends on
temperature (offset: ~exp(Ea dT / R T^2), larger at low T), concentration (impurity: large at
low c, negligible at high c; dilution: constant), and run index (catalyst). Conditions where
the yield saturates near 0 or 1 carry almost no information. All constants are public.

Because the hypothesis set is finite and the likelihood Gaussian, the posterior is exact by
enumeration, and so is the expected information gain (Gauss-Hermite quadrature over the noise).

Usage (see docs/CHEM_LAB.md):

    lab = ChemLab()
    obs = lab.reset(seed=0, salt="secret")
    obs = lab.step({"temperature": 330, "time": 30, "concentration": 0.2})
    res = lab.submit(obs["posterior"])        # here: the exact posterior
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

import numpy as np
from scipy.special import logsumexp

# ---- public constants -------------------------------------------------------------------

R = 8.314            # J / (mol K)
EA = 50_000.0        # J / mol
A0 = 5.0e6           # 1 / (M min)
SIGMA = 0.06         # assay noise sd (yield fraction)
BUDGET = 10
BOUNDS = {"temperature": (300.0, 380.0), "time": (1.0, 120.0), "concentration": (0.05, 1.0)}
UNITS = {"temperature": "K", "time": "min", "concentration": "M"}
KEYS = ("temperature", "time", "concentration")


@dataclass(frozen=True)
class Hypothesis:
    name: str
    description: str
    prior: float
    dT: float = 0.0       # K added to the set temperature
    scale: float = 1.0    # multiplies the set concentration
    delta: float = 0.0    # M subtracted after scaling
    decay: float = 1.0    # rate multiplied by decay**i on experiment i (0-based)


HYPOTHESES: tuple[Hypothesis, ...] = (
    Hypothesis("nominal", "No fault: the reactor does exactly what is set.", 0.25),
    Hypothesis("catalyst_mild", "Catalyst slowly deactivates: rate x 0.95**i on experiment i "
               "(i = 0 for the first experiment).", 0.125, decay=0.95),
    Hypothesis("catalyst_severe", "Catalyst quickly deactivates: rate x 0.85**i on experiment "
               "i (i = 0 for the first experiment).", 0.125, decay=0.85),
    Hypothesis("temp_high", "Thermocouple reads low: actual temperature = set + 3 K.", 0.125,
               dT=3.0),
    Hypothesis("temp_low", "Thermocouple reads high: actual temperature = set - 3 K.", 0.125,
               dT=-3.0),
    Hypothesis("stock_dilute", "Reagent stock mis-made: actual concentration = 0.88 x set.",
               0.125, scale=0.88),
    Hypothesis("impurity", "An impurity consumes 0.03 M of reagent: actual concentration = "
               "max(set - 0.03, 0).", 0.125, delta=0.03),
)
NAMES = tuple(h.name for h in HYPOTHESES)
PRIOR = np.array([h.prior for h in HYPOTHESES])
K = len(HYPOTHESES)
_DT = np.array([h.dT for h in HYPOTHESES])
_SCALE = np.array([h.scale for h in HYPOTHESES])
_DELTA = np.array([h.delta for h in HYPOTHESES])
_DECAY = np.array([h.decay for h in HYPOTHESES])

# Gauss-Hermite (probabilists') nodes for E_{z ~ N(0,1)} f(z)
_GH_Z, _GH_W = np.polynomial.hermite_e.hermegauss(12)
_GH_W = _GH_W / _GH_W.sum()


# ---- model ------------------------------------------------------------------------------

def mean_yield(x: np.ndarray, index: np.ndarray | int) -> np.ndarray:
    """Noise-free yield under every hypothesis. x: (m, 3) [T, t, c]; index: run number(s).

    Returns (K, m)."""
    x = np.atleast_2d(np.asarray(x, float))
    idx = np.broadcast_to(np.asarray(index, float), (len(x),))
    T = x[None, :, 0] + _DT[:, None]
    c = np.maximum(_SCALE[:, None] * x[None, :, 2] - _DELTA[:, None], 0.0)
    k = A0 * np.exp(-EA / (R * T)) * c * _DECAY[:, None] ** idx[None, :]
    return -np.expm1(-k * x[None, :, 1])


def loglik(y: np.ndarray, x: np.ndarray, index: np.ndarray) -> np.ndarray:
    """log p(y_j | x_j, run index_j, h) for each hypothesis: (K, m)."""
    r = (np.asarray(y, float)[None, :] - mean_yield(x, index)) / SIGMA
    return -0.5 * r**2 - math.log(SIGMA) - 0.5 * math.log(2 * math.pi)


def posterior(xs, ys, prior: np.ndarray = PRIOR) -> np.ndarray:
    """Exact posterior over HYPOTHESES given experiments xs (in run order) and yields ys."""
    xs = np.asarray(xs, float).reshape(-1, 3)
    lp = np.log(prior).copy()
    if len(xs):
        lp = lp + loglik(ys, xs, np.arange(len(xs))).sum(1)
    return np.exp(lp - logsumexp(lp))


def posterior_path(xs, ys) -> list[np.ndarray]:
    """[p0, p(.|first exp), ..., p(.|all exps)]: the exact posterior after each experiment."""
    return [posterior(xs[:n], ys[:n]) for n in range(len(ys) + 1)]


def eig(p: np.ndarray, xc: np.ndarray, index: int) -> np.ndarray:
    """Expected information gain about h (nats) of each candidate in xc, run as experiment
    number `index`, under current belief p. Exact up to 12-point Gauss-Hermite quadrature."""
    mu = mean_yield(xc, index)                                          # (K, C)
    y = mu[:, :, None] + SIGMA * _GH_Z[None, None, :]                   # (K, C, Q)
    # log N(y | mu_h') up to a constant shared by all terms: (K', K, C, Q)
    ll = -0.5 * ((y[None] - mu[:, None, :, None]) / SIGMA) ** 2
    with np.errstate(divide="ignore"):
        logp = np.log(p)
    log_marg = logsumexp(ll + logp[:, None, None, None], axis=0)        # (K, C, Q)
    own = -0.5 * _GH_Z**2                                               # log N(y|mu_h), same const
    mi = ((own[None, None, :] - log_marg) * _GH_W).sum(-1)              # (K, C)
    return p @ mi


def candidate_grid() -> np.ndarray:
    T = np.linspace(*BOUNDS["temperature"], 6)
    t = np.geomspace(*BOUNDS["time"], 7)
    c = np.geomspace(*BOUNDS["concentration"], 6)
    return np.stack(np.meshgrid(T, t, c, indexing="ij"), -1).reshape(-1, 3)


GRID = candidate_grid()


def validate(action) -> np.ndarray:
    """Action -> np.array([T, t, c]). Accepts {"temperature", "time", "concentration"} or a
    3-list in that order. Raises ValueError on anything else, NaN/inf, or out of bounds."""
    if isinstance(action, dict):
        if set(action) != set(KEYS):
            raise ValueError(f"action must have exactly the keys {list(KEYS)}")
        vals = [action[k] for k in KEYS]
    elif isinstance(action, (list, tuple, np.ndarray)) and len(action) == 3:
        vals = list(action)
    else:
        raise ValueError(f"action must be a dict with keys {list(KEYS)} or a list of 3 numbers")
    out = []
    for k, v in zip(KEYS, vals):
        if isinstance(v, bool):
            raise ValueError(f"{k} must be a number")
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise ValueError(f"{k} must be a number") from None
        lo, hi = BOUNDS[k]
        if not math.isfinite(v) or not lo <= v <= hi:
            raise ValueError(f"{k} must be a finite number in [{lo}, {hi}] {UNITS[k]}")
        out.append(v)
    return np.array(out)


def salted_key(seed: int, salt: str | None, tag: int) -> list[int]:
    """Same scheme as bayesenv.task.Task._key: without the salt, streams are not recomputable."""
    if salt is None:
        return [int(seed), tag]
    h = hashlib.sha256(f"{salt}:{seed}".encode()).digest()
    return [int(seed), tag] + [int.from_bytes(h[i:i + 4], "little") for i in range(0, 32, 4)]


def rules() -> dict:
    return {
        "description": (
            "You operate a reactor running A -> B. Exactly one of the listed hypotheses about the "
            "reactor is true (fault or no fault). Each experiment: choose temperature (K), "
            "reaction time (min) and co-reagent concentration (M); you get a noisy measured "
            "yield. Experiments are numbered i = 0, 1, ... in the order you run them. After at "
            "most the budget, submit a probability for each hypothesis."),
        "model": (
            "k = A0 * exp(-Ea / (R * T_act)) * c_act * decay**i;  yield = 1 - exp(-k * t);  "
            "measured = yield + Normal(0, sigma^2) (not clipped). T_act = T + dT, "
            "c_act = max(scale * c - delta, 0); (dT, scale, delta, decay) depend on the hypothesis "
            "and are (0, 1, 0, 1) for nominal."),
        "constants": {"A0": A0, "Ea": EA, "R": R, "sigma": SIGMA},
        "bounds": {k: list(v) for k, v in BOUNDS.items()},
        "units": dict(UNITS),
        "budget": BUDGET,
        "hypotheses": [
            {"name": h.name, "description": h.description, "prior": h.prior, "dT": h.dT,
             "scale": h.scale, "delta": h.delta, "decay": h.decay} for h in HYPOTHESES],
        "scoring": ("reward = log q(true) - log prior(true), where q = 0.999 * your submitted "
                    "distribution + 0.001 * prior. Submitting the prior scores 0."),
    }


# ---- environment ------------------------------------------------------------------------

class ChemLab:
    """One episode at a time. reset -> step* -> submit. JSON-able observations.

    Exposed for demos/analysis (NOT given to the agent through the MCP server):
      .history            list of {"index", "temperature", "time", "concentration", "yield"}
      .posteriors         exact posterior after 0, 1, ..., n experiments (list of arrays)
      .hidden             name of the true hypothesis
      reference_trajectory(seed, salt)   the Bayes reference on the same seed/salt
    """

    TAG_HYP, TAG_NOISE = 0xC4E1, 0xC4E2

    def __init__(self, budget: int = BUDGET):
        self.budget = budget
        self._h: int | None = None

    def reset(self, seed: int, salt: str | None = None) -> dict:
        self.seed, self.salt = int(seed), salt
        self._h = int(np.random.default_rng(salted_key(seed, salt, self.TAG_HYP)).choice(K, p=PRIOR))
        # common random numbers: the i-th experiment gets noise z_i whatever its conditions
        self._z = np.random.default_rng(salted_key(seed, salt, self.TAG_NOISE)).standard_normal(
            self.budget)
        self.xs: list[np.ndarray] = []
        self.ys: list[float] = []
        self.history: list[dict] = []
        self.posteriors: list[np.ndarray] = [PRIOR.copy()]
        self.result: dict | None = None
        return {**rules(), "budget": self.budget, "experiments_remaining": self.budget,
                "posterior": self._post_dict()}

    @property
    def hidden(self) -> str:
        return NAMES[self._h]

    @property
    def remaining(self) -> int:
        return self.budget - len(self.xs)

    def step(self, action) -> dict:
        if self._h is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("episode is over (already submitted)")
        if self.remaining <= 0:
            raise RuntimeError("experiment budget exhausted")
        x = validate(action)
        i = len(self.xs)
        y = float(mean_yield(x[None], i)[self._h, 0] + SIGMA * self._z[i])
        self.xs.append(x)
        self.ys.append(y)
        rec = {"index": i, **{k: float(v) for k, v in zip(KEYS, x)}, "yield": y}
        self.history.append(rec)
        self.posteriors.append(posterior(self.xs, self.ys))
        return {"result": rec, "experiments_remaining": self.remaining,
                "posterior": self._post_dict()}

    def _post_dict(self) -> dict:
        return dict(zip(NAMES, map(float, self.posteriors[-1])))

    def exact_posterior(self) -> np.ndarray:
        return self.posteriors[-1].copy()

    def submit(self, belief, with_reference: bool = True) -> dict:
        from .chem_reward import parse_belief, score
        if self._h is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("already submitted")
        q = parse_belief(belief)
        out = score(q, self._h, self.posteriors[-1])
        out["n_experiments"] = len(self.xs)
        out["hidden"] = self.hidden
        if with_reference:
            ref = reference_trajectory(self.seed, self.salt, self.budget)
            out["reference_reward"] = ref["result"]["reward"]
            out["gap_to_reference"] = out["reward"] - out["reference_reward"]
        self.result = out
        return out


# ---- policies ---------------------------------------------------------------------------

def eig_action(p: np.ndarray, index: int, grid: np.ndarray = GRID) -> np.ndarray:
    return grid[int(np.argmax(eig(p, grid, index)))]


def run_policy(policy: str, seed: int, salt: str | None = None, budget: int = BUDGET,
               rng: np.random.Generator | None = None, with_reference: bool = False) -> ChemLab:
    """Play one episode in-process. policy: "reference" (greedy EIG + exact posterior),
    "random" (uniform random designs + exact posterior), "prior" (no experiments, submit prior).
    Returns the finished ChemLab (see .history, .posteriors, .result)."""
    lab = ChemLab(budget)
    lab.reset(seed, salt)
    if policy == "reference":
        while lab.remaining:
            lab.step(eig_action(lab.exact_posterior(), len(lab.xs)))
    elif policy == "random":
        rng = rng or np.random.default_rng([seed, 0xAA])
        lo = np.array([BOUNDS[k][0] for k in KEYS])
        hi = np.array([BOUNDS[k][1] for k in KEYS])
        while lab.remaining:
            lab.step(lo + (hi - lo) * rng.random(3))
    elif policy != "prior":
        raise KeyError(policy)
    lab.submit(PRIOR if policy == "prior" else lab.exact_posterior(), with_reference=with_reference)
    return lab


def reference_trajectory(seed: int, salt: str | None = None, budget: int = BUDGET) -> dict:
    """The Bayes reference on the same (seed, salt): its history, exact posteriors, result."""
    lab = run_policy("reference", seed, salt, budget)
    return {"history": lab.history, "posteriors": [p.tolist() for p in lab.posteriors],
            "result": lab.result}
