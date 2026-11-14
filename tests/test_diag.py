"""Diagnostic lab (bayesenv.diag): exact posterior, information gain, exact DP, lab rules."""

import itertools

import numpy as np
import pytest

from bayesenv import diag as D

TB = D.load_table("low_yield")
CONTROL = TB.by_role("control")[0]


def tiny_table(seed=0, n_tests=4):
    """3 causes x 2 nuisance states, a few binary/ternary tests with random likelihoods."""
    rng = np.random.default_rng(seed)
    C, N = 3, 2
    lik = [rng.dirichlet(np.ones(k), size=(C, N)) for k in ([2, 3, 2, 2, 3][:n_tests])]
    return D.Table(name="tiny", causes=["a", "b", "c"], prior=rng.dirichlet(np.ones(C) * 3),
                   nuisances=["n0", "n1"], p_nuis=rng.dirichlet(np.ones(N), size=C),
                   tests=[f"t{i}" for i in range(n_tests)],
                   costs=np.array([1.0, 2.0, 1.0, 3.0, 2.0][:n_tests]),
                   outcomes=[[f"o{j}" for j in range(a.shape[2])] for a in lik], lik=lik,
                   budget=4.0)


def brute_force_cause_posterior(tb, obs):
    """Sum over every hidden (cause, nuisance) pair with plain Python loops."""
    post = []
    for c in range(tb.C):
        tot = 0.0
        for n in range(len(tb.nuisances)):
            p = tb.prior[c] * tb.p_nuis[c, n]
            for t, o in obs:
                p *= tb.lik[t][c, n, o]
            tot += p
        post.append(tot)
    post = np.array(post)
    return post / post.sum()


def test_table_shape_matches_the_brief():
    assert 8 <= TB.C <= 12 and 10 <= TB.T <= 15
    assert len(set(TB.costs.tolist())) >= 3
    assert len(TB.by_role("control")) == 1 and len(TB.by_role("misleading")) >= 2
    np.testing.assert_allclose(TB.joint.sum(), 1.0)


def test_posterior_matches_brute_force():
    rng = np.random.default_rng(1)
    for _ in range(50):
        tests = rng.choice(TB.T, size=rng.integers(1, 7), replace=False)
        obs = tuple((int(t), int(rng.integers(len(TB.outcomes[t])))) for t in tests)
        got = D.cause_marginal(D.posterior(TB, obs))
        np.testing.assert_allclose(got, brute_force_cause_posterior(TB, obs), rtol=1e-10)
        # order of the observations does not matter
        np.testing.assert_allclose(D.posterior(TB, obs[::-1]), D.posterior(TB, obs), rtol=1e-10)


def test_lab_posterior_matches_brute_force():
    lab = D.DiagLab(TB)
    lab.reset(3, "s")
    for name in ["hplc_crude", CONTROL, "colour_check", "hplc_in_process"]:
        out = lab.step(name)
        want = brute_force_cause_posterior(TB, lab.obs)
        np.testing.assert_allclose(list(out["posterior"].values()), want, rtol=1e-10)


def test_control_has_exactly_zero_immediate_gain_and_later_value():
    c = TB.index(CONTROL)
    # its outcome distribution is the same for every cause, so the cause posterior is unchanged
    p_o_given_c = np.einsum("cn,cno->co", TB.p_nuis, TB.lik[c])
    assert np.abs(p_o_given_c - p_o_given_c[0]).max() < 1e-15
    assert abs(D.info_gain(TB, TB.joint, c)) < 1e-12
    for o in range(2):
        np.testing.assert_allclose(D.cause_marginal(D.posterior(TB, ((c, o),))), TB.prior,
                                   atol=1e-14)
    # ... but after one assay it is informative, and it makes the next assay worth more
    a = TB.index("hplc_crude")
    w = D.joint_weights(TB, ((a, 0),))
    assert D.info_gain(TB, w, c) > 0.05
    b = TB.index("hplc_mother_liquor")
    assert D.info_gain(TB, D.joint_weights(TB, ((c, 0),)), b) > 3 * D.info_gain(TB, TB.joint, b)


