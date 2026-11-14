"""LFI lab: FSP against the shipped Gillespie simulator and closed-form moments, truncation,
reward, environment contract; table-dependent checks run only when the FSP tables exist
(data/lfilab_fsp.npz locally, the Modal volume in experiments/lfilab_modal.py::tests)."""

import json
import math

import numpy as np
import pytest
from scipy.stats import binom

from bayesenv import lfilab as L
from bayesenv import lfilab_sim as S

HAVE_TABLES = L.table_path().exists()
needs_tables = pytest.mark.skipif(not HAVE_TABLES, reason="FSP tables not built")


def tv(p, q):
    n = max(len(p), len(q))
    p, q = np.pad(p, (0, n - len(p))), np.pad(q, (0, n - len(q)))
    return 0.5 * np.abs(p - q).sum()


# ---- the exact likelihood against independent computations -------------------------------

@pytest.mark.parametrize("cond", ["standard", "feedback_blocked", "low_inducer"])
def test_fsp_matches_gillespie_simulator(cond):
    """Mixture over the extrinsic factor and binomial capture, against 40,000 SSA cells."""
    h = L.theta_index(6, 3, 2, 6)            # k_on 2, k_off 0.71, K 2, k_tx 16
    th = L.theta_values(h)
    pm = L.hypothesis_pmfs(h)
    for t in (1.0, 4.0):
        exact = (L.EXTRINSIC_P @ pm[cond][:, L.TIMES.index(t)]) @ L.capture_matrix(L.CAPTURE)
        c = S.simulate(th["k_on"], th["k_off"], th["k_tx"], th["K"], t, 40_000, cond,
                       L.CAPTURE, seed=1)
        emp = np.bincount(c, minlength=len(exact)) / len(c)
        assert tv(exact, emp) < 0.02
        assert abs(c.mean() - exact @ np.arange(len(exact))) < 0.05


def test_fsp_moments_match_closed_form_without_feedback():
    """Linear moment equations are exact without feedback: mean and variance agree."""
    for kon, koff, ktx in [(0.5, 2.0, 30.0), (3.0, 0.3, 8.0)]:
        res, leak = L.fsp(kon, koff, math.inf, ktx)
        m = np.arange(res.shape[1])
        for i, t in enumerate(L.TIMES):
            mu, var = L.telegraph_moments(kon, koff, ktx, 1.0, t)
            assert abs(res[i] @ m - mu) < 1e-6
            assert abs(res[i] @ m ** 2 - (res[i] @ m) ** 2 - var) < 1e-5


def test_truncation_bound_and_leak():
    top = L.KTX_EXT.max()
    assert L.m_bound(top) <= L.M_MAX
    res, leak = L.fsp(L.KON_EXT.max(), L.GRID["k_off"].min(), math.inf, top)
    assert leak < L.LEAK_MAX
    assert np.all(res >= 0) and abs(res.sum(1) - 1).max() < L.LEAK_MAX


def test_feedback_lowers_expression():
    a, _ = L.fsp(2.0, 0.5, 2.0, 30.0)
    b, _ = L.fsp(2.0, 0.5, math.inf, 30.0)
    m = np.arange(a.shape[1])
    assert a[-1] @ m < 0.8 * (b[-1] @ m)


def test_population_query_distribution():
    pc = np.array([0.5, 0.2, 0.1, 0.1, 0.1])
    it = ("standard", 1.0, 0.2, 2)
    d = L.item_dist(pc, it)
    s = 0.3
    ref = binom.pmf(np.arange(L.POP + 1), L.POP, s) @ L.pop_bin_matrix()
    assert np.allclose(d[:len(ref)], ref, atol=1e-12) and abs(d.sum() - 1) < 1e-12
    single = L.item_dist(pc, ("standard", 1.0, 0.2, None))
    assert single[0] == 0.5 and abs(single.sum() - 1) < 1e-12


def test_simulator_extrinsic_and_capture():
    out = S.simulate(1.0, 1.0, 10.0, 5.0, 2.0, 20_000, seed=0, return_state=True)
    f = np.log(out["extrinsic_factor"]) / np.log(np.sqrt(2))
    assert np.allclose(np.bincount(np.round(f).astype(int) + 2, minlength=5) / 20_000,
                       S.EXTRINSIC_P, atol=0.01)
    assert np.all(out["counts"] <= out["m"])
    assert abs(out["counts"].sum() / out["m"].sum() - S.CAPTURE) < 0.01


# ---- environment contract ----------------------------------------------------------------

def lab(seed=0, salt="s"):
    x = L.LfiLab(tables=False)
    x.reset(seed, salt)
    return x


def test_determinism_under_seed_and_salt():
    a, b = lab(3, "x"), lab(3, "x")
    assert a.hypothesis == b.hypothesis and a._queries == b._queries
    ra = a.step({"condition": "standard", "time": 2, "cells": 30})
    rb = b.step({"condition": "standard", "time": 2, "cells": 30})
    assert ra["result"]["counts"] == rb["result"]["counts"]
    hs = {lab(3, f"salt{i}").hypothesis for i in range(6)}
    assert len(hs) > 1


