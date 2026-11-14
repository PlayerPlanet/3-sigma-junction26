"""Held-out D: Wetlab. Identify a reaction mechanism from stochastic time-course experiments.

A single-use microreactor ("vessel") holds a few hundred substrate molecules S and a handful
of catalyst molecules C. At these copy numbers the kinetics are a continuous-time Markov jump
process, simulated here with our own batched implementation of the Gillespie direct method
(exact SSA; `simulate`). The reference implementation of this algorithm family is GillesPy2;
it is NOT a dependency (tests/test_wetlab.py has an optional cross-check against it).

Hidden per episode: one mechanism h* out of MECHANISMS (public prior) and its rate constants
(public log-uniform priors). Everything else is public (`rules()`).

One run: the agent picks substrate S0, catalyst C0, an optional product spike P0, temperature
T, and 1-6 sampling times. The vessel is simulated once; the assay returns P(t) + Normal(0,
SIGMA^2) at each sampling time (non-destructive read-out). Each run consumes stock (substrate,
catalyst, product standard, one assay kit per sample, one vessel); when stock runs out the
agent can only submit. Reward: log q(h*) - log p0(h*) (see wetlab_reward).

Unlike chem_lab there is no closed-form likelihood: p(readings | h) integrates over the rate
constants AND over the unobserved jump trajectory. The reference policy (`Belief`, `eig`,
`run_policy("reference")`) therefore uses simulation-based inference and is APPROXIMATE.

    lab = WetLab()
    obs = lab.reset(seed=0, salt="secret")
    obs = lab.step({"substrate": 150, "catalyst": 6, "product_spike": 0,
                    "temperature": 300, "sample_times": [4, 12, 35]})
    res = lab.submit(obs["reference_posterior"])
"""

from __future__ import annotations

import hashlib
import math

import numpy as np

# ---- public constants -------------------------------------------------------------------

R = 8.314                 # J / (mol K)
T0 = 300.0                # K, reference temperature of the rate-constant priors
SIGMA = 8.0               # assay noise sd, in molecules of P
SPECIES = ("S", "P", "C", "I", "X", "SC")   # substrate, product, catalyst, intermediate,
NS = len(SPECIES)                            # dead catalyst, substrate-catalyst complex
iS, iP, iC, iI, iX, iSC = range(NS)

# The union network. A mechanism switches on a subset (the other rate constants are 0).
# (name, reactants, products, activation energy J/mol)
REACTIONS = (
    ("cat",     ("S", "C"), ("P", "C"), 50_000.0),   # S + C -> P + C
    ("to_int",  ("S", "C"), ("I", "C"), 50_000.0),   # S + C -> I + C
    ("int_out", ("I",),     ("P",),     80_000.0),   # I -> P
    ("reverse", ("P", "C"), ("S", "C"), 90_000.0),   # P + C -> S + C
    ("auto",    ("S", "P"), ("P", "P"), 30_000.0),   # S + P -> 2 P
    ("deact",   ("C",),     ("X",),     120_000.0),  # C -> X
    ("bind",    ("S", "C"), ("SC",),    20_000.0),   # S + C -> SC
    ("turn",    ("SC",),    ("P", "C"), 50_000.0),   # SC -> P + C
)
NR = len(REACTIONS)
EA = np.array([r[3] for r in REACTIONS])
STOICH = np.zeros((NR, NS))
_R1 = np.full(NR, NS)     # index NS = a column of ones (for first-order reactions)
_R2 = np.full(NR, NS)
for _j, (_n, _re, _pr, _e) in enumerate(REACTIONS):
    for _s in _re:
        STOICH[_j, SPECIES.index(_s)] -= 1
    for _s in _pr:
        STOICH[_j, SPECIES.index(_s)] += 1
    _R1[_j] = SPECIES.index(_re[0])
    if len(_re) == 2:
        _R2[_j] = SPECIES.index(_re[1])

K1_RANGE = (0.005, 0.05)  # 1 / (catalyst molecule * min) at T0, shared by all mechanisms

