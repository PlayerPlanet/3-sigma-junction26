"""Tests for the NeuronBench lab (bayesenv.neuron, bayesenv.neuron_ref). Skipped unless
`neuronbench` is importable: put a checkout of https://github.com/murphyk/neuronbench at the
pinned commit on PYTHONPATH, or set NEURONBENCH_SRC to it.

Kept fast: the benchmark's simulator costs about a second per call, so the labs here use two
test protocols and a few target repeats instead of six and 200.
"""

import json
import os
import sys

import numpy as np
import pytest

if os.environ.get("NEURONBENCH_SRC"):
    sys.path.insert(0, os.environ["NEURONBENCH_SRC"])
nb = pytest.importorskip("neuronbench")

from bayesenv import neuron as N  # noqa: E402
from bayesenv import neuron_ref as R  # noqa: E402

BRIEF = "brief step (12 uA, 40 ms)"
SMALL = {"target_reps": 4, "n_test": 2}


def make(seed=0, salt="s", family="d_type", **kw):
    lab = N.NeuronLab(**{**SMALL, **kw})
    lab.reset(seed, salt, family=family)
    return lab


def test_deterministic_under_seed_and_salt():
    a, b, c = make(), make(), make(salt="other")
    ra, rb, rc = (x.step({"protocol": BRIEF}) for x in (a, b, c))
    assert ra == rb
    assert ra["voltage"] != rc["voltage"]
    assert a.rules() == b.rules()
    assert a.rules()["test_protocols"] != c.rules()["test_protocols"]
    assert a.world._truth_kwargs["extra"][0] == b.world._truth_kwargs["extra"][0]
    assert a.world._truth_kwargs["extra"][0] != c.world._truth_kwargs["extra"][0]


def test_hidden_cell_is_not_a_public_world():
    lab = make()
    public = nb.worlds.WORLDS["d_type"]
    assert lab.world._truth_kwargs["extra"][0] != public["alt"]["extra"][0]
    assert [s for _, s in lab.world.test_protocols] != [s for _, s in public["test"]][:2]
    # the public constructor with the task's world name and seed gives a different cell
    assert nb.load_world("d_type", seed=0)._truth_kwargs != lab.world._truth_kwargs
    # without the salt the draw differs too
    assert N.hidden_spec("d_type", 0, None)["alt"] != N.hidden_spec("d_type", 0, "s")["alt"]
    # the family can be drawn from the salt
    fams = {N.hidden_spec(None, 0, f"salt{i}")["family"] for i in range(40)}
    assert len(fams) >= 4


def test_truth_not_in_anything_the_agent_receives():
    lab = make(family="ca_rebound")
    obs = lab.step({"protocol": BRIEF})
    text = json.dumps([lab.rules(), obs])
    truth = lab.world._truth_kwargs["extra"][0]
    for word in ("ca_rebound", "rebound", "T-type", "_private_", lab._key, "discriminat",
                 "family", repr(truth.g), repr(truth.htau), repr(truth.mvh)):
        assert word not in text, word
    assert set(obs) == {"protocol", "segments", "blockers", "reps", "cost", "spike_count",
                        "voltage", "time_ms", "test_start_index", "budget_remaining"}
    labels = [t["label"] for t in lab.rules()["test_protocols"]]
    assert labels == ["T1", "T2"]
    # rules are the same text for every novel family apart from the test protocols
    other = make(family="h_sag").rules()
    mine = lab.rules()
    assert {k: v for k, v in mine.items() if k != "test_protocols"} == \
           {k: v for k, v in other.items() if k != "test_protocols"}


