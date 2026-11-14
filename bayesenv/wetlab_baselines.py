"""'Competent coder' proxies for the Wetlab: what a strong coding agent would plausibly write
quickly instead of simulation-based inference. All of them

  * run the hand-made plan wetlab.FIXED_DESIGN (8 runs x 3 samples, one factor at a time),
  * replace the stochastic kinetics by the deterministic rate equations (ODE, RK4) of each
    candidate mechanism, on a GRID x GRID log-spaced grid over the public prior ranges,
  * treat readings as independent Gaussians around the ODE curve,

and differ in how they weigh the mechanisms:

  coder_bic       least squares (grid search) with the public assay sigma, weights from BIC
  coder_bic_s     same, noise variance profiled out: BIC = n log(SSE / n) + k log n
  coder_marg      Bayesian model averaging over the grid (= the prior) with variance
                  sigma^2 + binomial(S0, conversion) to account for intrinsic noise; the
                  strongest of the three (still ignores correlation within a run)

They are proxies written by us, not measurements of any LLM agent.
"""

from __future__ import annotations

import math

import numpy as np

from . import wetlab as W

GRID = 40
_cache: dict = {}


def ode_mean(h, theta, action: dict, dt: float = 0.05) -> np.ndarray:
    """Deterministic product curve at the action's sampling times for a batch of (mechanism,
    parameters): (B, n_times). Classic RK4 on the union network's rate equations."""
    B = len(h)
    rates = W.rate_matrix(h, theta, np.full(B, action["temperature"]))
    x = W.initial_state(np.full(B, action["substrate"]), action["catalyst"],
                        action["product_spike"])
    one = np.ones((B, 1))

    def f(x):
        xe = np.concatenate([x, one], axis=1)
        return (rates * xe[:, W._R1] * xe[:, W._R2]) @ W.STOICH

    out, t = [], 0.0
    for ts in action["sample_times"]:
        n = max(1, int(math.ceil((ts - t) / dt)))
        hstep = (ts - t) / n
        for _ in range(n):
            k1 = f(x)
            k2 = f(x + 0.5 * hstep * k1)
            k3 = f(x + 0.5 * hstep * k2)
            k4 = f(x + hstep * k3)
            x = x + hstep / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        t = ts
        out.append(x[:, W.iP].copy())
    return np.stack(out, 1)


def _table(design) -> tuple[np.ndarray, np.ndarray]:
    """ODE means (K, G*G, n_obs) and heuristic intrinsic variances for a fixed design."""
    key = repr(design)
    if key not in _cache:
        g = (np.arange(GRID) + 0.5) / GRID
        u = np.stack(np.meshgrid(g, g, indexing="ij"), -1).reshape(-1, 2)
        h = np.repeat(np.arange(W.K), len(u))
        theta = W.theta_from_unit(h, np.tile(u, (W.K, 1)))
        mu, var = [], []
        for a in design:
            m = ode_mean(h, theta, a)
            made = np.clip(m - a["product_spike"], 0, a["substrate"])
            mu.append(m)
            var.append(made * (1 - made / a["substrate"]))
        _cache[key] = (np.concatenate(mu, 1).reshape(W.K, len(u), -1),
                       np.concatenate(var, 1).reshape(W.K, len(u), -1))
    return _cache[key]


def _norm(logw: np.ndarray) -> np.ndarray:
    p = np.exp(logw - logw.max()) * W.PRIOR
    return p / p.sum()


def coder_posteriors(readings, design=W.FIXED_DESIGN) -> dict[str, np.ndarray]:
    """The three proxy posteriors for readings (list of per-run lists) taken on `design`."""
    mu, var = _table(design)
    y = np.concatenate([np.asarray(r, float) for r in readings])
    n = len(y)
    npar = np.array([len(m[2]) for m in W.MECHANISMS])
    sse = ((y - mu) ** 2).sum(-1).min(1)                                  # (K,)
    v = W.SIGMA ** 2 + var
    ll = (-0.5 * (y - mu) ** 2 / v - 0.5 * np.log(2 * math.pi * v)).sum(-1)   # (K, G*G)
    return {
        "coder_bic": _norm(-0.5 * (sse / W.SIGMA ** 2 + npar * math.log(n))),
        "coder_bic_s": _norm(-0.5 * (n * np.log(sse / n) + npar * math.log(n))),
        "coder_marg": _norm(W._logsumexp(ll, 1) - math.log(mu.shape[1])),
    }