def test_misleading_tests_have_the_highest_one_step_gain():
    gains = np.array([D.info_gain(TB, TB.joint, t) for t in range(TB.T)])
    mis = [TB.index(m) for m in TB.by_role("misleading")]
    others = [t for t in range(TB.T) if t not in mis]
    assert gains[mis].min() > gains[others].max()
    assert D.greedy_policy(TB, TB.joint, (), TB.budget) in mis


def test_dp_is_at_least_every_other_policy():
    dp = D.exact_dp(TB)
    vals = {"greedy": D.evaluate_policy(TB, D.greedy_policy)["reward"],
            "per_cost": D.evaluate_policy(TB, D.greedy_per_cost_policy)["reward"],
            "lookahead2": D.evaluate_policy(TB, D.lookahead2_policy)["reward"],
            "random": D.evaluate_random(TB)["reward"]}
    for k, v in vals.items():
        assert dp.value >= v - 1e-9, k
    # the DP value is what its own policy achieves under independent evaluation
    assert abs(D.evaluate_policy(TB, dp.policy)["reward"] - dp.value) < 1e-10
    # and the designed ordering holds on this table
    assert vals["random"] < vals["greedy"] < dp.value - 0.3


@pytest.mark.parametrize("seed", range(6))
def test_dp_equals_exhaustive_search_on_tiny_tables(seed):
    tb = tiny_table(seed)
    for budget in (2.0, 4.0, 5.0):
        dp = D.exact_dp(tb, budget)
        assert abs(dp.value - D.exhaustive_value(tb, budget)) < 1e-10
        assert abs(D.evaluate_policy(tb, dp.policy, budget)["reward"] - dp.value) < 1e-10
        for pol in (D.greedy_policy, D.greedy_per_cost_policy, D.lookahead2_policy):
            assert D.evaluate_policy(tb, pol, budget)["reward"] <= dp.value + 1e-10
        assert D.evaluate_random(tb, budget)["reward"] <= dp.value + 1e-10


def test_exact_random_matches_enumeration_of_orders_on_tiny_table():
    tb = tiny_table(7, n_tests=3)
    budget = 3.0

    def rec(w, used, remaining):        # uniform over affordable tests, all outcomes
        aff = [t for t in range(tb.T) if t not in used and tb.costs[t] <= remaining]
        if not aff:
            return D._terminal(tb, w)[0]
        return sum(sum(rec(w * tb.lik[t][:, :, o], used | {t}, remaining - tb.costs[t])
                       for o in range(tb.lik[t].shape[2])) for t in aff) / len(aff)
    want = float(rec(tb.joint.copy(), frozenset(), budget))
    assert abs(D.evaluate_random(tb, budget)["reward"] - want) < 1e-12


def test_usage_and_probabilities_are_consistent():
    for ev in (D.evaluate_policy(TB, D.greedy_policy), D.evaluate_random(TB)):
        assert abs(sum(ev["usage"].values()) - ev["mean_tests"]) < 1e-9
        assert abs(sum(ev["usage"][n] * TB.costs[t] for t, n in enumerate(TB.tests))
                   - ev["mean_cost"]) < 1e-9
        assert ev["mean_cost"] <= TB.budget + 1e-9 and 0 <= ev["accuracy"] <= 1


def test_prior_scores_zero():
    for seed in range(5):
        lab = D.DiagLab(TB)
        lab.reset(seed, "s")
        out = lab.submit({c: float(p) for c, p in zip(TB.causes, TB.prior)})
        assert abs(out["reward"]) < 1e-12 and out["n_tests"] == 0
    lab = D.DiagLab(TB)
    lab.reset(0, "s")
    lab.step(CONTROL)                    # the control alone leaves the cause posterior = prior
    assert abs(lab.submit(lab.exact_posterior())["reward"]) < 1e-12
    assert abs(D.expected_reward(TB, TB.joint)) < 1e-12