def test_budget_enforced_and_invalid_actions_cost_nothing():
    lab = make(budget=3)
    bad = [{"protocol": "T1"}, {"protocol": "no such"}, {"protocol": BRIEF, "reps": 0},
           {"protocol": BRIEF, "reps": 4}, {"protocol": BRIEF, "reps": 1.5},
           {"protocol": BRIEF, "blockers": ["XYZ"]}, {"protocol": BRIEF, "amplitude": 5.0},
           {"amplitude": 5.0}, {"amplitude": float("nan"), "duration_ms": 50},
           {"amplitude": 99.0, "duration_ms": 50}, {"amplitude": 5.0, "duration_ms": 5000},
           {"segments": [[10, 5]]}, {}, "x"]
    for a in bad:
        with pytest.raises(ValueError):
            lab.step(a)
    assert lab.budget == 3 and lab.history == []
    lab.step({"protocol": BRIEF, "reps": 2, "blockers": ["TTX"]})
    assert lab.budget == 1 and lab.history[0]["spike_count"] == 0.0     # TTX silences the cell
    lab.step({"amplitude": 8.0, "duration_ms": 30.0})
    assert lab.budget == 0
    with pytest.raises(RuntimeError):
        lab.step({"protocol": BRIEF})


def test_submission_validation_and_scores():
    lab = make()
    g0 = lab.grade()
    assert g0["score"] == 0.0 and g0["submitted"] == 0.0          # no submission = 0
    tg, pr = lab.targets(), lab.prior_forecast()
    for bad in ({"T1": 1.0}, {"T1": 1.0, "T2": float("inf")}, {"T1": 1.0, "T2": -1.0},
                {"T1": 1.0, "T2": 2.0, "T3": 3.0}, {"T1": "a", "T2": 1.0}, [1, 2]):
        with pytest.raises(ValueError):
            lab.submit(bad)
    assert lab.forecasts is None                                   # rejected, not used up
    lab.submit(dict(tg))
    with pytest.raises(RuntimeError):
        lab.submit(dict(tg))
    with pytest.raises(RuntimeError):
        lab.step({"protocol": BRIEF})
    g = lab.grade()
    assert g["mse_agent"] == 0.0
    if g["mse_prior"] >= N.MIN_PRIOR_MSE:
        assert g["score"] == 1.0
    # the metric is the benchmark's own: same number as World.spike_forecast_mse
    ev = nb.evaluator
    assert g["mse_prior"] == ev.forecast_mse(pr, tg)
    # prior forecast scores exactly 0; a terrible forecast is clipped to 0; all in [0, 1]
    for forecast, expect in ((pr, 0.0), ({k: v + 50 for k, v in tg.items()}, 0.0)):
        other = make()
        other._targets, other._prior = tg, pr
        other.submit(forecast)
        s = other.grade()["score"]
        assert s == expect and 0.0 <= s <= 1.0


def test_metric_matches_world_spike_forecast_mse():
    lab = make(target_reps=200, n_test=1)        # World.spike_forecast_mse hard-codes 200 repeats
    pred = {"T1": 3.0}
    assert nb.evaluator.forecast_mse(pred, lab.targets()) == lab.world.spike_forecast_mse(pred)


def test_batched_simulator_agrees_with_neuronbench():
    seg = [(40, 12.0)]
    ch = nb.worlds.Chan("X", g=6.0, E=-77.0, mvh=-35.0, mk=10.0, mtau=20.0)
    cand = R.stack([R.PLAIN, dict(g=6.0, E=-77.0, mvh=-35.0, mk=10.0, mtau=20.0)])
    ours = R.simulate_batch(seg, cand, 150, 100.0, np.random.default_rng(0))["count"]
    current, _, ts = nb.stochastic.make_protocol(seg)
    for i, mech in enumerate(({"extra": [], "slow_na": False}, {"extra": [ch], "slow_na": False})):
        v = nb.stochastic.run_particles(150, current, mech, 100.0, np.random.default_rng(1))
        theirs = nb.features.spike_count(v, ts)
        se = np.hypot(ours[i].std(), theirs.std()) / np.sqrt(150)
        assert abs(ours[i].mean() - theirs.mean()) < 4 * se + 0.05
    assert ours[0].mean() - ours[1].mean() > 0.5        # the extra K current does something
    i_ours, ts_ours, _ = R.build_current(seg)
    assert ts_ours == ts and np.array_equal(i_ours, current)


def test_reference_plan_is_valid_and_within_budget():
    lab = make()
    runs = R.plan(lab.rules())
    assert sum(r["reps"] for r in runs) == N.BUDGET
    for r in runs:
        N.validate_run(r, N.BUDGET)
