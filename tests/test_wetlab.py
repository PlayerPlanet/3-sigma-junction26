"""Tests for Held-out D: the Wetlab (bayesenv.wetlab / wetlab_reward / wetlab_baselines)."""

import math

import numpy as np
import pytest

from bayesenv import wetlab as W
from bayesenv import wetlab_baselines as WB
from bayesenv.wetlab_reward import EPS, parse_belief

ACT = {"substrate": 150, "catalyst": 6, "product_spike": 0, "temperature": 300.0,
       "sample_times": [4.0, 12.0, 35.0]}
SMALL = {"n_particles": 96, "n_inner": 4}


def play(seed, salt, actions, track=False):
    lab = W.WetLab(track_reference=track, **SMALL)
    lab.reset(seed, salt)
    for a in actions:
        lab.step(a)
    return lab


# ---- engine ------------------------------------------------------------------------------

def test_ssa_first_order_matches_binomial():
    # S + C -> P + C with constant C: P(t) ~ Binomial(S0, 1 - exp(-k C t)) exactly
    n, k = 20000, 0.01
    h = np.zeros(n, int)
    u = np.full((n, 2), math.log(k / W.K1_RANGE[0]) / math.log(W.K1_RANGE[1] / W.K1_RANGE[0]))
    P = W.simulate_runs(h, u, ACT, np.random.default_rng(0), 3)
    p = 1 - np.exp(-k * 6 * np.array(ACT["sample_times"]))
    assert np.abs(P.mean(0) - 150 * p).max() < 0.25
    assert np.abs(P.var(0) / (150 * p * (1 - p)) - 1).max() < 0.05


