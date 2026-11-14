"""Hierarchical lab: exactness of the reference posterior, reward properties, episode rules,
and that the reference beats random experiments and the three shortcut inferences.

    uv run --no-project --with numpy --with scipy --with pytest pytest -q tests/test_hier.py
"""

import math

import numpy as np
import pytest
from scipy.special import expit

from bayesenv import hier as H
from bayesenv import hier_reward as R

SALT = "test-salt"
MODEL = H.get_model()
CFG = MODEL.cfg


# ---- exact posterior vs an independent brute force ---------------------------------------

def brute_force(data, queries, cfg=CFG, n_mu=120, n_lt=80, n_z=801):
    """Posterior predictive by plain midpoint sums, sharing no code or grid with hier.py:
    (mu, log tau) on midpoint grids, and each theta through theta = mu + tau * z with z on a
    midpoint grid of the standard normal (hier.py uses Gauss-Legendre nodes and one fixed
    theta grid)."""
    mu = cfg.mu_lo + (np.arange(n_mu) + 0.5) * (cfg.mu_hi - cfg.mu_lo) / n_mu
    lt = math.log(cfg.tau_lo) + (np.arange(n_lt) + 0.5) * math.log(cfg.tau_hi / cfg.tau_lo) / n_lt
    MU, TAU = [a.ravel() for a in np.meshgrid(mu, np.exp(lt), indexing="ij")]
    z = -9 + (np.arange(n_z) + 0.5) * 18 / n_z
    wz = np.exp(-0.5 * z * z)
    wz /= wz.sum()
    TH = MU[:, None] + TAU[:, None] * z[None, :]                     # (P, Z)

    def lik(u):
        L = np.ones_like(TH)
        for (uu, x, y) in data:
            if uu == u:
                p = expit(cfg.slopes[u] * (x - TH))
                L *= p if y else 1 - p
        return L

    units = sorted({u for u, _, _ in data})
    m = {u: lik(u) @ wz for u in units}                              # marginal likelihood per unit
    post = np.ones(len(MU))                                          # flat hyperprior on the grid
    for u in units:
        post = post * m[u]
    post /= post.sum()
    out = []
    for (u, a, x) in queries:
        if u < 0:
            out.append(post @ (expit(a * (x - TH)) @ wz))
        elif u in m:
            out.append(post @ ((lik(u) * expit(cfg.slopes[u] * (x - TH))) @ wz / m[u]))
        else:
            out.append(post @ (expit(cfg.slopes[u] * (x - TH)) @ wz))
    return np.array(out)


def test_exact_posterior_matches_brute_force():
    data = [(3, 0.5, 1), (3, -1.0, 0), (3, 0.0, 1), (7, -2.0, 1), (7, -3.5, 0), (2, 1.5, 0),
            (0, 2.0, 1), (0, -4.0, 0)]
    b = H.Belief(MODEL)
    for u, x, y in data:
        b.update(u, x, y)
    queries = [(3, 4.0, -0.2), (3, 4.0, 0.4), (7, 4.0, -2.8), (2, 2.0, 0.0), (0, 0.5, -1.0),
               (5, 1.0, 0.7),                       # a known unit that was never tested
               (-1, 4.0, -1.0), (-1, 4.0, 0.3), (-1, 4.0, 2.5), (-1, 0.5, 0.0)]
    u, a, x = map(np.array, zip(*queries))
    got = b.predict(u, a.astype(float), x.astype(float))
    want = brute_force(data, queries)
    assert np.max(np.abs(got - want)) < 2e-4, np.abs(got - want)
    # and the posterior is not the prior, nor any of the shortcuts, on these queries
    for other in (MODEL.prior_predictive(np.where(u < 0, a, MODEL.slopes[np.maximum(u, 0)]), x),
                  b.predict_no_pooling(u, a, x), b.predict_complete_pooling(u, a, x),
                  b.predict_plugin(u, a, x)):
        assert np.max(np.abs(other - want)) > 0.02


