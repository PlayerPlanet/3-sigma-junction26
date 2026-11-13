"""Reward-integrity tests for the environment logic (no Docker needed).

Every exploit the team (or a judge) finds should become a test here.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "tasks/example-env/environment/mcp-server"))
from game import ActionError, Game  # noqa: E402


def solve(game: Game) -> int:
    lo, hi = game.low, game.high
    while True:
        mid = (lo + hi) // 2
        r = game.probe(mid)
        if r == "correct":
            return mid
        lo, hi = (mid + 1, hi) if r == "higher" else (lo, mid - 1)


@pytest.fixture
def game() -> Game:
    return Game(seed=1337)


def test_do_nothing_scores_zero(game):
    assert game.grade()["reward"] == 0.0


def test_stop_early_scores_zero(game):
    game.probe(500)
    game.submit(500 if game._target != 500 else 501)
    assert game.grade()["reward"] == 0.0


def test_completing_the_task_beats_every_baseline(game):
    game.submit(solve(game))
    assert game.grade()["reward"] >= 0.5


def test_efficiency_is_rewarded():
    fast, slow = Game(seed=1), Game(seed=1)
    fast.submit(solve(fast))
    for _ in range(3):
        slow.probe(slow.low)
    slow.submit(solve(slow))
    assert fast.grade()["reward"] > slow.grade()["reward"]


def test_only_first_submission_counts(game):
    game.submit(-1)
    with pytest.raises(ActionError):
        game.submit(game._target)
    assert game.grade()["reward"] == 0.0


def test_budget_is_enforced(game):
    for _ in range(game.budget):
        game.probe(game.low)
    with pytest.raises(ActionError):
        game.probe(game.low)


def test_illegal_actions_do_not_change_state(game):
    with pytest.raises(ActionError):
        game.probe(game.high + 1)
    assert game.probes_used == 0


def test_seed_is_reproducible():
    assert Game(seed=7)._target == Game(seed=7)._target