@pytest.mark.parametrize("bad", [
    {"condition": "feedback_blocked", "time": 2, "cells": 20},
    {"condition": "standard", "time": 3, "cells": 20},
    {"condition": "standard", "time": 2, "cells": 5},
    {"condition": "standard", "time": 2, "cells": 10_000},
    {"condition": "standard", "time": 2, "cells": 20.5},
    {"condition": "standard", "time": 2, "cells": 20, "capture": 0.9},
    "standard",
])
def test_invalid_actions_rejected_without_consuming_budget(bad):
    x = lab()
    with pytest.raises(ValueError):
        x.step(bad)
    assert x.cells_used == 0 and not x.history


def test_budget_assay_limit_finish_and_single_submission():
    x = lab()
    x.step({"condition": "standard", "time": 1, "cells": L.CELL_BUDGET - 20})
    with pytest.raises(ValueError):
        x.step({"condition": "standard", "time": 1, "cells": 21})
    x.step({"condition": "low_inducer", "time": 8, "cells": 20})
    with pytest.raises(ValueError):
        x.step({"condition": "standard", "time": 1, "cells": 10})
    with pytest.raises(RuntimeError):
        x.submit([])
    q = x.finish()["queries"]
    assert len(q) == L.N_QUERIES and all(abs(sum(e["prior_predictive"]) - 1) < 1e-5 for e in q)
    with pytest.raises(RuntimeError):
        x.step({"condition": "standard", "time": 1, "cells": 10})
    with pytest.raises(ValueError):
        x.submit([[1.0]] * L.N_QUERIES)
    x.submit([e["prior_predictive"] for e in q])
    with pytest.raises(RuntimeError):
        x.submit([e["prior_predictive"] for e in q])

    y = lab(1)
    for _ in range(L.MAX_ASSAYS):
        y.step({"condition": "standard", "time": 1, "cells": 10})
    with pytest.raises(RuntimeError):
        y.step({"condition": "standard", "time": 1, "cells": 10})


def test_prior_scores_zero_truth_scores_most():
    for seed in range(4):
        x = lab(seed)
        x.finish()
        p0 = L.p0_of(x.queries)
        assert abs(x.score(p0)["reward_raw"]) < 1e-9
        s = x.score(x.truth)
        assert s["reward_raw"] == pytest.approx(s["raw_knowing_truth"])
        assert 0.0 <= s["score"] <= 1.0
        # any other answer loses in expectation; a sharp wrong answer loses a lot
        wrong = np.roll(x.truth, 3, axis=1)
        assert x.score(L.clamp_dist(wrong, L.item_mask(x.queries)))["reward_raw"] < s["reward_raw"]


def test_rules_are_json_and_disclose_everything():
    r = L.rules()
    json.dumps(r)
    for p in L.PARAMS:
        assert len(r["prior"][p]) == L.NG
    assert r["scoring"]["C"] == L.constants()["C"]
    assert "lfisim" in r["simulator"]


# ---- table-dependent ---------------------------------------------------------------------

@needs_tables
def test_tables_match_direct_fsp_and_constants():
    mdl = L.model(True)
    rng = np.random.default_rng(0)
    for h in rng.integers(L.NTH, size=4):
        pm = L.hypothesis_pmfs(int(h))
        for q in rng.choice(len(L.QUERY_ITEMS), 8, replace=False):
            it = L.QUERY_ITEMS[q]
            assert np.abs(mdl.QT[h, q] - L.query_truth(pm, it)).max() < 1e-5
        for d, (cond, t) in enumerate(L.DESIGNS):
            direct = (L.EXTRINSIC_P @ pm[cond][:, L.TIMES.index(t)]) @ L.capture_matrix(L.CAPTURE)
            assert np.abs(mdl.L[h, d] - direct).max() < 1e-5
    cst = L.constants()
    assert cst["C"] == pytest.approx(mdl.C, rel=1e-6)
    assert np.abs(cst["p0"] - mdl.p0).max() < 1e-9


@needs_tables
def test_posterior_matches_direct_likelihood():
    x = L.LfiLab()
    x.reset(5, "post")
    x.step({"condition": "standard", "time": 2, "cells": 40})
    x.step({"condition": "low_inducer", "time": 8, "cells": 30})
    lw = x.belief.log_weights()
    hs = [x.hypothesis, int(np.argmax(lw)), 1234, 8765]
    direct = []
    for h in hs:
        pm = L.hypothesis_pmfs(h)
        ll = 0.0
        for r in x.history:
            pc = (L.EXTRINSIC_P @ pm[r["condition"]][:, L.TIMES.index(r["time"])]) @ \
                L.capture_matrix(L.CAPTURE)
            ll += np.log(np.maximum(pc[r["counts"]], 1e-37)).sum()
        direct.append(ll)
    direct = np.array(direct)
    assert np.allclose(lw[hs] - lw[hs[0]], direct - direct[0], atol=1e-2)


@needs_tables
def test_reference_beats_random_and_shortcuts():
    rows = [L.evaluate_seed(s, "test") for s in range(6)]
    m = {k: np.mean([r[k] for r in rows]) for k in rows[0]}
    assert m["reference"] > 0.3
    assert m["reference"] > m["telegraph_moments"]
    assert m["reference"] > m["abc_mean_var"]
    assert m["truth"] >= m["reference"]
    assert abs(m["prior"]) < 1e-9
