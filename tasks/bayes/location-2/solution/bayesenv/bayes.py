"""Exact-model Bayesian machinery: particle posterior, posterior predictive, EIG.

The posterior is a weighted particle set drawn from the prior, reweighted by the known
likelihood, and rejuvenated with random-walk Metropolis moves when the effective sample
size collapses. With 2-parameter models and <= 30 observations this is accurate enough to
serve as the grader's "exact" posterior.
"""

from __future__ import annotations

import numpy as np
from scipy.special import logsumexp


def log_prior(env, theta: np.ndarray) -> np.ndarray:
    if env.name == "hyperbolic":
        lp = -0.5 * ((theta[:, 0] + 4.25) / 0.5) ** 2 - 0.5 * (theta[:, 1] / 2.0) ** 2
        return np.where(theta[:, 1] > 0, lp, -np.inf)
    if env.name == "location":
        return -0.5 * (theta**2).sum(1)
    raise KeyError(env.name)


class Posterior:
    def __init__(self, env, rng: np.random.Generator, n: int = 20_000):
        self.env, self.rng = env, rng
        self.theta = env.sample_prior(rng, n)
        self.logw = np.zeros(n)
        self.xs = np.zeros((0, env.design_dim))
        self.ys = np.zeros(0)

    # ---- updating --------------------------------------------------------------

    def update(self, x: np.ndarray, y: np.ndarray) -> "Posterior":
        x, y = np.atleast_2d(x).astype(float), np.atleast_1d(y).astype(float)
        self.xs, self.ys = np.vstack([self.xs, x]), np.concatenate([self.ys, y])
        self.logw = self.logw + self.env.loglik(y, x, self.theta).sum(1)
        if self.ess() < 0.2 * len(self.logw):
            self._rejuvenate()
        return self

    def _log_target(self, theta: np.ndarray) -> np.ndarray:
        lp = log_prior(self.env, theta)
        if len(self.ys):
            ok = np.isfinite(lp)
            ll = np.full(len(theta), -np.inf)
            ll[ok] = self.env.loglik(self.ys, self.xs, theta[ok]).sum(1)
            lp = lp + ll
        return lp

    def _rejuvenate(self, steps: int = 8) -> None:
        n = len(self.logw)
        idx = self.rng.choice(n, n, p=self.weights())
        theta = self.theta[idx]
        cov = np.cov(theta.T) + 1e-9 * np.eye(theta.shape[1])
        chol = np.linalg.cholesky(cov * (2.38**2 / theta.shape[1]) * 0.5)
        cur = self._log_target(theta)
        for _ in range(steps):
            prop = theta + self.rng.standard_normal(theta.shape) @ chol.T
            new = self._log_target(prop)
            accept = np.log(self.rng.random(n)) < new - cur
            theta[accept], cur[accept] = prop[accept], new[accept]
        self.theta, self.logw = theta, np.zeros(n)

    # ---- summaries -------------------------------------------------------------

    def weights(self) -> np.ndarray:
        w = np.exp(self.logw - self.logw.max())
        return w / w.sum()

    def ess(self) -> float:
        w = self.weights()
        return 1.0 / np.sum(w**2)

    def sample(self, k: int) -> np.ndarray:
        return self.theta[self.rng.choice(len(self.logw), k, p=self.weights())]

    def predictive(self, xq: np.ndarray) -> dict:
        """Posterior predictive at designs xq, in the environment's submission family."""
        w = self.weights()
        if self.env.family == "bernoulli":
            return {"p": w @ self.env.prob(xq, self.theta)}
        mu = self.env.mean(xq, self.theta)
        m = w @ mu
        var = w @ (mu**2) - m**2 + self.env.sigma**2
        return {"mean": m, "sd": np.sqrt(np.maximum(var, 1e-12))}

    # ---- design ----------------------------------------------------------------

    def eig(self, xc: np.ndarray, k: int = 256) -> np.ndarray:
        """Expected information gain about theta for each candidate design in xc."""
        th = self.sample(k)
        if self.env.family == "bernoulli":
            p = np.clip(self.env.prob(xc, th), 1e-12, 1 - 1e-12)  # (k, C)
            h = lambda q: -(q * np.log(q) + (1 - q) * np.log1p(-q))
            return h(p.mean(0)) - h(p).mean(0)
        mu = self.env.mean(xc, th)  # (k, C)
        y = mu + self.rng.normal(0, self.env.sigma, mu.shape)  # one outcome per inner theta
        # log p(y_s | theta_j) for all s, j and each design: (C, k_s, k_j)
        r = (y.T[:, :, None] - mu.T[:, None, :]) / self.env.sigma
        ll = -0.5 * r**2
        own = np.diagonal(ll, axis1=1, axis2=2)  # log p(y_s | theta_s)
        return (own - (logsumexp(ll, axis=2) - np.log(k))).mean(1)

    def best_design(self, n_candidates: int = 256) -> np.ndarray:
        xc = self.env.sample_designs(self.rng, n_candidates)
        return xc[int(np.argmax(self.eig(xc)))]