# name, description, ((param, lo, hi), ...) log-uniform at T0, {reaction: lambda k1, k2}
MECHANISMS = (
    ("first_order", "S + C -> P + C (rate k1*S*C). Plain catalysed conversion.",
     (("k1", *K1_RANGE),),
     {"cat": "k1"}),
    ("intermediate", "S + C -> I + C (rate k1*S*C), then I -> P (rate k2*I). I is not seen "
     "by the assay: product appears with a lag.",
     (("k1", *K1_RANGE), ("k2", 0.15, 2.0)),
     {"to_int": "k1", "int_out": "k2"}),
    ("reversible", "S + C -> P + C (rate k1*S*C) and P + C -> S + C (rate k1*Kr*P*C): "
     "conversion stops at an equilibrium.",
     (("k1", *K1_RANGE), ("Kr", 0.03, 0.4)),
     {"cat": "k1", "reverse": "k1*k2"}),
    ("autocatalytic", "S + C -> P + C (rate k1*S*C) and S + P -> 2P (rate ka*S*P): the "
     "product catalyses its own formation.",
     (("k1", *K1_RANGE), ("ka", 3e-5, 4e-4)),
     {"cat": "k1", "auto": "k2"}),
    ("deactivation", "S + C -> P + C (rate k1*S*C) and C -> X (rate kd*C): the catalyst "
     "dies, conversion may stall.",
     (("k1", *K1_RANGE), ("kd", 0.005, 0.08)),
     {"cat": "k1", "deact": "k2"}),
    ("saturation", "S + C -> SC (rate k1*S*C), then SC -> P + C (rate kcat*SC): each "
     "catalyst is occupied while it turns over, so the rate saturates at high S.",
     (("k1", *K1_RANGE), ("kcat", 1.0, 20.0)),
     {"bind": "k1", "turn": "k2"}),
)
NAMES = tuple(m[0] for m in MECHANISMS)
K = len(MECHANISMS)
PRIOR = np.full(K, 1.0 / K)
NPAR = 2                                   # theta is stored as u in [0,1]^2 (log-uniform)
_LO = np.array([[p[1] for p in m[2]] + [1.0] * (NPAR - len(m[2])) for m in MECHANISMS])
_HI = np.array([[p[2] for p in m[2]] + [1.0] * (NPAR - len(m[2])) for m in MECHANISMS])
_RIDX = {r[0]: j for j, r in enumerate(REACTIONS)}

# bench
STOCK = {"substrate": 600, "catalyst": 16, "product_standard": 60, "assay_kits": 12,
         "vessels": 5}
BOUNDS = {"substrate": (20, 200), "catalyst": (1, 6), "product_spike": (0, 40),
          "temperature": (285.0, 315.0), "sample_time": (0.5, 40.0)}
MAX_SAMPLES = 6
KEYS = ("substrate", "catalyst", "product_spike", "temperature", "sample_times")


# ---- Gillespie engine (array-backend agnostic) --------------------------------------------

def simulate(x0, rates, times, uniform, xp=np, compact_every: int = 8):
    """Exact stochastic simulation (Gillespie direct method) of a batch of B independent
    vessels of the union network, vectorised over the batch.

    x0     (B, NS)  initial molecule counts (float array)
    rates  (B, NR)  stochastic rate constants (0 = reaction absent)
    times  (B, T)   non-decreasing read-out times per vessel (pad by repeating the last)
    uniform(n, k) -> (n, k) array of U(0, 1] draws from the caller's RNG
    Returns (B, T, NS): the state of every vessel at each of its read-out times.

    Only generic array operations are used (indexing, where, cumsum, log), with the module
    passed as `xp`, so a torch backend is a small step (not provided, not tested)."""
    B, T = times.shape
    out = xp.zeros((B, T, NS))
    idx = xp.arange(B)
    x = x0 * 1.0
    t = xp.zeros(B)
    ptr = xp.zeros(B, dtype=xp.int64)
    stoich, r1, r2 = xp.asarray(STOICH), xp.asarray(_R1), xp.asarray(_R2)
    step = 0
    while True:
        n = x.shape[0]
        xe = xp.concatenate([x, xp.ones((n, 1))], axis=1)
        cum = xp.cumsum(rates * xe[:, r1] * xe[:, r2], axis=1)
        a0 = cum[:, -1]
        u = uniform(n, 2)
        live = a0 > 0
        tn = xp.where(live, t - xp.log(u[:, 0]) / xp.where(live, a0, 1.0), math.inf)
        rows = xp.arange(n)
        while True:                       # record every read-out time passed by this jump
            pending = ptr < T
            m = pending & (tn > times[rows, xp.where(pending, ptr, 0)])
            if not bool(m.any()):
                break
            out[idx[m], ptr[m]] = x[m]
            ptr = ptr + m
        j = ((cum < (u[:, 1] * a0)[:, None]).sum(axis=1)).clip(0, NR - 1)
        x = x + stoich[j]
        t = tn
        step += 1
        if step % compact_every == 0:
            keep = ptr < T
            if not bool(keep.any()):
                return out
            if not bool(keep.all()):
                x, t, ptr, idx = x[keep], t[keep], ptr[keep], idx[keep]
                rates, times = rates[keep], times[keep]


