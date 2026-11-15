"""SERVER-ONLY: the hidden score generator. Per desk seed: segment means per check (credit_core.Inst(desk).mu),
and per check one noise family from {gauss, t3, cauchy} (at least one Cauchy) with a scale."""
import hashlib
import numpy as np
from scipy import stats
import credit_core as cc

CHECKS = ["bureau", "income", "bank"]
SWAP_P = 0.0
_DIST = {"gauss": stats.norm, "t3": stats.t(3), "cauchy": stats.cauchy}


def rng_of(*parts) -> np.random.Generator:
    h = hashlib.sha256("|".join(map(str, parts)).encode()).digest()
    return np.random.default_rng(int.from_bytes(h[:8], "little"))


def desk_model(desk: int) -> dict:
    """generator v2: base locations credit_core.Inst(desk).mu, then per check a random offset U(-50, 50), segment
    jitter N(0, 12) and, with probability SWAP_P (0 in v2), one adjacent pair of segments swapped; rounded to 1. Per check one noise family (at least one Cauchy) and a scale."""
    mu = cc.Inst(desk).mu
    r = rng_of("desk", desk)
    fams = list(r.permutation(["cauchy", "t3", str(r.choice(["cauchy", "gauss"]))]))
    out = {}
    for e, c in enumerate(CHECKS):
        f = str(fams[e])
        lo, hi = {"cauchy": (30, 55), "t3": (35, 60), "gauss": (60, 100)}[f]
        scale = float(round(r.uniform(lo, hi)))
        loc = mu[e] + r.uniform(-50, 50) + r.normal(0, 12, cc.K)
        if r.random() < SWAP_P:
            k = int(r.integers(0, cc.K - 1))
            loc[k], loc[k + 1] = loc[k + 1], loc[k]
        out[c] = dict(family=f, mu=[float(round(v)) for v in loc], scale=scale)
    return out


def true_tables(model) -> np.ndarray:
    """exact P(band | segment, check) from the CDF, shape (E, K, B)"""
    out = []
    for c in CHECKS:
        m = model[c]
        mu = np.asarray(m["mu"])
        F = _DIST[m["family"]].cdf((cc.EDGES[None, :] - mu[:, None]) / m["scale"])
        F = np.concatenate([np.zeros((cc.K, 1)), F, np.ones((cc.K, 1))], 1)
        out.append(np.clip(np.diff(F, axis=1), 1e-300, 1))
    return np.stack(out)


def draw_scores(model, check, seg, u):
    m = model[check]
    return np.asarray(m["mu"])[seg] + m["scale"] * _DIST[m["family"]].ppf(u)
