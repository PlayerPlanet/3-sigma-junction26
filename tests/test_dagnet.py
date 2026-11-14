"""DAG lab: enumeration, exact inference against an independent brute force, interventions,
reward, environment contract, and the ordering of the calibration policies."""

import itertools
import math
from dataclasses import replace

import numpy as np
import pytest
from scipy.special import betaln

from bayesenv import dagnet as D

SMALL = replace(D.DEFAULT, n=3, max_indegree=2, batch=3, budget=4, n_single=6, n_double=3)


# ---- independent brute force (no shared code with dagnet's inference) ---------------------

def brute_dags(n):
    """All DAGs on n nodes as tuples of parent tuples, by trying every edge subset."""
    pairs = [(j, i) for j in range(n) for i in range(n) if i != j]
    out = []
    for r in range(len(pairs) + 1):
        for edges in itertools.combinations(pairs, r):
            pa = [tuple(j for j, i in edges if i == k) for k in range(n)]
            done, progress = set(), True
            while progress:
                progress = False
                for k in range(n):
                    if k not in done and all(j in done for j in pa[k]):
                        done.add(k)
                        progress = True
            if len(done) == n:
                out.append(tuple(pa))
    return out


def brute_node_counts(pa, data, alpha, keep_intervened=False):
    """{(node, parent config): [n0, n1]} over the samples that are evidence for that node."""
    c = {}
    for do, x in data:
        for i, p in enumerate(pa):
            if i in do and not keep_intervened:
                continue
            c.setdefault((i, tuple(x[j] for j in p)), [0, 0])[x[i]] += 1
    return c


def brute_logml(pa, data, alpha, keep_intervened=False):
    return sum(betaln(alpha + n1, alpha + n0) - betaln(alpha, alpha)
               for n0, n1 in brute_node_counts(pa, data, alpha, keep_intervened).values())


def brute_query(pa, data, alpha, do, t):
    """Posterior predictive P(X_t = 1 | do) for one DAG, by summing over all joint states."""
    n, c, tot = len(pa), brute_node_counts(pa, data, alpha), 0.0
    for x in itertools.product((0, 1), repeat=n):
        if x[t] != 1 or any(x[i] != v for i, v in do.items()):
            continue
        p = 1.0
        for i in range(n):
            if i in do:
                continue
            n0, n1 = c.get((i, tuple(x[j] for j in pa[i])), (0, 0))
            p1 = (alpha + n1) / (2 * alpha + n0 + n1)
            p *= p1 if x[i] else 1 - p1
        tot += p
    return tot


def as_parents(mask_row):
    return tuple(tuple(j for j in range(len(mask_row)) if (int(m) >> j) & 1) for m in mask_row)


def small_data(seed=0):
    rng = np.random.default_rng(seed)
    data = []
    for do in ({}, {0: 1}, {2: 0}, {}, {1: 1}):
        for _ in range(3):
            x = [int(v) for v in rng.integers(0, 2, 3)]
            for i, v in do.items():
                x[i] = v
            data.append((do, x))
    return data


def belief_from(data, cfg=SMALL):
    b = D.Belief(cfg)
    for do, x in data:
        b.add(do, [x])
    return b


# ---- enumeration --------------------------------------------------------------------------

def test_dag_counts():
    assert [len(D.enumerate_dags(n)) for n in (3, 4, 5)] == [25, 543, 29281]
    assert len(D.enumerate_dags(3)) == len(brute_dags(3))
    assert {as_parents(r) for r in D.enumerate_dags(3)} == set(brute_dags(3))
    ps = D.enumerate_dags(5, 2)
    assert len(ps) == D.structures(5, 2).G == len({tuple(r) for r in ps}) == 13956
    assert max(bin(int(m)).count("1") for m in ps.ravel()) == 2


# ---- exact inference vs brute force -------------------------------------------------------

def test_marginal_likelihood_and_posterior_match_brute_force():
    data, b, st = small_data(), belief_from(small_data()), D.structures(3, 2)
    lw = b.local_scores()[st.nodes, st.ps].sum(1)
    brute = np.array([brute_logml(as_parents(r), data, SMALL.alpha) for r in st.ps])
    assert np.allclose(lw, brute, atol=1e-10)
    w = np.exp(brute - brute.max())
    assert np.allclose(b.weights(), w / w.sum(), atol=1e-12)


def test_predictive_matches_brute_force():
    data, b, st = small_data(1), belief_from(small_data(1)), D.structures(3, 2)
    single, double = D.all_queries(SMALL)
    w = b.weights()
    for do, t in single + double:
        brute = sum(w[g] * brute_query(as_parents(st.ps[g]), data, SMALL.alpha, do, t)
                    for g in range(st.G))
        assert b.predict([(do, t)])[0] == pytest.approx(brute, abs=1e-12)