def test_prior_predictive_matches_brute_force_and_no_data_posterior():
    queries = [(-1, 4.0, -1.0), (-1, 4.0, 3.0), (4, 0.5, 0.0), (11, 4.0, -5.0)]
    u, a, x = map(np.array, zip(*queries))
    sl = np.where(u < 0, a, MODEL.slopes[np.maximum(u, 0)])
    p0 = MODEL.prior_predictive(sl, x.astype(float))
    assert np.max(np.abs(p0 - brute_force([], queries))) < 2e-4
    assert np.allclose(H.Belief(MODEL).predict(u, a, x.astype(float)), p0, atol=1e-12)


def test_utility_is_information_and_finite():
    b = H.Belief(MODEL)
    U = b.utility()
    assert U.shape == (MODEL.K, len(MODEL.xc)) and np.all(np.isfinite(U)) and np.all(U >= 0)
    # before any data, units with the same slope are interchangeable
    assert np.allclose(U[0], U[4]) and np.allclose(U[3], U[11])
    # a design far outside where thresholds can be tells nothing
    assert U[3, 0] < 1e-3 * U[3].max()


# ---- reward ------------------------------------------------------------------------------

def test_prior_scores_exactly_zero():
    lab = H.run_policy("prior", 3, SALT)
    assert lab.result["raw"] == 0.0 and lab.result["reward"] == 0.0
    assert lab.result["raw_a"] == 0.0 and lab.result["raw_b"] == 0.0
    # the agent can compute it from the disclosed model alone
    lab = H.HierLab()
    lab.reset(3, SALT)
    qs = lab.finish()
    slopes = np.array([q["slope"] for q in qs])
    xs = np.array([q["design"] for q in qs])
    assert abs(lab.submit(MODEL.prior_predictive(slopes, xs).tolist())["raw"]) < 1e-12


def test_score_bounded_and_clamped():
    for seed in range(5):
        for q in (0.0, 1.0, 0.5):
            lab = H.HierLab()
            lab.reset(seed, SALT)
            n = len(lab.finish())
            r = lab.submit([q] * n)
            assert 0.0 <= r["reward"] <= 1.0 and math.isfinite(r["raw"])
            assert r["gain_nats"] >= math.log(R.P_MIN) - 1e-9
        lab = H.run_policy("reference", seed, SALT)
        assert 0.0 <= lab.result["reward"] <= 1.0
        assert lab.result["reward"] == min(1.0, max(0.0, lab.result["raw"]))


def test_knowing_the_truth_is_the_maximum_and_exact_posterior_is_proper():
    lab = H.run_policy("reference", 1, SALT)
    truth = lab.score_only(lab._p_true)
    assert truth["raw"] >= lab.result["raw"] and truth["raw"] > 0
    rng = np.random.default_rng(0)
    for _ in range(20):
        q = np.clip(lab._p_true + 0.1 * rng.standard_normal(len(lab._p_true)), 0, 1)
        assert lab.score_only(q)["raw"] <= truth["raw"] + 1e-12


def test_norm_constants_match_the_configuration():
    za, zb = H.estimate_norm(MODEL, 40_000, seed=1)
    assert abs(za / R.NORM_A - 1) < 0.05 and abs(zb / R.NORM_B - 1) < 0.05


# ---- episode rules -----------------------------------------------------------------------

def play(seed, salt, actions):
    lab = H.HierLab()
    lab.reset(seed, salt)
    ys = [lab.step(a)["result"]["outcome"] for a in actions]
    return lab, ys


def test_deterministic_under_seed_and_salt():
    acts = [{"unit": i % CFG.k, "design": -3.0 + 0.5 * i} for i in range(CFG.budget)]
    a, ya = play(5, SALT, acts)
    b, yb = play(5, SALT, acts)
    assert ya == yb and a.hidden == b.hidden and a.finish() == b.finish()
    c, _ = play(5, "another-salt", acts)
    assert c.hidden != a.hidden and c.queries() != a.queries()
    d, _ = play(6, SALT, acts)
    assert d.hidden != a.hidden
    r1, r2 = H.reference_trajectory(5, SALT), H.reference_trajectory(5, SALT)
    assert r1["history"] == r2["history"] and r1["result"] == r2["result"]


