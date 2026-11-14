"""Reward for the Wetlab (bayesenv.wetlab). Same rule as chem_reward, but there is no exact
posterior here, so the reward uses ONLY the true mechanism h* and the public prior p0:

    q          = (1 - EPS) * q_submitted + EPS * p0
    reward     = log q(h*) - log p0(h*)
    accuracy   = [argmax q == h*]

The log score is proper: for given data the expected reward is maximised by reporting the
true posterior p(h | data), whatever method was used to compute it. Submitting the prior scores
exactly 0; the worst case is log(EPS) ~ -6.9; the best is ~ log(1 / p0(h*)) = log 6 ~ 1.79.
Diagnostics that rely on the approximate SBI posterior (approx_design / approx_inference in
WetLab.submit) are reported separately and never enter the reward.
"""

from __future__ import annotations

import math

import numpy as np

from .wetlab import K, NAMES, PRIOR

EPS = 1e-3


def parse_belief(belief) -> np.ndarray:
    """dict name -> prob (missing names = 0), or a list aligned with MECHANISMS. Validates
    (finite, >= 0, positive sum, known names) and normalises."""
    if isinstance(belief, dict):
        unknown = set(belief) - set(NAMES)
        if unknown:
            raise ValueError(f"unknown mechanisms {sorted(map(str, unknown))}; valid: {list(NAMES)}")
        vals = [belief.get(n, 0.0) for n in NAMES]
    else:
        vals = list(np.asarray(belief, dtype=object).reshape(-1)) if not isinstance(
            belief, (str, bytes)) else None
        if vals is None or len(vals) != K:
            raise ValueError(f"belief must be a dict over {list(NAMES)} or a list of {K} numbers")
    try:
        q = np.array([float(v) for v in vals])
    except (TypeError, ValueError):
        raise ValueError("probabilities must be numbers") from None
    if not np.all(np.isfinite(q)) or np.any(q < 0) or q.sum() <= 0:
        raise ValueError("probabilities must be finite, >= 0, and not all zero")
    return q / q.sum()


def mix(q: np.ndarray) -> np.ndarray:
    return (1 - EPS) * q + EPS * PRIOR


def score(q: np.ndarray, h: int) -> dict:
    qm = mix(q)
    lp0 = math.log(PRIOR[h])
    return {
        "reward": math.log(qm[h]) - lp0,
        "accuracy": float(int(np.argmax(qm)) == h),
        "max_reward": math.log((1 - EPS) + EPS * PRIOR[h]) - lp0,
        "submitted": {n: float(v) for n, v in zip(NAMES, q)},
    }