def test_intervened_node_term_is_dropped():
    """X0 is set to 1 in half the samples, independently of X1; kept as evidence these samples
    would count for or against X1 -> X0. The exact score drops them; the wrong one does not."""
    data = [({}, [0, 0, 0]), ({}, [1, 1, 0]), ({0: 1}, [1, 0, 0]), ({0: 1}, [1, 0, 1])]
    b, st = belief_from(data), D.structures(3, 2)
    right = np.array([brute_logml(as_parents(r), data, SMALL.alpha) for r in st.ps])
    wrong = np.array([brute_logml(as_parents(r), data, SMALL.alpha, True) for r in st.ps])
    assert np.abs(right - wrong).max() > 0.1          # the two readings really differ here
    lw = b.local_scores()[st.nodes, st.ps].sum(1)
    assert np.allclose(lw, right, atol=1e-10)
    assert not np.allclose(lw, wrong, atol=1e-3)
    lw_keep = b.local_scores("keep_term")[st.nodes, st.ps].sum(1)
    assert np.allclose(lw_keep, wrong, atol=1e-10)    # the shortcut baseline is that mistake


def test_do_is_not_see():
    """Confounded pair: X0 -> X1, X0 -> X2 with strong tables. P(X2 | do(X1)) must ignore X1."""
    cfg = SMALL
    b = D.Belief(cfg)
    rng = np.random.default_rng(0)
    x0 = rng.integers(0, 2, 400)
    b.add({}, np.stack([x0, x0, x0], 1))              # X1 = X2 = X0 observationally
    for v in (0, 1):                                  # interventions on X1 and X2 break the copies
        x0 = rng.integers(0, 2, 60)
        b.add({1: v}, np.stack([x0, np.full(60, v), x0], 1))
        x0 = rng.integers(0, 2, 60)
        b.add({2: v}, np.stack([x0, x0, np.full(60, v)], 1))
    q = [({1: 1}, 2), ({1: 0}, 2)]
    exact, see = b.predict(q), b.predict_see_as_do(q)
    assert np.all(np.abs(exact - 0.5) < 0.1)
    assert see[0] > 0.7 and see[1] < 0.3
    assert b.edge_probabilities()[0, 1] > 0.9 and b.edge_probabilities()[0, 2] > 0.9


def test_eig_matches_brute_force_mutual_information():
    """EIG about the DAG of one sample = I(G; x) computed directly from the definition."""
    b, st = belief_from(small_data(2)), D.structures(3, 2)
    data, w = small_data(2), b.weights()
    for a, do in enumerate(D.action_menu(SMALL)):
        mi, pbar, pg = 0.0, np.zeros(8), np.zeros((st.G, 8))
        for g in range(st.G):
            pa = as_parents(st.ps[g])
            c = brute_node_counts(pa, data, SMALL.alpha)
            for k, x in enumerate(itertools.product((0, 1), repeat=3)):
                if any(x[i] != v for i, v in do.items()):
                    continue
                p = 1.0
                for i in range(3):
                    if i in do:
                        continue
                    n0, n1 = c.get((i, tuple(x[j] for j in pa[i])), (0, 0))
                    p1 = (SMALL.alpha + n1) / (2 * SMALL.alpha + n0 + n1)
                    p *= p1 if x[i] else 1 - p1
                pg[g, k] = p
        pbar = w @ pg
        with np.errstate(divide="ignore", invalid="ignore"):
            mi = float(np.sum(w[:, None] * np.where(pg > 0, pg * np.log(pg / pbar), 0)))
        assert b.eig("dag")[a] == pytest.approx(mi, abs=1e-10)
    assert np.all(b.eig("joint") >= b.eig("dag") - 1e-12)   # tables add information


# ---- reward -------------------------------------------------------------------------------

def test_prior_scores_exactly_zero_and_prior_predictive_is_half():
    lab = D.run_policy("prior", 3, "s")
    assert lab.result["reward_raw"] == 0.0 and lab.result["score"] == 0.0
    single, double = D.all_queries()
    assert np.allclose(D.Belief().predict(single + double), 0.5, atol=1e-12)


def test_score_range_truth_and_clamp():
    lab = D.DagLab()
    lab.reset(5, "s")
    lab.finish()
    k = lab.cfg.n_queries
    for p in (np.zeros(k), np.ones(k), np.full(k, 0.5), lab.truth, np.random.default_rng(0).random(k)):
        r = lab.score(p)
        assert 0.0 <= r["score"] <= 1.0 and math.isfinite(r["reward_raw"])
    best = lab.score(lab.truth)["reward_raw"]
    assert best == pytest.approx(lab.score(lab.truth)["raw_knowing_truth"])
    rng = np.random.default_rng(1)
    assert all(lab.score(np.clip(lab.truth + 0.2 * rng.standard_normal(k), 0, 1))["reward_raw"] <= best
               for _ in range(20))
    assert lab.score(np.zeros(k))["reward_raw"] == lab.score(np.full(k, 0.001))["reward_raw"]