def _np_uniform(rng: np.random.Generator):
    return lambda n, k: 1.0 - rng.random((n, k))


def theta_from_unit(h, u):
    """u in [0,1]^(.., NPAR) -> physical rate parameters (log-uniform on the prior range)."""
    h = np.asarray(h)
    return _LO[h] * (_HI[h] / _LO[h]) ** np.asarray(u)


def rate_matrix(h, theta, temperature) -> np.ndarray:
    """(B,) mechanism index, (B, NPAR) physical parameters, (B,) K -> (B, NR) rate constants."""
    h = np.asarray(h)
    theta = np.asarray(theta, float)
    out = np.zeros((len(h), NR))
    k1, k2 = theta[:, 0], theta[:, 1]
    for m in range(K):
        sel = h == m
        if sel.any():
            for rname, expr in MECHANISMS[m][3].items():
                out[sel, _RIDX[rname]] = {"k1": k1, "k2": k2, "k1*k2": k1 * k2}[expr][sel]
    tf = np.exp(EA[None, :] / R * (1.0 / T0 - 1.0 / np.asarray(temperature, float)[:, None]))
    return out * tf


def initial_state(substrate, catalyst, spike) -> np.ndarray:
    s = np.asarray(substrate, float)
    x0 = np.zeros((len(s), NS))
    x0[:, iS], x0[:, iC], x0[:, iP] = s, catalyst, spike
    return x0


def pad_times(ts, T: int = MAX_SAMPLES) -> np.ndarray:
    ts = list(ts)
    return np.array(ts + [ts[-1]] * (T - len(ts)), float)


def simulate_runs(h, u, actions, rng, n_times: int = MAX_SAMPLES) -> np.ndarray:
    """Simulate one vessel per row. h (B,), u (B, NPAR) unit-cube parameters, actions: a list
    of B validated actions (or one action for all rows). Returns product counts (B, n_times)
    at each action's (padded) sampling times."""
    h = np.asarray(h)
    B = len(h)
    if isinstance(actions, dict):
        acts = [actions]
        which = np.zeros(B, int)
    else:
        acts, which = actions, np.arange(B)
    a = np.array([[x["substrate"], x["catalyst"], x["product_spike"], x["temperature"]]
                  for x in acts], float)[which]
    times = np.array([pad_times(x["sample_times"], n_times) for x in acts])[which]
    rates = rate_matrix(h, theta_from_unit(h, u), a[:, 3])
    return simulate(initial_state(a[:, 0], a[:, 1], a[:, 2]), rates, times,
                    _np_uniform(rng))[:, :, iP]


def simulate_trajectories(mechanism: str, params: dict | None, action: dict, n: int = 20,
                          points: int = 80, t_max: float | None = None, seed: int = 0) -> dict:
    """Full simulated trajectories for plotting: n vessels of `mechanism` with rate constants
    `params` ({"k1": ..., ...}; None = a fresh prior draw per vessel) under `action`.
    Returns {"t": [points], species: [n][points] for each species}."""
    a = validate(action)
    h = np.full(n, NAMES.index(mechanism))
    rng = np.random.default_rng([seed, 0x7A1])
    if params is None:
        theta = theta_from_unit(h, rng.random((n, NPAR)))
    else:
        names = [p[0] for p in MECHANISMS[h[0]][2]]
        theta = np.tile([float(params[k]) for k in names] + [1.0] * (NPAR - len(names)), (n, 1))
    t = np.linspace(0.0, t_max or a["sample_times"][-1], points)
    x = simulate(initial_state(np.full(n, a["substrate"]), a["catalyst"], a["product_spike"]),
                 rate_matrix(h, theta, np.full(n, a["temperature"])), np.tile(t, (n, 1)),
                 _np_uniform(rng))
    return {"t": t.tolist(), **{s: x[:, :, i].tolist() for i, s in enumerate(SPECIES)}}