def test_ssa_conserves_mass_and_stays_nonnegative():
    rng = np.random.default_rng(1)
    n = 600
    h = np.repeat(np.arange(W.K), n // W.K)
    x = W.simulate(W.initial_state(np.full(n, 150), 6, 20),
                   W.rate_matrix(h, W.theta_from_unit(h, rng.random((n, 2))), np.full(n, 310.0)),
                   np.tile(W.pad_times(ACT["sample_times"]), (n, 1)), W._np_uniform(rng))
    assert (x >= 0).all()
    S, P, C, I, X, SC = (x[:, :, i] for i in range(W.NS))
    assert np.all(S + P + I + SC == 170) and np.all(C + X + SC == 6)


def test_ode_proxy_matches_ssa_mean_for_linear_network():
    n = 4000
    h = np.full(n, W.NAMES.index("intermediate"))
    u = np.full((n, 2), 0.5)
    P = W.simulate_runs(h, u, ACT, np.random.default_rng(2), 3).mean(0)
    mu = WB.ode_mean(h[:1], W.theta_from_unit(h[:1], u[:1]), ACT)[0]
    assert np.abs(P - mu).max() < 1.0


def test_cross_check_against_gillespy2():
    g = pytest.importorskip("gillespy2")
    k1, kr = 0.01, 0.005
    m = g.Model(name="reversible")
    m.add_species([g.Species(name="S", initial_value=150), g.Species(name="P", initial_value=0),
                   g.Species(name="C", initial_value=6)])
    m.add_parameter([g.Parameter(name="k1", expression=k1), g.Parameter(name="kr", expression=kr)])
    m.add_reaction([
        g.Reaction(name="f", reactants={"S": 1, "C": 1}, products={"P": 1, "C": 1}, rate="k1"),
        g.Reaction(name="r", reactants={"P": 1, "C": 1}, products={"S": 1, "C": 1}, rate="kr")])
    m.timespan(g.TimeSpan.linspace(t=35, num_points=36))
    res = m.run(solver=g.NumPySSASolver, number_of_trajectories=300, seed=3)
    ref = np.array([[tr["P"][4], tr["P"][12], tr["P"][35]] for tr in res])
    n = 4000
    h = np.full(n, W.NAMES.index("reversible"))
    th = np.tile([k1, kr / k1], (n, 1))
    x = W.simulate(W.initial_state(np.full(n, 150), 6, 0), W.rate_matrix(h, th, np.full(n, W.T0)),
                   np.tile([4.0, 12.0, 35.0], (n, 1)), W._np_uniform(np.random.default_rng(3)))
    ours = x[:, :, W.iP]
    se = ref.std(0) / math.sqrt(len(ref))
    assert np.all(np.abs(ours.mean(0) - ref.mean(0)) < 5 * se)
    assert np.all(np.abs(ours.std(0) / ref.std(0) - 1) < 0.25)


# ---- environment ---------------------------------------------------------------------------

def test_determinism_same_seed_and_salt():
    acts = [ACT, {**ACT, "catalyst": 2, "product_spike": 30, "temperature": 310}]
    a, b = play(3, "s", acts, track=True), play(3, "s", acts, track=True)
    assert a.hidden == b.hidden and a.hidden_params == b.hidden_params
    assert a.readings == b.readings
    assert np.array_equal(a.posteriors[-1], b.posteriors[-1])


def test_salt_changes_hidden_draw():
    labs = [play(0, f"salt{i}", []) for i in range(40)]
    assert len({lab.hidden for lab in labs}) >= 4
    assert len({tuple(lab._u) for lab in labs}) == 40
    assert play(0, "a", [ACT]).readings != play(0, "b", [ACT]).readings


def test_hidden_matches_prior_frequencies():
    counts = np.bincount([W.NAMES.index(play(s, "f", []).hidden) for s in range(3000)],
                         minlength=W.K) / 3000
    assert np.abs(counts - W.PRIOR).max() < 0.03


def test_rules_disclose_everything_but_the_hidden_draw():
    r = W.rules()
    assert [m["name"] for m in r["mechanisms"]] == list(W.NAMES)
    assert r["stock"] == W.STOCK and r["constants"]["sigma"] == W.SIGMA
    lab = play(5, "x", [])
    obs = lab.step(ACT)
    text = repr(obs)
    assert "reference_posterior" not in obs            # track_reference=False (MCP setting)
    assert "hidden" not in text and str(lab.hidden_params["k1"]) not in text


@pytest.mark.parametrize("bad", [
    {**ACT, "substrate": float("nan")}, {**ACT, "substrate": 1000}, {**ACT, "substrate": 150.5},
    {**ACT, "catalyst": 7},
    {**ACT, "catalyst": 0}, {**ACT, "catalyst": True}, {**ACT, "temperature": float("inf")},
    {**ACT, "temperature": 400}, {**ACT, "product_spike": -1}, {**ACT, "sample_times": []},
    {**ACT, "sample_times": [5, 5]}, {**ACT, "sample_times": [10, 5]},
    {**ACT, "sample_times": [1, 2, 3, 4, 5, 6, 7]}, {**ACT, "sample_times": [float("nan")]},
    {**ACT, "sample_times": [100]}, {**ACT, "sample_times": "5"}, {**ACT, "extra": 1},
    {k: v for k, v in ACT.items() if k != "catalyst"}, [150, 6, 0, 300, [5]], "run", None,
])
def test_invalid_actions_rejected_without_consuming_stock(bad):
    lab = play(1, "x", [ACT])
    before = dict(lab.stock)
    with pytest.raises(ValueError):
        lab.step(bad)
    assert lab.stock == before and len(lab.actions) == 1


def test_product_spike_is_optional():
    a = {k: v for k, v in ACT.items() if k != "product_spike"}
    assert W.validate(a)["product_spike"] == 0


def test_stock_enforced():
    lab = play(2, "x", [])
    big = {**ACT, "substrate": 200, "catalyst": 1, "sample_times": [5.0]}
    for _ in range(3):
        obs = lab.step(big)
    assert obs["stock_remaining"]["substrate"] == 0 and not obs["can_run"]
    before = dict(lab.stock)
    with pytest.raises(RuntimeError):
        lab.step({**ACT, "substrate": 20})
    assert lab.stock == before
    tiny = {**ACT, "substrate": 20, "catalyst": 1, "sample_times": [5.0]}
    lab = play(2, "x", [{**tiny, "sample_times": [1, 2, 3, 4, 5, 6]}] * 2)   # all assay kits
    with pytest.raises(RuntimeError):
        lab.step(tiny)
    lab = play(2, "x", [tiny] * W.STOCK["vessels"])
    with pytest.raises(RuntimeError):                                        # no vessels left
        lab.step(tiny)
    lab = play(2, "x", [{**tiny, "catalyst": 6}] * 2)                         # 4 catalyst left
    with pytest.raises(RuntimeError):
        lab.step({**tiny, "catalyst": 6})


def test_single_submission_and_no_steps_after():
    lab = play(4, "x", [ACT])
    lab.submit(W.PRIOR, reference=False, diagnostics=False)
    with pytest.raises(RuntimeError):
        lab.submit(W.PRIOR, reference=False)
    with pytest.raises(RuntimeError):
        lab.step(ACT)


# ---- reward --------------------------------------------------------------------------------

def test_prior_scores_exactly_zero():
    for seed in range(5):
        lab = play(seed, "x", [ACT])
        assert lab.submit(W.PRIOR, reference=False, diagnostics=False)["reward"] == 0.0
    assert W.run_policy("prior", 0, "x").result["reward"] == 0.0


def test_worst_and_best_case_are_finite():
    lab = play(6, "x", [])
    wrong = {n: float(n != lab.hidden) for n in W.NAMES}
    r = lab.submit(wrong, reference=False, diagnostics=False)
    assert r["reward"] == pytest.approx(math.log(EPS)) and r["accuracy"] == 0.0
    lab = play(6, "x", [])
    r = lab.submit({lab.hidden: 1.0}, reference=False, diagnostics=False)
    assert r["reward"] == pytest.approx(r["max_reward"]) and 1.78 < r["reward"] < math.log(W.K)
    assert r["accuracy"] == 1.0


def test_reward_does_not_depend_on_approximate_posterior():
    q = np.array([0.3, 0.1, 0.2, 0.1, 0.2, 0.1])
    a = play(7, "x", [ACT]).submit(q, reference=False, diagnostics=False)
    b = play(7, "x", [ACT]).submit(q, reference=False, diagnostics=True)
    assert a["reward"] == b["reward"] and "approx_posterior" in b
    assert b["approx_design"] + b["approx_inference"] == pytest.approx(b["reward"])


@pytest.mark.parametrize("bad", [
    {"nope": 1.0}, [0.5, 0.5], [float("nan")] * 6, [-1, 1, 1, 1, 1, 1], [0] * 6, "first_order"])
def test_bad_submissions_rejected(bad):
    with pytest.raises(ValueError):
        parse_belief(bad)
    lab = play(8, "x", [])
    with pytest.raises(ValueError):
        lab.submit(bad, reference=False)
    assert lab.result is None                         # a rejected submission is not consumed


# ---- inference and policies ----------------------------------------------------------------

def test_belief_and_eig_are_sane():
    b = W.Belief(np.random.default_rng(0), **SMALL)
    assert np.allclose(b.posterior(), W.PRIOR)
    g = W.eig(b, W.GRID[:6], 32)
    assert g.shape == (6,) and np.all(np.isfinite(g)) and np.all(g < math.log(W.K) + 0.2)
    b.update(ACT, [30.0, 70.0, 120.0])
    p = b.posterior()
    assert p.sum() == pytest.approx(1.0) and np.all(p >= 0)


def test_coder_proxies_return_distributions():
    lab = W.run_policy("fixed", 0, "t", **SMALL)
    for q in WB.coder_posteriors(lab.readings).values():
        assert q.shape == (W.K,) and q.sum() == pytest.approx(1.0) and np.all(q >= 0)


def test_policies_respect_stock_and_reference_beats_random():
    seeds = range(6)
    rew = {p: [] for p in ("reference", "random")}
    for s in seeds:
        for p in rew:
            lab = W.run_policy(p, s, "test", **SMALL)
            assert all(v >= 0 for v in lab.stock.values()) and lab.result["n_runs"] >= 3
            rew[p].append(lab.result["reward"])
    assert np.mean(rew["reference"]) > np.mean(rew["random"])
    assert np.mean(rew["reference"]) > 0.3


def test_trajectory_helper_shapes():
    tr = W.simulate_trajectories("autocatalytic", {"k1": 0.003, "ka": 5e-4}, ACT, n=5, points=30)
    assert len(tr["t"]) == 30 and np.array(tr["P"]).shape == (5, 30)
    lab = play(9, "x", [])
    assert np.array(lab.true_trajectories(ACT, n=3, points=10)["S"]).shape == (3, 10)
