"""Tests for Rulebound Battleship (bayesenv.battleship): geometry, exactness of the posterior and
of the information gain, propriety and normalisation of the score, budget enforcement, and the
exact posterior predictive leak test."""

import math

import numpy as np
import pytest
from scipy import stats

from bayesenv import battleship as B

G = B.geometry()


def cells_of(li):
    return [tuple(c) for s in G.layout_cells(li) for c in s["cells"]]


def ships_of(li):
    return [[tuple(c) for c in s["cells"]] for s in G.layout_cells(li)]


def touches(a, b):
    return any(abs(x - u) <= 1 and abs(y - v) <= 1 for x, y in a for u, v in b)


def rule_holds(name, li):
    sh = ships_of(li)
    if name == "any":
        return True
    if name == "no_touch":
        return not any(touches(sh[i], sh[j]) for i in range(3) for j in range(i + 1, 3))
    if name == "parallel":
        return len({s[0][0] == s[1][0] for s in sh}) == 1
    if name == "border":
        return all(any(r in (0, 5) or c in (0, 5) for r, c in s) for s in sh)
    if name == "center_clear":
        return not set(B.CENTRE) & set(cells_of(li))
    if name == "clustered":
        return all(any(touches(sh[i], sh[j]) for j in range(3) if j != i) for i in range(3))
    raise ValueError(name)


def test_geometry_counts_and_prior():
    assert G.L == 53624
    assert G.occ.sum(1).min() == G.occ.sum(1).max() == sum(B.SHIPS)
    assert G.member[0].all()
    assert abs(G.p0.sum() - sum(B.SHIPS)) < 1e-9
    assert abs(G.w0.sum() - 1) < 1e-12
    assert np.allclose(G.p0.reshape(6, 6), G.p0.reshape(6, 6)[::-1, ::-1])   # symmetric


def test_rule_membership_matches_brute_force():
    rng = np.random.default_rng(0)
    sample = list(rng.choice(G.L, 400, replace=False))
    for k, name in enumerate(B.NAMES):
        sample += list(rng.choice(np.flatnonzero(G.member[k]), 40, replace=False))
    for li in sample:
        for k, name in enumerate(B.NAMES):
            assert G.member[k, li] == rule_holds(name, li), (name, li)


def test_determinism_and_salt():
    a, b = B.BattleshipLab(), B.BattleshipLab()
    a.reset(3, "s")
    b.reset(3, "s")
    acts = [{"type": "fire", "row": 2, "col": 3}, {"type": "scan", "axis": "col", "index": 1}]
    assert [a.step(x)["result"] for x in acts] == [b.step(x)["result"] for x in acts]
    hidden = set()
    for i in range(40):
        lab = B.BattleshipLab()
        lab.reset(0, f"salt{i}")
        hidden.add((lab.hidden_rule, lab.hidden_layout))
    assert len(hidden) >= 35


def test_hidden_state_follows_the_public_prior():
    rules, cells = [], np.zeros(36)
    for s in range(3000):
        lab = B.BattleshipLab()
        lab.reset(s, "prior")
        rules.append(lab.hidden_rule)
        cells += G.occ[lab.hidden_layout]
    freq = np.bincount(rules, minlength=B.K) / 3000
    assert np.abs(freq - 1 / B.K).max() < 0.03
    assert np.abs(cells / 3000 - G.p0).max() < 0.04


def test_posterior_matches_brute_force_joint():
    lab = B.BattleshipLab()
    lab.reset(5, "x")
    for a in ({"type": "fire", "row": 0, "col": 0}, {"type": "scan", "axis": "row", "index": 2},
              {"type": "fire", "row": 3, "col": 3}, {"type": "fire", "row": 0, "col": 0}):
        lab.step(a)
    # joint over (rule, layout) written out directly from the generative model
    logw = np.full((B.K, G.L), -np.inf)
    for k in range(B.K):
        lw = np.log(1 / B.K) - np.log(G.n_rule[k]) + np.zeros(G.L)
        for h in lab.history:
            if h["type"] == "fire":
                c = h["row"] * 6 + h["col"]
                lw = lw + np.where(G.occ[:, c] == bool(h["result"]), np.log(0.9), np.log(0.1))
            else:
                li = (0 if h["axis"] == "row" else 6) + h["index"]
                with np.errstate(divide="ignore"):
                    lw = lw + np.log(G.scan_T[G.lines[li], h["result"]])
        logw[k] = np.where(G.member[k], lw, -np.inf)
    w = np.exp(logw - logw.max())
    w /= w.sum()
    assert np.allclose(w.sum(1), lab.belief.rules(), atol=1e-10)
    assert np.allclose(w.sum(0) @ G.occ, lab.belief.occupancy(), atol=1e-10)