# ---- actions, keys, rules ------------------------------------------------------------------

def _num(name, v, lo, hi, integer):
    if isinstance(v, bool):
        raise ValueError(f"{name} must be a number")
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number") from None
    if not math.isfinite(v) or not lo <= v <= hi:
        raise ValueError(f"{name} must be a finite number in [{lo}, {hi}]")
    if integer:
        if v != round(v):
            raise ValueError(f"{name} must be a whole number of molecules")
        return int(v)
    return v


def validate(action) -> dict:
    """-> {"substrate": int, "catalyst": int, "product_spike": int, "temperature": float,
    "sample_times": [float, ...]}. product_spike may be omitted (0). Raises ValueError on
    unknown/missing keys, NaN/inf, out-of-range values, or bad sampling times."""
    if not isinstance(action, dict):
        raise ValueError(f"action must be a dict with keys {list(KEYS)}")
    action = {"product_spike": 0, **action}
    if set(action) != set(KEYS):
        raise ValueError(f"action must have exactly the keys {list(KEYS)}")
    out = {
        "substrate": _num("substrate", action["substrate"], *BOUNDS["substrate"], True),
        "catalyst": _num("catalyst", action["catalyst"], *BOUNDS["catalyst"], True),
        "product_spike": _num("product_spike", action["product_spike"],
                              *BOUNDS["product_spike"], True),
        "temperature": _num("temperature", action["temperature"], *BOUNDS["temperature"], False),
    }
    ts = action["sample_times"]
    if isinstance(ts, (str, bytes)) or not hasattr(ts, "__len__"):
        raise ValueError("sample_times must be a list of numbers")
    if not 1 <= len(ts) <= MAX_SAMPLES:
        raise ValueError(f"sample_times must have 1 to {MAX_SAMPLES} entries")
    ts = [_num("sample_time", t, *BOUNDS["sample_time"], False) for t in ts]
    if any(b <= a for a, b in zip(ts, ts[1:])):
        raise ValueError("sample_times must be strictly increasing")
    out["sample_times"] = ts
    return out


def cost(a: dict) -> dict:
    return {"substrate": a["substrate"], "catalyst": a["catalyst"],
            "product_standard": a["product_spike"], "assay_kits": len(a["sample_times"]),
            "vessels": 1}


def affordable(a: dict, stock: dict) -> bool:
    return all(stock[k] >= v for k, v in cost(a).items())


def salted_key(seed: int, salt: str | None, *tag: int) -> list[int]:
    """Same scheme as chem_lab.salted_key: without the salt, streams are not recomputable."""
    if salt is None:
        return [int(seed), *tag]
    h = hashlib.sha256(f"{salt}:{seed}".encode()).digest()
    return [int(seed), *tag] + [int.from_bytes(h[i:i + 4], "little") for i in range(0, 32, 4)]


def rules() -> dict:
    return {
        "description": (
            "You run catalysed reactions in single-use microreactor vessels holding a few "
            "hundred molecules. Exactly one of the listed mechanisms is true; its rate "
            "constants are unknown (drawn once per episode from the listed log-uniform "
            "priors) and stay the same in every run. Each run: choose substrate S0, catalyst "
            "C0, an optional product spike P0 (all whole molecules), a temperature (K) and 1-6 "
            "strictly increasing sampling times (min). You get a noisy reading of the product "
            "count P at each sampling time. Each run consumes stock; you may submit at any "
            "time. Submit a probability for each mechanism."),
        "model": (
            "Each vessel is an independent continuous-time Markov jump process (stochastic "
            "mass-action kinetics, i.e. what the Gillespie algorithm simulates): a reaction "
            "with rate constant k and reactants A (+ B) fires with propensity k*#A (*#B) and "
            "changes the counts by its stoichiometry. Start: S = S0, C = C0, P = P0, all other "
            "species 0. Intrinsic noise is NOT negligible at these counts and readings within "
            "one run come from the same trajectory. reading(t) = P(t) + Normal(0, sigma^2), "
            "independent per reading, not clipped or rounded. Reading does not disturb the "
            "vessel. Temperature: every rate constant is multiplied by "
            "exp(Ea/R * (1/T0 - 1/T)) with the activation energy Ea of its reaction; the "
            "priors are for T = T0."),
        "species": {"S": "substrate", "P": "product (the only species the assay sees)",
                    "C": "active catalyst", "I": "intermediate", "X": "dead catalyst",
                    "SC": "substrate-catalyst complex"},
        "reactions": [{"name": n, "reactants": list(re), "products": list(pr),
                       "Ea_J_per_mol": ea} for n, re, pr, ea in REACTIONS],
        "mechanisms": [
            {"name": n, "prior": float(PRIOR[i]), "description": d,
             "parameters": [{"name": p, "log_uniform_range": [lo, hi]} for p, lo, hi in ps],
             "rate_constants_at_T0": dict(rx)}
            for i, (n, d, ps, rx) in enumerate(MECHANISMS)],
        "parameter_units": "k1: 1/(molecule*min); ka: 1/(molecule*min); k2, kd, kcat: 1/min; "
                           "Kr: dimensionless (reverse rate constant = k1*Kr)",
        "constants": {"sigma": SIGMA, "T0": T0, "R": R},
        "bounds": {k: list(v) for k, v in BOUNDS.items()},
        "max_samples_per_run": MAX_SAMPLES,
        "stock": dict(STOCK),
        "cost_per_run": "substrate: S0, catalyst: C0, product_standard: P0, assay_kits: "
                        "number of sampling times, vessels: 1. A run that exceeds any "
                        "remaining stock is rejected and consumes nothing.",
        "scoring": ("reward = log q(true) - log prior(true), where q = 0.999 * your submitted "
                    "distribution + 0.001 * prior. Submitting the prior scores 0."),
    }