def test_reward_decomposition_and_proper_scoring():
    lab = D.run_policy(TB, D.greedy_policy, 11, "s")
    r = lab.result
    assert abs(r["reward"] - (r["design"] + r["inference"])) < 1e-12
    # reporting the exact posterior beats a sharpened report in expectation
    w = D.joint_weights(TB, lab.obs)
    p = D.cause_marginal(w)
    sharp = p ** 2 / (p ** 2).sum()
    exp_exact = float(p @ (np.log(D.mix(TB, p)) - TB.log_prior))
    exp_sharp = float(p @ (np.log(D.mix(TB, sharp)) - TB.log_prior))
    assert exp_exact > exp_sharp


def test_budget_enforced_and_invalid_actions_free():
    lab = D.DiagLab(TB)
    lab.reset(0, "s")
    for bad in ["no_such_test", 99, -1, None, 1.5, True]:
        with pytest.raises(ValueError):
            lab.step(bad)
    assert lab.remaining == TB.budget and lab.history == []
    lab.step("catalyst_metals_assay")
    with pytest.raises(ValueError):
        lab.step("catalyst_metals_assay")            # no repeats
    lab.step("solvent_water_external_lab")
    assert lab.remaining == 2
    with pytest.raises(ValueError):
        lab.step("thermocouple_audit")               # costs 3, only 2 left
    assert lab.remaining == 2 and len(lab.history) == 2
    lab.step("hplc_crude")
    assert lab.remaining == 0 and lab.available() == []
    with pytest.raises(ValueError):
        lab.step("colour_check")
    lab.submit(lab.exact_posterior())
    with pytest.raises(RuntimeError):
        lab.step("colour_check")
    with pytest.raises(RuntimeError):
        lab.submit(lab.exact_posterior())
    with pytest.raises(RuntimeError):
        D.DiagLab(TB).step("colour_check")           # before reset


def test_no_policy_overspends():
    rng = np.random.default_rng(0)
    dp = D.exact_dp(TB)
    for seed in range(40):
        for pol in (D.greedy_policy, D.greedy_per_cost_policy, dp.policy,
                    D.make_random_policy(rng)):
            lab = D.run_policy(TB, pol, seed, "s")
            assert lab.spent <= TB.budget + 1e-9
            assert len({h["test"] for h in lab.history}) == len(lab.history)


def test_submit_validation():
    lab = D.DiagLab(TB)
    lab.reset(0, "s")
    for bad in [{"nope": 1.0}, [0.5, 0.5], {c: -1.0 for c in TB.causes},
                {c: 0.0 for c in TB.causes}, "x", {TB.causes[0]: float("nan")}]:
        with pytest.raises(ValueError):
            lab.submit(bad)
    out = lab.submit({TB.causes[0]: 2.0, TB.causes[1]: 2.0})     # normalised, missing = 0
    assert abs(out["submitted"][TB.causes[0]] - 0.5) < 1e-12 and np.isfinite(out["reward"])


def test_determinism_under_seed_and_salt():
    def play(seed, salt, order):
        lab = D.DiagLab(TB)
        lab.reset(seed, salt)
        outs = {n: lab.step(n)["result"]["outcome"] for n in order}
        return lab.hidden, lab.hidden_nuisance, outs
    order = ["hplc_crude", CONTROL, "colour_check", "batch_record_review", "hplc_in_process"]
    assert play(5, "s", order) == play(5, "s", order)
    # the reading of a test does not depend on when it is run (common random numbers)
    assert play(5, "s", order)[2] == play(5, "s", order[::-1])[2]
    seeds = range(60)
    a = [play(s, "s", order) for s in seeds]
    assert a != [play(s, "other-salt", order) for s in seeds]
    assert a != [play(s, None, order) for s in seeds]
    assert len({x[0] for x in a}) > 3


