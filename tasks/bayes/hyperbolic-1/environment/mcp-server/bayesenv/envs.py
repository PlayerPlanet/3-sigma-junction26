"""Experimental-design environments with a known generative model.

Each environment exposes a prior over parameters theta, a design space, a simulator, and a
vectorised likelihood. Because the generative model is known, the grader can compute the
*exact* posterior given any set of observations, which is what makes Bayesian grading,
Bayesian reference policies and Bayesian exploit detection possible.

Ported (and corrected) from BoxingGym (Gandhi et al. 2025, MIT): hyperbolic discounting and
location finding, with a per-episode RNG instead of numpy's global state.

Predictive families (what an agent submits for an evaluation design):
  * "bernoulli": a probability p of outcome 1
  * "gaussian":  a mean and standard deviation
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.special import log_ndtr, ndtr

LOG2PI = np.log(2 * np.pi)


@dataclass(frozen=True)
class Hyperbolic:
    """Choice between an immediate reward iR and a delayed reward dR after D days.

    theta = (log k, alpha): k ~ LogNormal(-4.25, 0.5) discount rate, alpha ~ HalfNormal(2)
    decision noise. P(choose delayed) = eps + (1-2eps) * Phi((dR/(1+kD) - iR) / alpha).
    """

    name: str = "hyperbolic"
    family: str = "bernoulli"
    eps: float = 0.01
    dim: int = 2
    design_dim: int = 3

    def sample_prior(self, rng: np.random.Generator, n: int) -> np.ndarray:
        logk = rng.normal(-4.25, 0.5, n)
        alpha = np.abs(rng.normal(0.0, 2.0, n))
        return np.stack([logk, alpha], axis=1)

    def sample_designs(self, rng: np.random.Generator, n: int) -> np.ndarray:
        ir = rng.integers(1, 200, n)
        dr = ir + 1 + (rng.random(n) * (300 - ir - 1)).astype(int)
        days = rng.integers(1, 365, n)
        return np.stack([ir, dr, days], axis=1).astype(float)

    def validate(self, x) -> np.ndarray:
        x = np.asarray(x, dtype=float).reshape(-1)
        if x.shape != (3,):
            raise ValueError("design must be [iR, dR, D]")
        ir, dr, d = x
        if not (0 < ir < dr <= 1000 and 1 <= d <= 3650):
            raise ValueError("need 0 < iR < dR <= 1000 and 1 <= D <= 3650")
        return np.round(x)

    def prob(self, x: np.ndarray, theta: np.ndarray) -> np.ndarray:
        """P(y=1 | x, theta) for designs x (m,3) and thetas (n,2) -> (n, m)."""
        k = np.exp(theta[:, 0])[:, None]
        alpha = np.maximum(theta[:, 1], 1e-6)[:, None]
        v1 = x[None, :, 1] / (1.0 + k * x[None, :, 2])
        z = (v1 - x[None, :, 0]) / alpha
        return self.eps + (1 - 2 * self.eps) * ndtr(z)

    def loglik(self, y: np.ndarray, x: np.ndarray, theta: np.ndarray) -> np.ndarray:
        p = self.prob(x, theta)
        return np.where(y[None, :] > 0.5, np.log(p), np.log1p(-p))

    def simulate(self, x: np.ndarray, theta: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        return (rng.random(len(x)) < self.prob(x, theta[None, :])[0]).astype(float)

    def describe(self) -> str:
        return (
            "A person chooses between an immediate reward iR and a delayed reward dR received "
            "after D days. Choices are noisy. Design an experiment by choosing integers "
            "[iR, dR, D] with 0 < iR < dR <= 1000 and 1 <= D <= 3650. The outcome is 1 if the "
            "person picks the delayed reward, else 0. Predict, for new designs, the probability "
            "that the person picks the delayed reward."
        )

    def model_card(self) -> str:
        return (
            "Exact generative model: log k ~ Normal(-4.25, 0.5), alpha ~ HalfNormal(2), eps = 0.01. "
            "P(outcome=1 | iR, dR, D) = eps + (1 - 2 eps) * Phi((dR / (1 + k D) - iR) / alpha), "
            "where Phi is the standard normal CDF."
        )


@dataclass(frozen=True)
class LocationFinding:
    """A hidden signal source in the plane; measured log-intensity decays with distance.

    theta ~ N(0, I_2) source location. y = log(b + 1/(m + |x - theta|^2)) + N(0, sigma^2).
    """

    name: str = "location"
    family: str = "gaussian"
    b: float = 0.1
    m: float = 1e-4
    sigma: float = 0.5
    dim: int = 2
    design_dim: int = 2

    def sample_prior(self, rng: np.random.Generator, n: int) -> np.ndarray:
        return rng.normal(0.0, 1.0, (n, 2))

    def sample_designs(self, rng: np.random.Generator, n: int) -> np.ndarray:
        return rng.normal(0.0, 1.5, (n, 2))

    def validate(self, x) -> np.ndarray:
        x = np.asarray(x, dtype=float).reshape(-1)
        if x.shape != (2,) or not np.all(np.isfinite(x)) or np.any(np.abs(x) > 10):
            raise ValueError("design must be [x1, x2] with |xi| <= 10")
        return x

    def mean(self, x: np.ndarray, theta: np.ndarray) -> np.ndarray:
        d2 = ((x[None, :, :] - theta[:, None, :]) ** 2).sum(-1)
        return np.log(self.b + 1.0 / (self.m + d2))

    def loglik(self, y: np.ndarray, x: np.ndarray, theta: np.ndarray) -> np.ndarray:
        r = (y[None, :] - self.mean(x, theta)) / self.sigma
        return -0.5 * r**2 - np.log(self.sigma) - 0.5 * LOG2PI

    def simulate(self, x: np.ndarray, theta: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        return self.mean(x, theta[None, :])[0] + rng.normal(0.0, self.sigma, len(x))

    def describe(self) -> str:
        return (
            "A hidden signal source sits somewhere in the plane (a priori near the origin). "
            "Measuring at a point [x1, x2] (|xi| <= 10) returns a noisy log signal intensity "
            "that is higher the closer you are to the source. Predict, for new points, the "
            "mean and standard deviation of the measured value."
        )

    def model_card(self) -> str:
        return (
            "Exact generative model: source theta ~ Normal(0, I_2). Measurement at x: "
            "y = log(0.1 + 1 / (1e-4 + |x - theta|^2)) + Normal(0, 0.5^2)."
        )


ENVS = {"hyperbolic": Hyperbolic(), "location": LocationFinding()}



def get_env(name: str):
    """Hand-written environments by name; 'spec:NAME[@HASH][#K]' for declarative specs."""
    if name in ENVS:
        return ENVS[name]
    if name.startswith("spec:"):
        from .spec import resolve
        return resolve(name)
    raise KeyError(name)


__all__ = ["ENVS", "Hyperbolic", "LocationFinding", "get_env", "log_ndtr"]