# ---- simulation-based inference (approximate) ----------------------------------------------

def _logsumexp(a, axis):
    m = a.max(axis=axis, keepdims=True)
    return (m + np.log(np.exp(a - m).sum(axis=axis, keepdims=True))).squeeze(axis)


class Belief:
    """Approximate posterior over (mechanism, rate constants): one particle population per
    mechanism, updated run by run (SMC over the static parameters).

    For a run with readings y, each particle (h, theta) gets the Monte-Carlo likelihood
        L = mean_m prod_t Normal(y_t | P_m(t), sigma^2),   P_m = n_inner fresh SSA trajectories,
    an unbiased estimate of p(y | h, theta, run). The evidence of mechanism h is multiplied by
    the weighted mean of L; particles are resampled when the effective sample size is low and
    jittered with a Liu-West shrinkage kernel (no MH correction). Sources of error: finite
    particles/inner simulations, and the jitter. It is not the exact posterior."""

    def __init__(self, rng: np.random.Generator, n_particles: int = 384, n_inner: int = 8):
        self.rng, self.N, self.M = rng, n_particles, n_inner
        self.u = rng.random((K, self.N, NPAR))
        self.logw = np.zeros((K, self.N))
        self.logz = np.zeros(K)

    def posterior(self) -> np.ndarray:
        lp = np.log(PRIOR) + self.logz
        p = np.exp(lp - lp.max())
        return p / p.sum()

    def update(self, action: dict, y) -> None:
        y = np.asarray(y, float)
        nt = len(y)
        h = np.repeat(np.arange(K), self.N * self.M)
        u = np.repeat(self.u.reshape(K * self.N, NPAR), self.M, axis=0)
        P = simulate_runs(h, u, action, self.rng, nt).reshape(K, self.N, self.M, nt)
        ll = (-0.5 * ((y - P) / SIGMA) ** 2).sum(-1) - nt * math.log(SIGMA * math.sqrt(2 * math.pi))
        ll = _logsumexp(ll, 2) - math.log(self.M)                       # (K, N)
        lw = self.logw + ll
        self.logz += _logsumexp(lw, 1) - _logsumexp(self.logw, 1)
        self.logw = lw - _logsumexp(lw, 1)[:, None]
        for k in range(K):
            w = np.exp(self.logw[k])
            if 1.0 / (w ** 2).sum() < 0.5 * self.N:
                self._rejuvenate(k, w)

    def _rejuvenate(self, k: int, w: np.ndarray, a: float = 0.98) -> None:
        u = self.u[k]
        mean = w @ u
        var = w @ (u - mean) ** 2
        idx = self.rng.choice(self.N, self.N, p=w)
        new = a * u[idx] + (1 - a) * mean + math.sqrt(1 - a * a) * np.sqrt(var) * \
            self.rng.standard_normal((self.N, NPAR))
        new = np.abs(new)                                   # reflect into [0, 1]
        self.u[k] = 1.0 - np.abs(1.0 - new).clip(0, 1)
        self.logw[k] = 0.0

    def sample(self, k: int, n: int) -> np.ndarray:
        w = np.exp(self.logw[k] - self.logw[k].max())
        return self.u[k, self.rng.choice(self.N, n, p=w / w.sum())]


