"""Rewards for the Virtual Chemistry Lab (bayesenv.chem_lab). Kept separate so alternatives
can be added without touching the simulator.

Implemented (primary + decomposition), with h* the true hypothesis, p0 the public prior,
p(.|D) the EXACT posterior given the agent's own experiments D, and q the agent's submission
after epsilon-mixing with the prior, q = (1 - EPS) * q_submitted + EPS * p0:

    reward     = log q(h*) - log p0(h*)                (log score relative to the prior)
    design     = log p(h*|D) - log p0(h*)              (how informative the experiments were)
    inference  = log q(h*) - log p(h*|D)               (how well data were turned into beliefs)
    reward     = design + inference                    (exact identity)
    accuracy   = [argmax q == h*]
    reward_norm = reward / REF_MEAN_REWARD             (0 = prior, ~1 = Bayes reference on avg)

Properties: the log score is a proper scoring rule, so for given data the expected reward is
maximised by reporting the exact posterior (up to the O(EPS) distortion of the mixing: the
exact optimum is q = (p - EPS p0) / (1 - EPS), worth < 1e-3 nats). Submitting the prior scores
exactly 0. A confident wrong answer scores at worst log(EPS) ~ -6.9 instead of -inf. The
maximum (one-hot on h*) is log((1 - EPS) + EPS p0(h*)) - log p0(h*) ~ log(1 / p0(h*)).
E[design] is the mutual information between h and the agent's data, so it rewards good
experimental design; E[inference] <= 0, with equality for exact Bayesian updating.

Alternatives one might try (NOT implemented):
  * Brier / quadratic score: 1 - sum_h (q_h - [h = h*])^2 (proper, bounded, less harsh).
  * Spherical score q(h*) / ||q||_2 (proper, bounded).
  * Expected-information-gain shaping: per-step reward EIG(x_i | p_{i-1}) under the exact
    posterior (dense, low-variance; does not depend on the realised noise or on h*).
  * Per-step realised information: log p(h*|D_i) - log p(h*|D_{i-1}) (sums to `design`).
  * Accuracy-only / argmax reward (improper: ignores calibration; for comparison only).
  * Reward normalised per episode by the reference's reward on the same seed (high variance
    when the reference itself gets little information).
"""

from __future__ import annotations

import math

import numpy as np

from .chem_lab import K, NAMES, PRIOR

EPS = 1e-3
# Mean reference reward from scripts/chem_calibrate.py (4,000 seeds: 1.599, 95% CI
# [1.579, 1.619]); used only to normalise.
REF_MEAN_REWARD = 1.60


def parse_belief(belief) -> np.ndarray:
    """dict name -> prob (missing names = 0), or a list aligned with HYPOTHESES. Validates
    (finite, >= 0, positive sum, known names) and normalises."""
    if isinstance(belief, dict):
        unknown = set(belief) - set(NAMES)
        if unknown:
            raise ValueError(f"unknown hypotheses {sorted(unknown)}; valid: {list(NAMES)}")
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


def score(q: np.ndarray, h: int, p_exact: np.ndarray) -> dict:
    """Primary reward + decomposition for submission q (normalised), truth index h, and the
    exact posterior p_exact given the agent's data."""
    qm = mix(q)
    lp0 = math.log(PRIOR[h])
    lq = math.log(qm[h])
    lpd = math.log(max(float(p_exact[h]), 1e-300))
    reward = lq - lp0
    return {
        "reward": reward,
        "reward_norm": reward / REF_MEAN_REWARD,
        "design": lpd - lp0,
        "inference": lq - lpd,
        "accuracy": float(int(np.argmax(qm)) == h),
        "max_reward": math.log((1 - EPS) + EPS * PRIOR[h]) - lp0,
        "submitted": {n: float(v) for n, v in zip(NAMES, q)},
        "exact_posterior": {n: float(v) for n, v in zip(NAMES, p_exact)},
    }
