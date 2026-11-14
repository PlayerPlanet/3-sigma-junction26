"""SERVER-ONLY: the hidden score generator. Per desk seed: segment means per check (credit_core.Inst(desk).mu),
and per check one noise family from {gauss, t3, cauchy} (at least one Cauchy) with a scale."""
import hashlib
import numpy as np
from scipy import stats
import credit_core as cc

CHECKS = ["bureau", "income", "bank"]
_DIST = {"gauss": stats.norm, "t3": stats.t(3), "cauchy": stats.cauchy}


def rng_of(*parts) -> np.random.Generator:
    h = hashlib.sha256("|".join(map(str, parts)).encode()).digest()
    return np.random.default_rng(int.from_bytes(h[:8], "little"))


def desk_model(desk: int) -> dict:
    mu = cc.Inst(desk).mu
    r = rng_of("desk", desk)
    fams = list(r.permutation(["cauchy", "t3", str(r.choice(["cauchy", "gauss"]))]))
    out = {}
    for e, c in enumerate(CHECKS):
        f = fams[e]
        lo, hi = {"cauchy": (30, 55), "t3": (35, 60), "gauss": (60, 100)}[f]
        out[c] = dict(family=f, mu=[float(v) for v in mu[e]], scale=float(round(r.uniform(lo, hi))))
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