def eig(belief: Belief, candidates: list[dict], n_sim: int = 48) -> np.ndarray:
    """Monte-Carlo estimate of the expected information gain about the MECHANISM (nats) of
    each candidate run under the current belief. Per candidate and mechanism, n_sim (theta,
    trajectory) draws; p(y | h) is the equal-weight Gaussian mixture around them (leave-one-out
    for the draw that generated y). Approximate (finite mixtures, biased at small n_sim)."""
    C, L = len(candidates), n_sim
    nt = max(len(c["sample_times"]) for c in candidates)
    h = np.tile(np.repeat(np.arange(K), L), C)
    u = np.concatenate([belief.sample(k, L) for _ in range(C) for k in range(K)])
    acts = [c for c in candidates for _ in range(K * L)]
    P = simulate_runs(h, u, acts, belief.rng, nt).reshape(C, K * L, nt)
    mask = np.array([[t < len(c["sample_times"]) for t in range(nt)] for c in candidates])
    y = P + SIGMA * belief.rng.standard_normal(P.shape)
    d2 = ((((y[:, :, None, :] - P[:, None, :, :]) / SIGMA) ** 2) * mask[:, None, None, :]).sum(-1)
    ll = -0.5 * d2                                                     # (C, KL outer, KL inner)
    eye = np.eye(K * L, dtype=bool)
    ll = np.where(eye[None], -np.inf, ll).reshape(C, K * L, K, L)
    cnt = np.full((K * L, K), float(L)) - np.repeat(np.eye(K), L, axis=0)   # LOO counts
    lph = _logsumexp(ll, 3) - np.log(cnt)[None]                        # log p(y | h') (C, KL, K)
    p = belief.posterior()
    with np.errstate(divide="ignore"):
        lmarg = _logsumexp(lph + np.log(p)[None, None, :], 2)          # (C, KL)
    own = lph[:, np.arange(K * L), np.repeat(np.arange(K), L)]
    return ((own - lmarg).reshape(C, K, L).mean(2) * p[None, :]).sum(1)


_TIME_SETS = ((2.0, 6.0, 15.0), (4.0, 12.0, 35.0), (10.0, 25.0, 40.0))


def candidate_grid() -> list[dict]:
    return [{"substrate": s, "catalyst": c, "product_spike": p, "temperature": T,
             "sample_times": list(ts)}
            for s in (40, 100, 200) for c in (1, 3, 6) for p in (0, 40)
            for T in (288.0, 300.0, 312.0) for ts in _TIME_SETS]


GRID = candidate_grid()