def test_hidden_state_frequencies_follow_the_joint_prior():
    lab = D.DiagLab(TB)
    counts = np.zeros(TB.C)
    n = 4000
    for seed in range(n):
        lab.reset(seed, "freq")
        counts[TB.causes.index(lab.hidden)] += 1
    se = np.sqrt(TB.prior * (1 - TB.prior) / n)
    assert np.all(np.abs(counts / n - TB.prior) < 4.5 * se)


def test_simulation_agrees_with_exact_evaluation():
    tb = tiny_table(3)
    ev = D.evaluate_policy(tb, D.greedy_policy)
    r = np.array([D.run_policy(tb, D.greedy_policy, s, "sim").result["reward"]
                  for s in range(6000)])
    assert abs(r.mean() - ev["reward"]) < 4.5 * r.std() / np.sqrt(len(r))


def test_spec_loader_rows_override_in_order_and_validate():
    spec = {"name": "x", "budget": 2,
            "causes": {"a": 0.5, "b": {"prior": 0.5}},
            "nuisances": {"inst": {"states": ["ok", "bad"], "prob": [0.7, 0.3]},
                          "lot": {"states": ["new", "old"], "prob": [0.9, 0.1],
                                  "given_cause": {"b": [0.4, 0.6]}},
                          "tech": {"states": ["x", "y"], "prob": [0.5, 0.5],
                                   "given_nuisance": {"inst": {"bad": [0.1, 0.9]}}}},
            "tests": {"t": {"cost": 1, "outcomes": ["lo", "hi"], "default": [0.9, 0.1],
                            "rows": [{"when": {"cause": "b"}, "p": [0.2, 0.8]},
                                     {"when": {"cause": ["b"], "inst": "bad"}, "p": [0.5, 0.5]}]}}}
    tb = D.table_from_spec(spec)
    assert tb.nuisances[0] == "ok/new/x" and len(tb.nuisances) == 8
    np.testing.assert_allclose(tb.p_nuis.sum(1), 1.0)
    for ni, name in enumerate(tb.nuisances):
        inst, lot, tech = name.split("/")
        want_a = (0.7 if inst == "ok" else 0.3) * (0.9 if lot == "new" else 0.1) * (
            0.5 if inst == "ok" else (0.1 if tech == "x" else 0.9))
        assert abs(tb.p_nuis[0, ni] - want_a) < 1e-12
        np.testing.assert_allclose(tb.lik[0][0, ni], [0.9, 0.1])
        np.testing.assert_allclose(tb.lik[0][1, ni], [0.5, 0.5] if inst == "bad" else [0.2, 0.8])
    bad = {**spec, "tests": {"t": {"cost": 1, "outcomes": ["lo", "hi"], "default": [0.9, 0.2]}}}
    with pytest.raises(ValueError):
        D.table_from_spec(bad)
    bad = {**spec, "tests": {"t": {"cost": 1, "outcomes": ["lo", "hi"], "default": [0.9, 0.1],
                                   "rows": [{"when": {"typo": "b"}, "p": [0.5, 0.5]}]}}}
    with pytest.raises(ValueError):
        D.table_from_spec(bad)


def test_random_and_jittered_tables_keep_the_control_at_zero_gain():
    rng = np.random.default_rng(0)
    for effect in ("shift", "noise"):
        tb = D.random_table(rng, instrument_effect=effect)
        assert abs(D.info_gain(tb, tb.joint, tb.index("control_A"))) < 1e-12
        assert 10 <= tb.T <= 15 and len(set(tb.costs.tolist())) >= 2
    tb = D.table_from_spec(D.jitter_spec(D.load_spec("low_yield"), rng))
    assert abs(D.info_gain(tb, tb.joint, tb.index(CONTROL))) < 1e-12
    assert not np.allclose(tb.prior, TB.prior)


def test_removing_a_test_cannot_help_the_optimum():
    dp = D.exact_dp(TB).value
    assert D.exact_dp(TB.without(CONTROL)).value < dp - 0.05      # the control is worth having
    mis = TB.by_role("misleading")
    assert D.exact_dp(TB.without(mis)).value <= dp + 1e-12
    assert len(TB.without(mis).tests) == TB.T - len(mis)
