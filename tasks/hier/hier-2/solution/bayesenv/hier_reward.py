"""Reward for the hierarchical lab (bayesenv.hier). Kept separate from the simulator.

Every held-out query asks for one probability q that a binary outcome is 1. With p* the TRUE
probability of that outcome (see bayesenv.hier for what "true" means for each kind of query)
and q clamped to [P_MIN, 1 - P_MIN], the expected log score of one query is

    s(q) = p* log q + (1 - p*) log(1 - q)                 (an expectation, nothing is sampled)

With S(q) the mean of s over a set of queries and q0 the prior predictive (computable by the
agent from the disclosed model):

    raw    = (S_all(q) - S_all(q0)) / Z            Z   = per-task-configuration constant
    raw_a  = (S_a(q)   - S_a(q0))   / Z_a          Z_a = same, known-unit queries only
    raw_b  = (S_b(q)   - S_b(q0))   / Z_b          Z_b = same, new-unit queries only
    reward = clip(raw, 0, 1)

Z_a and Z_b are the prior averages of [s(clamped p*) - s(q0)], i.e. the expected gain of an
agent that knows the hidden parameters, estimated ONCE per configuration (hier.estimate_norm)
and stored below; Z = (n_a Z_a + n_b Z_b) / (n_a + n_b). They are constants, not per-episode
quantities, so an easy or hard draw does not rescale the reward, and raw is an affine function
of a proper scoring rule: for given data its expectation is maximised by the exact posterior
predictive. Submitting the prior predictive scores exactly 0. One confident wrong probability
costs at most log(P_MIN) on that query, never -inf.
"""

from __future__ import annotations

import numpy as np

P_MIN = 1e-3

# hier.estimate_norm(get_model(), n=2_000_000, seed=0) for the default configuration (nats per
# query; Monte Carlo standard error about 0.1%). Regenerate with
# `modal run experiments/hier_modal.py::norm` (or `python scripts/hier_calibrate.py --norm`,
# 400k draws) whenever the defaults of hier.Config change.
NORM_A = 0.11575
NORM_B = 0.11948


def clamp(q) -> np.ndarray:
    return np.clip(np.asarray(q, float), P_MIN, 1.0 - P_MIN)


def parse_predictions(pred, n: int) -> np.ndarray:
    """A list of n finite probabilities in [0, 1]. Raises ValueError otherwise."""
    if isinstance(pred, (str, bytes, dict)) or pred is None:
        raise ValueError(f"predictions must be a list of {n} probabilities")
    try:
        vals = list(pred)
        if any(isinstance(v, bool) for v in vals):
            raise TypeError
        q = np.array([float(v) for v in vals])
    except (TypeError, ValueError):
        raise ValueError(f"predictions must be a list of {n} numbers") from None
    if q.shape != (n,):
        raise ValueError(f"need exactly {n} probabilities, one per query in order; got {q.size}")
    if not np.all(np.isfinite(q)) or np.any(q < 0) or np.any(q > 1):
        raise ValueError("every probability must be a finite number in [0, 1]")
    return q


def expected_logscore(p_true: np.ndarray, q) -> np.ndarray:
    """E_{y ~ Bernoulli(p_true)} log q(y) per query, q clamped."""
    q = clamp(q)
    return p_true * np.log(q) + (1.0 - p_true) * np.log1p(-q)


def score(p_true: np.ndarray, p_prior: np.ndarray, is_new: np.ndarray, q,
          z_a: float = NORM_A, z_b: float = NORM_B) -> dict:
    """Reward and its (a) known-unit / (b) new-unit split. is_new: bool per query."""
    gain = expected_logscore(p_true, q) - expected_logscore(p_true, p_prior)
    a, b = gain[~is_new], gain[is_new]
    n_a, n_b = len(a), len(b)
    z = (n_a * z_a + n_b * z_b) / (n_a + n_b)
    raw = float(gain.mean() / z)
    return {
        "reward": float(min(1.0, max(0.0, raw))),
        "raw": raw,
        "raw_a": float(a.mean() / z_a) if n_a else 0.0,
        "raw_b": float(b.mean() / z_b) if n_b else 0.0,
        "gain_nats": float(gain.mean()),
        "gain_a_nats": float(a.mean()) if n_a else 0.0,
        "gain_b_nats": float(b.mean()) if n_b else 0.0,
        "norm": z, "norm_a": z_a, "norm_b": z_b,
    }