def test_eig_equals_exact_mutual_information():
    b = B.Belief()
    b.update(14, 1)
    b.update(B.N * B.N + 3, 2)
    eig = b.eig()
    for a in (0, 14, 21, B.N * B.N + 1, B.N * B.N + 8):
        w = b.layout_weights()
        h0 = -(w[w > 0] * np.log(w[w > 0])).sum()
        outcomes = (0, 1) if a < 36 else range(7)
        mi = 0.0
        for y in outcomes:
            if a < 36:
                lik = np.where(G.occ[:, a] == bool(y), 0.9, 0.1)
            else:
                lik = G.scan_T[G.lines[a - 36], y]
            py = float(w @ lik)
            if py <= 0:
                continue
            post = w * lik / py
            nz = post > 0
            mi += py * (h0 + (post[nz] * np.log(post[nz])).sum())
        assert abs(mi - eig[a]) < 1e-9, (a, mi, eig[a])
    assert (eig >= -1e-12).all()


def test_prior_scores_zero_and_truth_about_one():
    q, o = B.RULE_PRIOR, G.p0
    for li in (0, 100, 30000):
        for k in range(B.K):
            assert abs(B.score(q, o, k, li)["score_raw"]) < 1e-12
    # expected score of knowing the truth, averaged exactly over the prior
    cell = np.array([B._cell_part_vec(G.occ[li].astype(float))[li] for li in range(0, G.L, 97)])
    w = G.w0[::97] / G.w0[::97].sum()
    assert abs(float(w @ cell) - 1) < 0.05
    assert abs(B._rule_part_vec(np.eye(B.K)[0])[0] - 1) < 1e-2


def test_normalisers_do_not_depend_on_the_hidden_state():
    # score_raw is an affine function of the log score with public constants, so it is proper
    assert B.RULE_NORM == math.log(B.K)
    assert abs(G.cell_norm - float(B._h2(G.p0).sum())) < 1e-12
    assert f"{G.cell_norm:.4f}" in B.rules()["scoring"]


def test_score_is_proper_under_the_posterior():
    lab = B.BattleshipLab()
    lab.reset(11, "proper")
    for c in (0, 7, 14, 21, 28, 35):
        lab.step({"type": "fire", "row": c // 6, "col": c % 6})
    b = lab.belief
    pr, po = b.rules(), b.occupancy()
    A = b._A()
    joint = G.member * (A / G.n_rule[:, None])
    joint /= joint.sum()

    def expected(q, o):
        return float((joint * 0.5 * (B._rule_part_vec(q)[:, None]
                                     + B._cell_part_vec(o)[None, :])).sum())

    best = expected(pr, po)
    rng = np.random.default_rng(0)
    others = [(B._sharpen(pr, 2), po), (pr, B._sharpen_cells(po, 2)),
              (B._sharpen(pr, 0.5), B._sharpen_cells(po, 0.5)), (B.RULE_PRIOR, G.p0)]
    for _ in range(20):
        others.append((rng.dirichlet(np.ones(B.K)), np.clip(po + rng.normal(0, .1, 36), 0, 1)))
    for q, o in others:
        assert expected(q, o) <= best + 1e-9


def test_decomposition_and_reference_gap():
    lab = B.run_policy("hunter", "noiseless", 2, "dec", reference=True)
    r = lab.result
    assert abs(r["design"] + r["inference"] - r["score_raw"]) < 1e-12
    assert r["score"] == min(1, max(0, r["score_raw"]))
    ref = B.run_policy("reference", "exact", 2, "dec").result
    assert abs(r["reference_score_raw"] - ref["score_raw"]) < 1e-12
    assert abs(ref["inference"]) < 1e-12


def test_budget_invalid_actions_and_single_submission():
    lab = B.BattleshipLab()
    lab.reset(0, "b")
    for bad in ({"type": "fire", "row": 6, "col": 0}, {"type": "fire", "row": 1.5, "col": 0},
                {"type": "fire", "row": float("nan"), "col": 0}, {"type": "fire", "row": True,
                                                                     "col": 0},
                {"type": "scan", "axis": "diag", "index": 0}, {"type": "nuke"}, "fire"):
        with pytest.raises(ValueError):
            lab.step(bad)
    assert lab.remaining == B.BUDGET and not lab.history
    for _ in range(B.BUDGET // 2):
        lab.step({"type": "scan", "axis": "row", "index": 0})
    with pytest.raises(RuntimeError):
        lab.step({"type": "fire", "row": 0, "col": 0})
    assert lab.remaining == 0
    for bad_q, bad_o in ((["a"] * 6, None), ({"bogus": 1}, None), ([0] * 6, None),
                         ([1] * 6, [[2] * 6] * 6), ([1] * 6, [0.1] * 35)):
        with pytest.raises(ValueError):
            lab.submit(bad_q, bad_o, reference=False)
    lab.submit({"any": 1}, None, reference=False)
    with pytest.raises(RuntimeError):
        lab.submit({"any": 1}, None, reference=False)
    with pytest.raises(RuntimeError):
        lab.step({"type": "fire", "row": 0, "col": 0})


def test_leak_test_is_uniform_for_honest_and_flags_cheaters():
    honest, cheat = [], []
    for s in range(150):
        honest.append(B.run_policy("random", "exact", s, "ppc").result["ppc_p"])
        honest.append(B.run_policy("hunter", "noiseless", s, "ppc").result["ppc_p"])
    for s in range(30):
        cheat.append(B.run_policy("random", "cheat_full", s, "ppc").result["ppc_p"])
    assert stats.kstest(honest, "uniform").pvalue > 0.01
    assert np.mean(np.array(cheat) < 0.05) > 0.8
