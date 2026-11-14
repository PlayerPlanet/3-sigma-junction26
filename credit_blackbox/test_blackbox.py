"""Small tests for the black-box credit task engine. run: pytest -q test_blackbox.py (from harbor_bb/)"""
import asyncio, json, sys
import numpy as np
import pytest
sys.path.insert(0, "template/environment/mcp-server"); sys.path.append("template/solution")
import credit_core as cc
import bbpub as P
import bbsecret as Z
import bblab as L
import refpolicy

META = {int(k): v for k, v in json.load(open("build_meta.json")).items()}
D = sorted(META)[0]
SEEDS = META[D]["seeds"]


def lab(salt="t"):
    return L.Lab(D, SEEDS, salt, META[D]["V_ref"])


def rules(lb):
    return {"segments": P.SEGMENTS, "applicant_priors": [L.applicant_prior(s) for s in lb.seeds],
            "payoff": {"loss_given_default": L.PR * cc.M, "margin_if_repaid": cc.M},
            "sandbox": {"max_draws_per_episode": L.SIM_MAX_TOTAL}}


def play(lb, pol):
    async def call(tool, a):
        return rules(lb) if tool == "get_rules" else getattr(lb, tool)(**a)
    asyncio.run(refpolicy.play(call, pol))
    return lb.grade()


def test_determinism_and_salt():
    a, b, c = lab("x"), lab("x"), lab("y")
    assert a.simulate("S1", "bureau", 5)["scores"] == b.simulate("S1", "bureau", 5)["scores"]
    assert a.run_check("bank") == b.run_check("bank")
    assert [w[0] for w in a.worlds] == [w[0] for w in b.worlds]
    assert a.simulate("S1", "bureau", 5)["scores"] != c.simulate("S1", "bureau", 5)["scores"]


def test_sandbox_and_live_streams_independent():
    a, b = lab("x"), lab("x")
    a.simulate("S3", "income", 50)            # sandbox use must not change live readings
    assert [a.run_check("income")["band_index"] for _ in range(3)] == [b.run_check("income")["band_index"] for _ in range(3)]


def test_invalid_actions_and_limits():
    lb = lab()
    for bad in [lambda: lb.run_check("x"), lambda: lb.decide("maybe"), lambda: lb.simulate("S9", "bank", 1),
                lambda: lb.simulate("S1", "bank", 0), lambda: lb.simulate("S1", "bank", 51)]:
        with pytest.raises(ValueError):
            bad()
    assert lb.sim_draws == 0 and lb.counts[0].sum() == 0
    for _ in range(cc.T):
        lb.run_check("bureau")
    with pytest.raises(ValueError):
        lb.run_check("bureau")
    for _ in range(L.SIM_MAX_TOTAL // 50):
        lb.simulate("S2", "bank", 50)
    with pytest.raises(ValueError):
        lb.simulate("S2", "bank", 1)


def test_decline_all_scores_zero_and_undecided_is_decline():
    assert play(lab(), "decline")["score"] == 0.0
    g = lab().grade()
    assert g["score"] == 0.0 and g["n_decided"] == 0


def test_reference_beats_baselines():
    s = {p: np.mean([play(lab(f"s{k}"), p)["score"] for k in range(2)]) for p in ("ref", "naive", "guess", "over")}
    assert s["ref"] > 0.6
    for p in ("naive", "guess", "over"):
        assert s[p] < s["ref"] - 0.2, (p, s)
