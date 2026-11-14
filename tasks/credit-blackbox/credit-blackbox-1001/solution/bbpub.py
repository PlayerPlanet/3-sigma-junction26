"""Public helpers for the black-box credit task (no hidden information): band-table estimation from sandbox
counts, a guessed model, and a Solver-compatible instance built from band tables."""
import numpy as np
from scipy import stats

import credit_core as cc

CHECKS = ["bureau", "income", "bank"]
SEGMENTS = [f"S{i + 1}" for i in range(cc.K)]
ALPHA = 0.5          # Dirichlet pseudo-count per band (Jeffreys)


class TableInst:
    """prior + band-likelihood table P(band | segment, check), shape (E, K, B), for credit_core.Solver(.., 'm', PR)"""

    def __init__(self, prior, table):
        self.prior = np.asarray(prior, float) / np.sum(prior)
        self.L = {"m": np.clip(np.asarray(table, float), 1e-12, 1)}


def estimate_tables(counts, alpha=ALPHA):
    """counts (E, K, B) of sandbox bands -> Dirichlet posterior-mean band tables"""
    c = np.asarray(counts, float) + alpha
    return c / c.sum(-1, keepdims=True)


def guessed_gaussian_tables(sd=60.0, top=790.0, bottom=590.0):
    """'no calibration' guess: segment means evenly spaced from top (S1) to bottom (S6), Gaussian noise, same for
    every check"""
    mu = np.linspace(top, bottom, cc.K)
    F = stats.norm.cdf((cc.EDGES[None, :] - mu[:, None]) / sd)
    F = np.concatenate([np.zeros((cc.K, 1)), F, np.ones((cc.K, 1))], 1)
    t = np.diff(F, axis=1)
    return np.stack([t] * cc.E)


def fit_samples(samples, families=("gauss", "t3", "cauchy")):
    """samples: {check: [(segment_index, raw_score), ...]} from the sandbox. Location-shift model per check:
    6 segment locations + one scale, family chosen by maximum likelihood (same parameter count for all).
    Returns band tables (E, K, B) and the fitted parameters."""
    import fitlib as F
    tabs, params = [], {}
    for c in CHECKS:
        seg = np.array([s for s, _ in samples[c]], int); x = np.array([v for _, v in samples[c]], float)
        fits = {f: F.fit_check(x, seg, f) for f in families}
        best = max(fits, key=lambda f: fits[f][2])
        mu, sc, _ = fits[best]
        params[c] = dict(family=best, mu=[float(v) for v in mu], scale=sc, loglik={f: fits[f][2] for f in fits})
        tabs.append(F.bin_probs_family(mu, sc, best))
    return np.stack(tabs), params


def naive_gaussian_fit(samples):
    """the 'Gaussian attractor': per-segment sample mean, pooled sample sd, Gaussian bands"""
    import fitlib as F
    tabs = []
    for c in CHECKS:
        seg = np.array([s for s, _ in samples[c]], int); x = np.array([v for _, v in samples[c]], float)
        mu = np.array([x[seg == k].mean() for k in range(cc.K)])
        sd = float(np.sqrt(np.mean((x - mu[seg]) ** 2)))
        tabs.append(F.bin_probs_family(mu, sd, "gauss"))
    return np.stack(tabs)


def fit_empirical(samples, alpha=0.5):
    """FAIR REFERENCE (uses only the stated structure: per check, score = location(segment) + noise, noise
    symmetric and identical for all segments). Location = median of the sandbox draws for each (segment, check);
    per check, residuals x - median pooled over the 6 segments and symmetrised (r and -r); band probabilities for
    segment k = share of (location_k + r) in each band, with `alpha` pseudo-counts per band. Returns (E, K, B)."""
    tabs, params = [], {}
    for c in CHECKS:
        seg = np.array([s for s, _ in samples[c]], int); x = np.array([v for _, v in samples[c]], float)
        loc = np.array([np.median(x[seg == k]) for k in range(cc.K)])
        r = x - loc[seg]
        r = np.concatenate([r, -r])
        t = np.empty((cc.K, cc.B))
        for k in range(cc.K):
            b = np.searchsorted(cc.EDGES, loc[k] + r, side="right")
            cnt = np.bincount(b, minlength=cc.B).astype(float)
            t[k] = (cnt / 2 + alpha) / (len(r) / 2 + alpha * cc.B)
        tabs.append(t)
        params[c] = dict(location=loc.tolist(), n_residuals=int(len(r) // 2))
    return np.stack(tabs), params


def median_fixed_gauss(samples, sd=60.0):
    """simple strategy: median location per cell + a fixed Gaussian band table of sd 60"""
    import fitlib as F
    tabs = []
    for c in CHECKS:
        seg = np.array([s for s, _ in samples[c]], int); x = np.array([v for _, v in samples[c]], float)
        loc = np.array([np.median(x[seg == k]) for k in range(cc.K)])
        tabs.append(F.bin_probs_family(loc, sd, "gauss"))
    return np.stack(tabs)
