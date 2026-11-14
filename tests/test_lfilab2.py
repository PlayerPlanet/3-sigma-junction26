"""LFI lab v2 (two species): FSP against the shipped Gillespie simulator and exact linear
moments, the truncation certificate, the 1-D approximation, reward and environment contract.
Table-dependent tests run where the exact tables exist (Modal: experiments/lfilab2_modal.py
::tests; locally after ::fetch)."""

import json
import math

import numpy as np
import pytest
from scipy.linalg import expm

from bayesenv import lfilab2 as L
from bayesenv import lfilab2_sim as S

HAVE_TABLES = L.table_path("exact").exists()
needs_tables = pytest.mark.skipif(not HAVE_TABLES, reason="v2 FSP tables not available")
CHEAP = (1.0, 1.0, 8.0, 2.0, 1.0)      # k_on, k_off, K, k_tx, k_tl: small state space


def tv(p, q):
    n = max(len(p), len(q))
    return 0.5 * np.abs(np.pad(p, (0, n - len(p))) - np.pad(q, (0, n - len(q)))).sum()


def mixture_direct(kon, koff, K, ktx, ktl, u=1.0):
    outs = [L.fsp2(u * kon, koff, K, ktx * math.sqrt(2) ** j, ktl) for j in L.EXTRINSIC_J]
    return {r: sum(w * o[r] for w, o in zip(L.EXTRINSIC_P, outs)) for r in L.READOUTS}


@pytest.mark.parametrize("cond", ["standard", "feedback_blocked"])
def test_fsp2_matches_gillespie_simulator(cond):
    kon, koff, K, ktx, ktl = CHEAP
    mix = mixture_direct(kon, koff, K if cond == "standard" else math.inf, ktx, ktl)
    for t in (2.0, 8.0):
        for r in L.READOUTS:
            exact = mix[r][L.TIMES.index(t)]
            c = S.simulate(kon, koff, ktx, K, ktl, t, 30_000, cond, r, seed=3)
            emp = np.bincount(c, minlength=len(exact)) / len(c)
            assert tv(exact, emp) < 0.02, (cond, t, r)


def test_fsp2_means_match_linear_moments_without_feedback():
    kon, koff, _, ktx, ktl = CHEAP
    res = L.fsp2(kon, koff, math.inf, ktx, ktl)
    A = np.zeros((4, 4))           # (1, g, m, p)
    A[1, 0], A[1, 1] = kon, -kon - koff
    A[2, 1], A[2, 2] = ktx, -1
    A[3, 2], A[3, 3] = ktl, -S.GAMMA_P
    for i, t in enumerate(L.TIMES):
        x = expm(A * t) @ np.array([1.0, 0, 0, 0])
        for r, mean, eta in (("rna", x[2], S.CAPTURE_RNA), ("protein", x[3], S.CAPTURE_PROTEIN)):
            got = res[r][i] @ np.arange(res[r].shape[1])
            assert abs(got - eta * mean) < 1e-6, (t, r)


def test_truncation_certificate_grows_protein_bound():
    res = L.fsp2(*CHEAP, P=5)                   # far too small: must be enlarged until certified
    assert res["leak"] <= L.LEAK_MAX and res["tail"] < L.TAIL_MAX
    ref = L.fsp2(*CHEAP)
    for r in L.READOUTS:
        assert np.abs(res[r] - ref[r]).max() < 2e-6


def test_one_d_approximation_exact_for_rna_without_feedback_only():
    kon, koff, K, ktx, ktl = CHEAP
    ex, ap = L.fsp2(kon, koff, math.inf, ktx, ktl), L.fsp_approx(kon, koff, math.inf, ktx, ktl)
    assert np.abs(ex["rna"] - ap["rna"]).max() < 1e-8
    assert np.abs(ex["protein"] - ap["protein"]).max() > 1e-3        # protein layer is approximate
    ex, ap = L.fsp2(2.0, 0.5, 4.0, 4.0, 2.0), L.fsp_approx(2.0, 0.5, 4.0, 4.0, 2.0)
    assert np.abs(ex["rna"] - ap["rna"]).max() > 1e-3                # feedback via protein is not 1-D


def test_item_distributions():
    pc = np.array([0.5, 0.2, 0.1, 0.1, 0.1])
    d = L.item_dist(pc, ("standard", 1.0, "rna", 2))
    assert abs(d.sum() - 1) < 1e-12 and len(d) == L.NB_MAX
    s = L.item_dist(pc, ("standard", 1.0, "protein", None))
    assert s[0] == 0.5 and abs(s.sum() - 1) < 1e-12


def test_simulator_extrinsic_capture_and_feedback():
    out = S.simulate(1.0, 1.0, 4.0, 2.0, 1.0, 8.0, 20_000, readout="protein", seed=0, return_state=True)
    assert np.all(out["counts"] <= out["p"])
    assert abs(out["counts"].sum() / out["p"].sum() - S.CAPTURE_PROTEIN) < 0.01
    blocked = S.simulate(1.0, 1.0, 4.0, 2.0, 1.0, 8.0, 20_000, "feedback_blocked", "protein", seed=0)
    assert blocked.mean() > 1.2 * out["counts"].mean()


# ---- table-dependent ---------------------------------------------------------------------