# ---- the strongest deterministic proxy: adaptive design with the ODE surrogate ----------------

AGRID = 24


def grid_table(path: str | None = None) -> tuple[np.ndarray, np.ndarray]:
    """ODE means and heuristic variances for every candidate in wetlab.GRID on an AGRID x AGRID
    parameter grid: two arrays (n_candidates, K, AGRID^2, 3). Takes a few minutes once;
    cached in memory and, if `path` is given, as an .npz file."""
    if "grid" in _cache:
        return _cache["grid"]
    if path:
        try:
            z = np.load(path)
            _cache["grid"] = (z["mu"], z["var"])
            return _cache["grid"]
        except OSError:
            pass
    g = (np.arange(AGRID) + 0.5) / AGRID
    u = np.stack(np.meshgrid(g, g, indexing="ij"), -1).reshape(-1, 2)
    h = np.repeat(np.arange(W.K), len(u))
    theta = W.theta_from_unit(h, np.tile(u, (W.K, 1)))
    mu, var = [], []
    for a in W.GRID:
        m = ode_mean(h, theta, a)
        made = np.clip(m - a["product_spike"], 0, a["substrate"])
        mu.append(m.reshape(W.K, len(u), -1))
        var.append((made * (1 - made / a["substrate"])).reshape(W.K, len(u), -1))
    _cache["grid"] = (np.array(mu), W.SIGMA ** 2 + np.array(var))
    if path:
        np.savez(path, mu=_cache["grid"][0], var=_cache["grid"][1])
    return _cache["grid"]


def _gauss_ll(y, mu, v):
    return (-0.5 * (y - mu) ** 2 / v - 0.5 * np.log(2 * math.pi * v)).sum(-1)


def run_coder_adaptive(seed: int, salt: str | None, table, n_candidates: int = 40,
                       n_outer: int = 48) -> tuple[W.WetLab, np.ndarray]:
    """'coder_adaptive': everything a strong agent could do WITHOUT stochastic simulation.
    Same candidate grid and stock rule as the reference, but the likelihood is the ODE curve +
    independent Gaussian noise (sigma^2 + binomial variance), marginalised over the parameter
    grid, and the design is chosen by expected information gain under that surrogate.
    Returns the lab (not yet submitted) and the surrogate posterior."""
    mu, var = table
    index = {repr(a): i for i, a in enumerate(W.GRID)}
    lab = W.WetLab(track_reference=False)
    lab.reset(seed, salt)
    rng = np.random.default_rng([seed, 0xC0DE])
    G = mu.shape[2]
    logw = np.full((W.K, G), -math.log(G)) + np.log(W.PRIOR)[:, None]     # joint log p(h, g | D)

    def post():
        lp = W._logsumexp(logw, 1)
        p = np.exp(lp - lp.max())
        return p / p.sum()

    while lab.can_run():
        cands = W._fair(W.GRID, lab.stock)
        if not cands:
            break
        if len(cands) > n_candidates:
            cands = [cands[i] for i in rng.choice(len(cands), n_candidates, replace=False)]
        p = post()
        lcond = logw - W._logsumexp(logw, 1)[:, None]                     # log p(g | h, D)
        best, best_gain = None, -np.inf
        for a in cands:
            c = index[repr(a)]
            gain = 0.0
            for k in range(W.K):
                if p[k] < 1e-6:
                    continue
                gi = rng.choice(G, n_outer, p=np.exp(lcond[k]))
                y = mu[c, k, gi] + np.sqrt(var[c, k, gi]) * rng.standard_normal((n_outer, 3))
                ll = _gauss_ll(y[:, None, None, :], mu[c][None], var[c][None])   # (n, K, G)
                lph = W._logsumexp(ll + lcond[None], 2)                          # (n, K)
                with np.errstate(divide="ignore"):
                    lm = W._logsumexp(lph + np.log(p)[None], 1)
                gain += p[k] * float((lph[:, k] - lm).mean())
            if gain > best_gain:
                best, best_gain = a, gain
        obs = lab.step(best)
        c = index[repr(best)]
        logw = logw + _gauss_ll(np.asarray(obs["result"]["readings"]), mu[c], var[c])
    return lab, post()