def test_hidden_draws_follow_the_disclosed_model():
    hid = []
    for s in range(300):
        lab = H.HierLab()
        lab.reset(s, SALT)
        hid.append((lab._mu, lab._tau, *lab._theta))
        assert CFG.mu_lo <= lab._mu <= CFG.mu_hi and CFG.tau_lo <= lab._tau <= CFG.tau_hi
    hid = np.array(hid)
    assert abs(hid[:, 0].mean()) < 0.3
    assert abs(np.log(hid[:, 1]).mean() - 0.5 * math.log(CFG.tau_lo * CFG.tau_hi)) < 0.12
    z = (hid[:, 2:] - hid[:, :1]) / hid[:, 1:2]
    assert abs(z.mean()) < 0.06 and abs(z.std() - 1) < 0.06


@pytest.mark.parametrize("bad", [
    {"unit": CFG.k, "design": 0.0}, {"unit": -1, "design": 0.0}, {"unit": 1.5, "design": 0.0},
    {"unit": True, "design": 0.0}, {"unit": 0, "design": 99.0}, {"unit": 0, "design": float("nan")},
    {"unit": 0, "design": "x"}, {"unit": 0}, [0, 0.0], {"unit": 0, "design": 0.0, "extra": 1}])
def test_invalid_actions_rejected_without_consuming_budget(bad):
    lab = H.HierLab()
    lab.reset(0, SALT)
    with pytest.raises(ValueError):
        lab.step(bad)
    assert lab.remaining == CFG.budget and not lab.history


def test_budget_phase_and_single_submission_enforced():
    lab = H.HierLab()
    lab.reset(0, SALT)
    for _ in range(CFG.budget):
        lab.step({"unit": 0, "design": 0.0})
    with pytest.raises(RuntimeError):
        lab.step({"unit": 0, "design": 0.0})
    n = len(lab.finish())
    assert n == CFG.n_a + CFG.n_b
    for bad in ([0.5] * (n - 1), [1.5] * n, [float("nan")] * n, "0.5", None, [[0.5]] * n):
        with pytest.raises(ValueError):
            lab.submit(bad)
    assert lab.result is None                      # a rejected submission does not count
    lab.submit([0.5] * n)
    with pytest.raises(RuntimeError):
        lab.submit([0.5] * n)
    # finishing early ends the experiment phase
    lab = H.HierLab()
    lab.reset(0, SALT)
    lab.step({"unit": 1, "design": 0.0})
    lab.finish()
    with pytest.raises(RuntimeError):
        lab.step({"unit": 1, "design": 0.0})


def test_queries_do_not_leak_and_rules_are_complete():
    lab = H.HierLab()
    obs = lab.reset(0, SALT)
    text = str(obs)
    for needle in ("Uniform(-3.0, 3.0)", "log 0.2", "Normal(mean = mu, sd = tau)", "Bernoulli",
                   "prior predictive", str(R.NORM_A), str(R.NORM_B)):
        assert needle in text, needle
    qs = lab.finish()
    assert {q["kind"] for q in qs} == {"known_unit", "new_unit"}
    assert all(set(q) == {"id", "kind", "unit", "slope", "design"} for q in qs)
    assert all(q["slope"] == CFG.slopes[q["unit"]] for q in qs if q["unit"] is not None)


# ---- the reference is better than the alternatives ----------------------------------------

def test_reference_beats_random_and_the_shortcuts():
    rows = [H.evaluate_seed(s, SALT, MODEL, ("reference", "random", "no_pooling", "complete_pooling"))
            for s in range(40)]
    raw = lambda k: np.array([r[k][0] for r in rows])
    ref = raw("reference")
    assert ref.mean() > 0.6
    for k, margin in (("random", 0.1), ("no_pooling", 0.2), ("complete_pooling", 0.1),
                      ("reference+no_pooling", 0.2), ("reference+complete_pooling", 0.1),
                      ("reference+plugin", 0.01)):
        d = ref - raw(k)
        assert d.mean() > margin, (k, d.mean())
    # no pooling learns nothing about new units; plug-in loses on new units specifically
    assert all(abs(r["no_pooling"][2]) < 1e-9 for r in rows)
    assert np.mean([r["reference"][2] - r["reference+plugin"][2] for r in rows]) > 0.02
