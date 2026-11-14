"""Tests for Held-out C: the Virtual Chemistry Lab (bayesenv.chem_lab / chem_reward)."""

import math

import numpy as np
import pytest
from scipy.stats import norm

from bayesenv import chem_lab as C
from bayesenv.chem_reward import EPS, parse_belief

ACT = {"temperature": 330.0, "time": 20.0, "concentration": 0.3}


def play(seed, salt, actions):
    lab = C.ChemLab()
    lab.reset(seed, salt)
    for a in actions:
        lab.step(a)
    return lab


def test_determinism_same_seed_and_salt():
    acts = [ACT, [360, 5, 0.1], [300, 120, 1.0]]
    a, b = play(3, "s", acts), play(3, "s", acts)
    assert a.hidden == b.hidden and a.ys == b.ys
    assert C.reference_trajectory(3, "s") == C.reference_trajectory(3, "s")


def test_salt_changes_hidden_hypothesis():
    hidden = {play(0, f"salt{i}", []).hidden for i in range(40)}
    assert len(hidden) >= 4
    # and the salt is not the seed: different salts, same seed, differ somewhere
    assert any(play(s, "a", []).hidden != play(s, "b", []).hidden for s in range(20))


def test_hidden_matches_prior_frequencies():
    counts = np.bincount([C.NAMES.index(play(s, "f", []).hidden) for s in range(4000)],
                         minlength=C.K) / 4000
    assert np.abs(counts - C.PRIOR).max() < 0.03


def brute_force_posterior(xs, ys):
    logp = []
    for h in C.HYPOTHESES:
        lp = math.log(h.prior)
        for i, ((T, t, c), y) in enumerate(zip(xs, ys)):
            k = C.A0 * math.exp(-C.EA / (C.R * (T + h.dT))) * max(h.scale * c - h.delta, 0)
            k *= h.decay ** i
            lp += norm.logpdf(y, 1 - math.exp(-k * t), C.SIGMA)
        logp.append(lp)
    p = np.exp(np.array(logp) - max(logp))
    return p / p.sum()


def test_exact_posterior_sums_to_one_and_matches_brute_force():
    rng = np.random.default_rng(1)
    lab = C.ChemLab()
    lab.reset(7, "x")
    lo = np.array([C.BOUNDS[k][0] for k in C.KEYS])
    hi = np.array([C.BOUNDS[k][1] for k in C.KEYS])
    for n in range(C.BUDGET):
        lab.step(lo + (hi - lo) * rng.random(3))
        p = lab.posteriors[-1]
        assert abs(p.sum() - 1) < 1e-12 and np.all(p >= 0)
        np.testing.assert_allclose(p, brute_force_posterior([r[[0, 1, 2]] for r in lab.xs],
                                                            lab.ys), rtol=1e-8, atol=1e-12)
    assert len(lab.posteriors) == C.BUDGET + 1


def test_prior_submission_scores_zero():
    for s in range(20):
        lab = play(s, "p", [ACT, ACT])
        r = lab.submit(C.PRIOR, with_reference=False)
        assert r["reward"] == pytest.approx(0.0, abs=1e-12)
        assert r["design"] + r["inference"] == pytest.approx(r["reward"])


def test_truth_one_hot_scores_log_inverse_prior():
    for s in range(20):
        lab = play(s, "t", [ACT])
        q = {lab.hidden: 1.0}
        r = lab.submit(q, with_reference=False)
        h = C.NAMES.index(lab.hidden)
        assert r["reward"] == pytest.approx(math.log(1 / C.PRIOR[h]), abs=2 * EPS / C.PRIOR[h])
        assert r["accuracy"] == 1.0


def test_confident_wrong_answer_is_finite():
    lab = play(0, "w", [])
    wrong = next(n for n in C.NAMES if n != lab.hidden)
    r = lab.submit({wrong: 1.0}, with_reference=False)
    assert math.isfinite(r["reward"]) and r["reward"] < -3 and r["accuracy"] == 0.0


def test_decomposition_identity_and_exact_inference_is_near_zero():
    lab = C.run_policy("random", 5, "d")
    r = lab.result
    assert r["design"] + r["inference"] == pytest.approx(r["reward"])
    assert abs(r["inference"]) < 1e-2  # submitted the exact posterior: only eps-mixing remains


@pytest.mark.parametrize("bad", [
    {"temperature": float("nan"), "time": 10, "concentration": 0.5},
    {"temperature": 299.9, "time": 10, "concentration": 0.5},
    {"temperature": 350, "time": 121, "concentration": 0.5},
    {"temperature": 350, "time": 10, "concentration": 0.0},
    {"temperature": 350, "time": 10, "concentration": float("inf")},
    {"temperature": 350, "time": 10},
    {"temperature": 350, "time": 10, "concentration": 0.5, "extra": 1},
    {"temperature": "hot", "time": 10, "concentration": 0.5},
    {"temperature": True, "time": 10, "concentration": 0.5},
    [350, 10], "350,10,0.5", None,
])
def test_validation_rejects_bad_actions(bad):
    lab = C.ChemLab()
    lab.reset(0)
    with pytest.raises(ValueError):
        lab.step(bad)
    assert lab.remaining == C.BUDGET


def test_budget_and_episode_end_enforced():
    lab = play(0, None, [ACT] * C.BUDGET)
    with pytest.raises(RuntimeError):
        lab.step(ACT)
    lab.submit(C.PRIOR, with_reference=False)
    with pytest.raises(RuntimeError):
        lab.submit(C.PRIOR)


@pytest.mark.parametrize("bad", [[0.5] * 3, [-1] + [0.5] * 6, [0] * 7, [float("nan")] * 7,
                                 {"nominal": 1, "bogus": 0.1}, {"nominal": -1}, "nominal"])
def test_belief_validation(bad):
    with pytest.raises(ValueError):
        parse_belief(bad)


def test_belief_normalised_and_dict_list_equivalent():
    q = parse_belief([2] + [0] * 6)
    assert q[0] == 1.0
    assert np.allclose(parse_belief({"impurity": 3, "nominal": 1}),
                       parse_belief([1, 0, 0, 0, 0, 0, 3]))


def test_eig_matches_monte_carlo():
    p = C.PRIOR
    x = np.array([[320.0, 30.0, 0.2], [380.0, 120.0, 1.0]])  # informative, saturated
    e = C.eig(p, x, 3)
    rng = np.random.default_rng(0)
    h = rng.choice(C.K, 40000, p=p)
    mu = C.mean_yield(x, 3)
    for j in range(2):
        y = mu[h, j] + C.SIGMA * rng.standard_normal(len(h))
        ll = norm.logpdf(y[None, :], mu[:, j, None], C.SIGMA)
        marg = np.log(p @ np.exp(ll))
        mc = np.mean(ll[h, np.arange(len(h))] - marg)
        assert e[j] == pytest.approx(mc, abs=0.03)
    assert e[0] > 10 * e[1]  # saturated conditions are nearly useless


def test_reference_beats_random_on_average():
    ref = [C.run_policy("reference", s, "r").result for s in range(200)]
    rnd = [C.run_policy("random", s, "r").result for s in range(200)]
    d = np.array([a["reward"] - b["reward"] for a, b in zip(ref, rnd)])
    assert d.mean() > 3 * d.std() / np.sqrt(len(d))
    assert np.mean([a["accuracy"] for a in ref]) > np.mean([b["accuracy"] for b in rnd]) + 0.1