def test_truth_is_exact_interventional_probability():
    """The stored truth equals a Monte Carlo estimate from the lab's own sampler semantics."""
    lab = D.DagLab()
    lab.reset(11, "s")
    rng, n = np.random.default_rng(0), lab.cfg.n
    for k in (0, lab.cfg.n_single):                       # one single, one double query
        do, t = lab._queries[k]
        x = np.zeros(40_000, np.int64)
        for i in lab._order:
            v = np.full(len(x), do[i]) if i in do else rng.random(len(x)) < lab.theta[i, x]
            x |= v.astype(np.int64) << i
        assert ((x >> t) & 1).mean() == pytest.approx(lab.truth[k], abs=0.012)
    assert D.DEFAULT.n == n


def test_stored_norm_matches_monte_carlo():
    est = D.estimate_norm(D.DEFAULT, draws=20_000, seed=7)
    assert abs(est["norm"] - D.norm_constant()) < 5 * est["se"] + 1e-3


# ---- environment contract -----------------------------------------------------------------

def play(seed, salt, actions):
    lab = D.DagLab(track=False)
    lab.reset(seed, salt)
    return lab, [lab.step(a)["result"]["samples"] for a in actions]


def test_determinism_under_seed_and_salt():
    acts = [{}, {"X1": 1}, {"X3": 0}]
    a, sa = play(4, "salt-a", acts)
    b, sb = play(4, "salt-a", acts)
    c, sc = play(4, "salt-b", acts)
    assert sa == sb and np.array_equal(a.theta, b.theta) and a.finish() == b.finish()
    assert not np.array_equal(a.theta, c.theta)
    nets = {tuple(play(4, f"s{k}", [])[0].parents) for k in range(8)}
    assert len(nets) > 1                                  # the salt changes the hidden network


def test_interventions_are_applied():
    lab, s = play(2, "s", [{"X2": 1}, {"X0": 0}])
    assert all(r[2] == 1 for r in s[0]) and all(r[0] == 0 for r in s[1])
    assert len(s[0]) == lab.cfg.batch and len(s[0][0]) == lab.cfg.n


@pytest.mark.parametrize("bad", [{"X9": 1}, {"X1": 2}, {"X1": 1, "X2": 0}, {"Y": 1}, [1], "X1",
                                 {"X1": True}, {"X1": 0.5}, {"X1": None}])
def test_invalid_actions_rejected_without_consuming_budget(bad):
    lab = D.DagLab()
    lab.reset(0, "s")
    with pytest.raises(ValueError):
        lab.step(bad)
    assert lab.remaining == lab.cfg.budget and lab.history == []


def test_budget_finish_and_single_submission():
    lab = D.DagLab(track=False)
    lab.reset(0, "s")
    k = lab.cfg.n_queries
    with pytest.raises(RuntimeError):
        lab.submit([0.5] * k)                             # queries not revealed yet
    with pytest.raises(RuntimeError):
        lab.queries
    for _ in range(lab.cfg.budget):
        lab.step({})
    with pytest.raises(RuntimeError):
        lab.step({})
    q = lab.finish()
    assert len(q["queries"]) == k and lab.finish() == q
    assert sum(len(x["do"]) == 1 for x in q["queries"]) == lab.cfg.n_single
    assert all(x["target"] not in x["do"] for x in q["queries"])
    with pytest.raises(RuntimeError):
        lab.step({})                                      # no experiments after the reveal
    for bad in ([0.5] * (k - 1), [1.5] * k, [float("nan")] * k, "x"):
        with pytest.raises(ValueError):
            lab.submit(bad)
    assert lab.result is None                             # a rejected submission is not consumed
    lab.submit([0.5] * k)
    with pytest.raises(RuntimeError):
        lab.submit([0.5] * k)


def test_posterior_summary_for_demo():
    lab = D.DagLab()
    obs = lab.reset(0, "s")
    e0 = np.array(obs["posterior"]["edge_probabilities"])
    assert np.allclose(np.diag(e0), 0) and np.allclose(e0[~np.eye(5, dtype=bool)], e0[0, 1], atol=1e-4)
    obs = lab.step({"X0": 1})
    assert obs["posterior"]["entropy_nats"] < obs["posterior"]["max_entropy_nats"]
    assert len(obs["posterior"]["top_dags"]) == 3
    assert "posterior" not in D.rules() and D.rules()["scoring"]["C"] == D.norm_constant()


# ---- calibration ordering (modest number of seeds; the full table is in docs/DAGNET.md) ----

def test_reference_beats_random_and_shortcuts():
    rows = [D.evaluate_seed(s, "test") for s in range(12)]
    m = lambda k: float(np.mean([r[k] for r in rows]))
    assert all(r["prior"] == 0.0 for r in rows)
    assert m("reference") > 0.3
    assert m("truth") > m("reference")
    # shortcuts with a large gap in the calibration (0.19 to 0.38): strictly below here too
    for k in ("plugin_mle", "ignore_interventions", "see_as_do", "empirical", "round_robin_empirical"):
        assert m("reference") > m(k) + 0.05, k
    # small gaps in the calibration (0.03 to 0.07): 12 seeds cannot resolve them, so only
    # check that none of these beats the reference by a margin
    for k in ("best_graph", "bic_best_laplace", "observe", "random", "round_robin"):
        assert m("reference") > m(k) - 0.05, k
