"""Tests for the Battleship design rows (bayesenv/battleship_rows.py)."""

import json
import re

import pytest

from bayesenv import battleship as B
from bayesenv import battleship_rows as R

ROWS = R.generate("heldout_instance", 60)


def history(row):
    acts = [R.action_of(json.loads(m["content"][len("<observe>"):-len("</observe>")]))
            for m in row["prompt"] if m["role"] == "assistant"]
    res = [int(re.match(r"Result: (\d+)\.", m["content"]).group(1))
           for m in row["prompt"][3::2]]
    return acts, res


def test_design_encoding_round_trip_and_rejects():
    for a in range(B.N_ACTIONS):
        assert R.action_of(R.design_of(a)) == a
    for bad in ([0, 6, 0], [1, 2, 0], [2, 0, 0], [0, 1.5, 2], [0, 1], [1, 0, -1]):
        with pytest.raises(ValueError):
            R.action_of(bad)


def test_reference_answer_scores_one_and_others_less():
    for r in ROWS:
        assert R.design_reward(r, R.reference_answer(r)) == 1.0
        assert R.design_reward(r, "no tag") == 0.0
        assert R.design_reward(r, "<observe>[0, 9, 9]</observe>") == 0.0
        assert len({tuple(c) for c in r["candidates"]}) == R.N_CANDIDATES


def test_labels_are_exact_and_recomputable_from_the_printed_history():
    for r in ROWS[:25]:
        acts, res = history(r)
        assert len(acts) == r["depth"]
        b = B.Belief()
        for a, y in zip(acts, res):
            b.update(a, y)
        eig = b.eig()
        for c, e, en, cost in zip(r["candidates"], r["eig"], r["eig_nats"], r["cost"]):
            a = R.action_of(c)
            assert cost == B.action_cost(a) and cost <= r["budget_remaining"]
            assert abs(eig[a] - en) < 1e-4 and abs(eig[a] / cost - e) < 1e-4


def test_rows_hide_the_truth_and_are_deterministic():
    s = json.dumps(ROWS)
    assert "hidden" not in s and "theta" not in s
    again = R.generate("heldout_instance", 60)
    assert json.dumps(again) == s
    assert {r["split"] for r in ROWS} == {"heldout_instance"}
    assert {r["source"] for r in ROWS} == set(R.SOURCES)
    assert all(r["prompt"][0]["role"] == "system" and r["prompt"][-1]["role"] == "user" for r in ROWS)


def test_train_and_heldout_seeds_do_not_overlap():
    tr = R.generate("train", 30)
    assert not {r["seed"] for r in tr} & {r["seed"] for r in ROWS}