def _fair(cands: list[dict], stock: dict) -> list[dict]:
    """Affordable candidates that do not eat more than ~1.6x a fair share of what is left
    (so the greedy design keeps stock for later runs)."""
    runs_left = max(1, min(stock["vessels"], stock["assay_kits"] // 3))
    ok = [c for c in cands if affordable(c, stock)]
    fair = [c for c in ok if all(v <= max(1.6 * stock[k] / runs_left, _MIN_COST[k])
                                 for k, v in cost(c).items() if k in _MIN_COST)]
    return fair or ok


_MIN_COST = {"substrate": 40, "catalyst": 1}


# ---- environment ------------------------------------------------------------------------

class WetLab:
    """One episode at a time. reset -> step* -> submit. JSON-able observations.

    track_reference=True (demos) adds "reference_posterior" (the approximate SBI posterior
    given the runs so far) to every observation; this costs ~1 s per step. The MCP server uses
    track_reference=False and never shows it to the agent.

    For demos/analysis (not exposed through MCP): .history, .posteriors, .hidden,
    .hidden_params, .true_trajectories(action), reference_trajectory(seed, salt)."""

    TAG_HYP, TAG_THETA, TAG_RUN, TAG_INFER, TAG_POLICY = 0xD4E1, 0xD4E2, 0xD4E3, 0xD4E4, 0xD4E5

    def __init__(self, track_reference: bool = True, n_particles: int = 384, n_inner: int = 8):
        self.track = track_reference
        self._bkw = {"n_particles": n_particles, "n_inner": n_inner}
        self._h: int | None = None

    def _new_belief(self) -> Belief:
        return Belief(np.random.default_rng(salted_key(self.seed, self.salt, self.TAG_INFER)),
                      **self._bkw)

    def reset(self, seed: int, salt: str | None = None) -> dict:
        self.seed, self.salt = int(seed), salt
        self._h = int(np.random.default_rng(salted_key(seed, salt, self.TAG_HYP)).choice(K, p=PRIOR))
        self._u = np.random.default_rng(salted_key(seed, salt, self.TAG_THETA)).random(NPAR)
        self.stock = dict(STOCK)
        self.actions: list[dict] = []
        self.readings: list[list[float]] = []
        self.history: list[dict] = []
        self.belief = self._new_belief() if self.track else None
        self.posteriors: list[np.ndarray] = [PRIOR.copy()]
        self.result: dict | None = None
        return {**rules(), "stock_remaining": dict(self.stock), **self._post()}

    def _post(self) -> dict:
        if not self.track:
            return {}
        return {"reference_posterior": dict(zip(NAMES, map(float, self.posteriors[-1])))}

    @property
    def hidden(self) -> str:
        return NAMES[self._h]

    @property
    def hidden_params(self) -> dict:
        th = theta_from_unit(self._h, self._u)
        return {p[0]: float(th[i]) for i, p in enumerate(MECHANISMS[self._h][2])}

    def can_run(self) -> bool:
        """Whether the cheapest possible run is still affordable."""
        s = self.stock
        return (s["vessels"] >= 1 and s["assay_kits"] >= 1
                and s["substrate"] >= BOUNDS["substrate"][0]
                and s["catalyst"] >= BOUNDS["catalyst"][0])

    def step(self, action) -> dict:
        if self._h is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("episode is over (already submitted)")
        a = validate(action)
        short = [k for k, v in cost(a).items() if self.stock[k] < v]
        if short:
            raise RuntimeError(f"not enough stock for this run: {short}; remaining {self.stock}")
        i = len(self.actions)
        # common random numbers: run i has its own stream, whatever its conditions
        rng = np.random.default_rng(salted_key(self.seed, self.salt, self.TAG_RUN, i))
        nt = len(a["sample_times"])
        P = simulate_runs([self._h], self._u[None], a, rng, nt)[0]
        y = (P + SIGMA * rng.standard_normal(nt)).tolist()
        for k, v in cost(a).items():
            self.stock[k] -= v
        self.actions.append(a)
        self.readings.append(y)
        rec = {"run": i, **a, "readings": y}
        self.history.append(rec)
        if self.track:
            self.belief.update(a, y)
            self.posteriors.append(self.belief.posterior())
        return {"result": rec, "stock_remaining": dict(self.stock), "can_run": self.can_run(),
                **self._post()}

    def reference_posterior(self) -> np.ndarray:
        """Approximate SBI posterior given this lab's runs (replayed if it was not tracked)."""
        if self.track:
            return self.posteriors[-1].copy()
        b = self._new_belief()
        for a, y in zip(self.actions, self.readings):
            b.update(a, y)
        return b.posterior()

    def true_trajectories(self, action, n: int = 20, points: int = 80) -> dict:
        """Full trajectories of the HIDDEN mechanism under `action` (for the demo reveal)."""
        return simulate_trajectories(self.hidden, self.hidden_params, action, n, points,
                                     seed=self.seed)

    def submit(self, belief, reference: dict | bool = True, diagnostics: bool = True) -> dict:
        """Score a submitted distribution. The reward depends only on the true mechanism.
        reference: True = run the reference policy on the same (seed, salt) now (slow, ~1 min),
        a dict = a precomputed reference_trajectory(...)["result"], False = skip.
        diagnostics: also report the approximate SBI posterior on the agent's own data and the
        approximate design/inference split derived from it (never part of the reward)."""
        from .wetlab_reward import parse_belief, score
        if self._h is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("already submitted")
        q = parse_belief(belief)
        out = score(q, self._h)
        out["n_runs"] = len(self.actions)
        out["n_samples"] = sum(len(y) for y in self.readings)
        out["stock_used"] = {k: STOCK[k] - v for k, v in self.stock.items()}
        out["budget_used"] = float(np.mean([out["stock_used"][k] / STOCK[k] for k in STOCK]))
        out["hidden"] = self.hidden
        out["hidden_params"] = self.hidden_params
        if diagnostics:
            p = self.reference_posterior()
            lp = math.log(max(float(p[self._h]), 1e-300))
            out["approx_posterior"] = dict(zip(NAMES, map(float, p)))
            out["approx_design"] = lp - math.log(PRIOR[self._h])
            out["approx_inference"] = out["reward"] - out["approx_design"]
        if reference is True:
            reference = reference_trajectory(self.seed, self.salt)["result"]
        if reference:
            out["reference_reward"] = reference["reward"]
            out["reference_accuracy"] = reference["accuracy"]
            out["gap_to_reference"] = out["reward"] - reference["reward"]
        self.result = out
        return out


# ---- policies ---------------------------------------------------------------------------

def reference_action(belief: Belief, stock: dict, rng: np.random.Generator,
                     n_candidates: int = 40, n_sim: int = 48) -> dict | None:
    """Greedy design: the affordable grid candidate (a random subset of n_candidates) with the
    highest estimated information gain about the mechanism."""
    cands = _fair(GRID, stock)
    if not cands:
        return None
    if len(cands) > n_candidates:
        cands = [cands[i] for i in rng.choice(len(cands), n_candidates, replace=False)]
    return cands[int(np.argmax(eig(belief, cands, n_sim)))]


def random_action(stock: dict, rng: np.random.Generator) -> dict | None:
    """A uniformly random affordable run with 3 sampling times (None if nothing fits)."""
    for _ in range(200):
        a = {"substrate": int(rng.integers(BOUNDS["substrate"][0], BOUNDS["substrate"][1] + 1)),
             "catalyst": int(rng.integers(BOUNDS["catalyst"][0], BOUNDS["catalyst"][1] + 1)),
             "product_spike": int(rng.integers(0, BOUNDS["product_spike"][1] + 1)) if rng.random() < 0.5 else 0,
             "temperature": float(rng.uniform(*BOUNDS["temperature"])),
             "sample_times": np.sort(rng.uniform(*BOUNDS["sample_time"], 3)).round(2).tolist()}
        try:
            a = validate(a)
        except ValueError:
            continue
        if affordable(a, stock):
            return a
    return None


# A sensible hand-made plan (what a careful person might run): vary one thing at a time.
FIXED_DESIGN = (
    {"substrate": 200, "catalyst": 3, "product_spike": 0, "temperature": 300.0, "sample_times": [4.0, 12.0, 35.0]},
    {"substrate": 100, "catalyst": 6, "product_spike": 0, "temperature": 312.0, "sample_times": [3.0, 10.0, 30.0]},
    {"substrate": 100, "catalyst": 1, "product_spike": 40, "temperature": 300.0, "sample_times": [8.0, 20.0, 40.0]},
    {"substrate": 200, "catalyst": 6, "product_spike": 0, "temperature": 288.0, "sample_times": [8.0, 20.0, 40.0]},
)


def run_policy(policy: str, seed: int, salt: str | None = None, reference: dict | bool = False,
               **belief_kw) -> WetLab:
    """Play one episode in-process and submit. Policies (all but "prior" submit the SBI
    posterior of `Belief`): "reference" (greedy EIG designs), "random" (random designs),
    "fixed" (FIXED_DESIGN), "prior" (no runs, submit the prior). Returns the finished lab."""
    lab = WetLab(track_reference=policy != "prior", **belief_kw)
    lab.reset(seed, salt)
    rng = np.random.default_rng(salted_key(seed, salt, WetLab.TAG_POLICY))
    if policy == "reference":
        while lab.can_run():
            a = reference_action(lab.belief, lab.stock, rng)
            if a is None:
                break
            lab.step(a)
    elif policy == "random":
        while lab.can_run():
            a = random_action(lab.stock, rng)
            if a is None:
                break
            lab.step(a)
    elif policy == "fixed":
        for a in FIXED_DESIGN:
            lab.step(a)
    elif policy != "prior":
        raise KeyError(policy)
    lab.submit(PRIOR if policy == "prior" else lab.reference_posterior(), reference=reference,
               diagnostics=False)
    return lab


def reference_trajectory(seed: int, salt: str | None = None) -> dict:
    """The (approximate) reference on the same (seed, salt): history, posteriors, result."""
    lab = run_policy("reference", seed, salt)
    return {"history": lab.history, "posteriors": [p.tolist() for p in lab.posteriors],
            "result": lab.result}
