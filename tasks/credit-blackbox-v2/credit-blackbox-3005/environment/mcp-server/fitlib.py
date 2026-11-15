"""Public-information model fitting for the loan-book task (used by the reference agent and, identically, by the
server to compute the reference value). Nothing here touches hidden state.

Model family (stated in the instructions): score = mu[check, segment] + scale[check] * Z, Z one of
Gaussian, Student-t(3), Cauchy (standard), chosen per check. Fit by maximum likelihood per check and family
(6 means + 1 log-scale; same parameter count for every family, so max likelihood = AIC choice).
"""
import numpy as np
from scipy import stats, optimize

import credit_core as cc

FAMILIES = ("gauss", "t3", "cauchy")
_DIST = {"gauss": stats.norm, "t3": stats.t(3), "cauchy": stats.cauchy}


def std_cdf(z, fam):
    return _DIST[fam].cdf(z)


def std_logpdf(z, fam):
    return _DIST[fam].logpdf(z)


def bin_probs_family(mu, scale, fam):
    mu = np.asarray(mu, float)
    F = std_cdf((cc.EDGES[None, :] - mu[:, None]) / scale, fam)
    F = np.concatenate([np.zeros((len(mu), 1)), F, np.ones((len(mu), 1))], 1)
    return np.clip(np.diff(F, axis=1), 1e-300, 1)


def fit_check(x, seg, fam):
    """MLE of 6 segment locations + one scale for one check; returns (mu, scale, loglik)."""
    x = np.asarray(x, float); seg = np.asarray(seg, int)
    med = np.array([np.median(x[seg == k]) for k in range(cc.K)])
    mad = np.median(np.abs(x - med[seg])) * 1.4826 + 1e-6

    def nll(p):
        mu, ls = p[:cc.K], p[cc.K]
        s = np.exp(ls)
        return -(std_logpdf((x - mu[seg]) / s, fam).sum() - len(x) * ls)

    p0 = np.concatenate([med, [np.log(mad if fam != "cauchy" else mad / 1.48)]])
    r = optimize.minimize(nll, p0, method="L-BFGS-B")
    return r.x[:cc.K], float(np.exp(r.x[cc.K])), float(-r.fun)


def fit_book(book, families=FAMILIES, gauss_naive=False):
    """book: dict with 'segment' (list of 'S1'..'S6') and per-check score lists under 'scores'[check].
    Returns {check: {family, mu(list), scale, loglik{fam: ll}}}.
    gauss_naive=True: the 'Gaussian attractor' - per-segment sample means and pooled sample sd."""
    seg = np.array([int(s[1:]) - 1 for s in book["segment"]])
    out = {}
    for c in book["checks"]:
        x = np.array(book["scores"][c], float)
        if gauss_naive:
            mu = np.array([x[seg == k].mean() for k in range(cc.K)])
            sd = float(np.sqrt(np.mean((x - mu[seg]) ** 2)))
            out[c] = dict(family="gauss", mu=mu.tolist(), scale=sd, loglik={})
            continue
        fits = {f: fit_check(x, seg, f) for f in families}
        best = max(fits, key=lambda f: fits[f][2])
        out[c] = dict(family=best, mu=fits[best][0].tolist(), scale=fits[best][1],
                      loglik={f: fits[f][2] for f in fits})
    return out


class ModelInst:
    """Minimal instance for credit_core.Solver: prior + per-check bin likelihoods under a given model."""

    def __init__(self, prior, model, checks, key="m"):
        self.prior = np.asarray(prior, float) / np.sum(prior)
        self.L = {key: np.stack([bin_probs_family(model[c]["mu"], model[c]["scale"], model[c]["family"])
                                 for c in checks])}