def lab(seed=0, salt="s", tables=False):
    x = L.LfiLab2(tables=tables)
    x.reset(seed, salt)
    return x


@needs_tables
def test_tables_match_direct_fsp():
    tab = L.fsp_tables("exact")
    rng = np.random.default_rng(0)
    jobs = L.fsp_jobs()
    for i in rng.choice(len(jobs), 4, replace=False):
        kind, idx = jobs[i]
        r = L.job_rates(kind, idx)
        if r[3] * r[4] > 20:                   # keep the test fast: skip the largest solves
            continue
        direct = L.fsp2(*r)
        pre = "FB" if kind == "fb" else "NF"
        for ro in L.READOUTS:
            assert np.abs(tab[f"{pre}_{ro}"][idx] - direct[ro]).max() < 1e-6
    assert float(tab["max_leak"]) < L.LEAK_MAX and float(tab["max_tail"]) < L.TAIL_MAX


@needs_tables
def test_determinism_invalid_actions_budget_and_submission():
    a, b = lab(3, "x"), lab(3, "x")
    assert a.hypothesis == b.hypothesis and a._queries == b._queries
    act = {"condition": "standard", "time": 4, "readout": "protein", "cells": 30}
    assert a.step(act)["result"]["counts"] == b.step(act)["result"]["counts"]
    assert len({lab(3, f"s{i}").hypothesis for i in range(6)}) > 1
    x = lab()
    for bad in [{"condition": "feedback_blocked", "time": 4, "readout": "rna", "cells": 20},
                {"condition": "standard", "time": 3, "readout": "rna", "cells": 20},
                {"condition": "standard", "time": 4, "readout": "dna", "cells": 20},
                {"condition": "standard", "time": 4, "readout": "rna", "cells": 5},
                {"condition": "standard", "time": 4, "readout": "rna", "cells": 10_000},
                {"condition": "standard", "time": 4, "cells": 20}, "rna"]:
        with pytest.raises(ValueError):
            x.step(bad)
    assert x.cells_used == 0 and not x.history
    x.step({"condition": "standard", "time": 1, "readout": "rna", "cells": L.CELL_BUDGET - 10})
    with pytest.raises(ValueError):
        x.step({"condition": "standard", "time": 1, "readout": "rna", "cells": 11})
    with pytest.raises(RuntimeError):
        x.submit([])
    q = x.finish()["queries"]
    assert len(q) == L.N_QUERIES and all("prior_predictive" not in e for e in q)
    with pytest.raises(RuntimeError):
        x.step({"condition": "standard", "time": 1, "readout": "rna", "cells": 10})
    with pytest.raises(ValueError):
        x.submit([[1.0]] * L.N_QUERIES)
    p0 = L.p0_of(x.queries)
    x.submit([row[:L.item_nbins(it)].tolist() for row, it in zip(p0, x.queries)])
    assert abs(x.result["reward_raw"]) < 1e-9
    with pytest.raises(RuntimeError):
        x.submit(p0)


@needs_tables
def test_truth_scores_most_and_rules():
    x = lab(1)
    x.finish()
    s = x.score(x.truth)
    assert s["reward_raw"] == pytest.approx(s["raw_knowing_truth"]) and 0 <= s["score"] <= 1
    wrong = L.clamp_dist(np.roll(x.truth, 2, axis=1), L.item_mask(x.queries))
    assert x.score(wrong)["reward_raw"] < s["reward_raw"]
    r = L.rules()
    json.dumps(r)
    assert "prior_predictive" not in json.dumps(r["queries"])
    assert all(len(r["prior"][p]) == n for p, n in zip(L.PARAMS, L.SHAPE))


@needs_tables
def test_model_constants_and_posterior_vs_direct_likelihood():
    mdl = L.model("exact")
    cst = L.constants()
    assert cst["C"] == pytest.approx(mdl.C, rel=1e-6)
    assert np.abs(cst["p0"] - mdl.p0).max() < 1e-9
    x = lab(5, "post", tables=True)
    x.step({"condition": "standard", "time": 4, "readout": "rna", "cells": 40})
    x.step({"condition": "low_inducer", "time": 16, "readout": "protein", "cells": 30})
    lw = x.belief.log_weights()
    hs = [x.hypothesis, int(np.argmax(lw)), 1234, 20000]
    direct = []
    for h in hs:
        pm = L.hypothesis_pmfs(h)
        ll = 0.0
        for rec in x.history:
            pc = L.EXTRINSIC_P @ pm[(rec["condition"], rec["readout"])][:, L.TIMES.index(rec["time"])]
            ll += np.log(np.maximum(pc[rec["counts"]], 1e-37)).sum()
        direct.append(ll)
    direct = np.array(direct)
    assert np.allclose(lw[hs] - lw[hs[0]], direct - direct[0], atol=1e-2)


@needs_tables
def test_reference_beats_shortcuts():
    rows = [L.evaluate_seed(s, "test") for s in range(4)]
    m = {k: np.mean([r[k] for r in rows]) for k in rows[0]}
    assert m["reference"] > 0.2
    assert m["reference"] > m["abc_mean_var"] and m["reference"] > m["approx_1d"]
    assert m["truth"] >= m["reference"] and abs(m["prior"]) < 1e-9
