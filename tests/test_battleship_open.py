"""Open-world Rulebound Battleship (bayesenv/battleship_open.py): a 7th hypothesis "other"."""

import numpy as np

from bayesenv import battleship as C
from bayesenv import battleship_open as O


def test_closed_world_untouched():
    assert C.K == 6 and not C.OPEN_WORLD and "other" not in C.NAMES
    assert O.K == 7 and O.OPEN_WORLD and O.NAMES[-1] == "other"
    assert C.geometry() is not O.geometry()
    assert C.geometry().n_rule.tolist() == [53624, 11520, 15960, 16864, 19208, 14848]


def test_other_likelihood_is_the_rectangle_mixture():
    g = O.geometry()
    assert np.allclose(g.lik.sum(1), 1.0) and np.isclose(g.w0.sum(), 1.0)
    # brute force: P(layout | other) = mean over rectangles of [inside] / (#layouts inside)
    lik = np.zeros(g.L)
    for m in g.rect_member:
        lik += m / m.sum()
    assert np.allclose(lik / len(g.rect_member), g.lik[-1])
    for r0, r1, c0, c1 in g.rects:
        assert (r1 - r0 + 1) * (c1 - c0 + 1) <= O.OTHER_MAX_AREA


def test_hidden_layout_lies_in_hidden_rectangle():
    g = O.geometry()
    n_other = 0
    for seed in range(300):
        lab = O.BattleshipLab()
        lab.reset(seed, "t-open")
        if O.NAMES[lab.hidden_rule] == "other":
            n_other += 1
            r0, r1, c0, c1 = lab.hidden_region
            cells = np.flatnonzero(g.occ[lab.hidden_layout])
            assert all(r0 <= c // 6 <= r1 and c0 <= c % 6 <= c1 for c in cells)
        else:
            assert lab.hidden_region is None
            assert g.member[lab.hidden_rule, lab.hidden_layout]
    assert 25 < n_other < 65          # about 300 / 7


def test_prior_scores_zero_and_closed_world_pays_on_other_boards():
    ref, closed = [], []
    for seed in range(40):
        lab = O.run_policy("none", "prior", seed, "t-open2")
        assert abs(lab.result["score_raw"]) < 1e-9
        r = O.run_policy("reference", "exact", seed, "t-open2").result
        c = O.run_policy("reference", "closed_world", seed, "t-open2").result
        assert c["submitted_rules"]["other"] == 0.0
        if r["hidden_rule"] == "other":
            ref.append(r["score_raw"])
            closed.append(c["score_raw"])
    assert ref and np.mean(closed) < np.mean(ref) - 0.5


def test_exact_rules_posterior_matches_brute_force():
    g = O.geometry()
    lab = O.run_policy("reference", "exact", 3, "t-open3")
    ll = np.zeros(g.L)
    for h in lab.history:
        if h["type"] == "fire":
            c = h["row"] * 6 + h["col"]
            ll += np.where(g.occ[:, c] == bool(h["result"]), np.log(0.9), np.log(0.1))
        else:
            line = (0 if h["axis"] == "row" else 6) + h["index"]
            with np.errstate(divide="ignore"):
                ll += np.log(g.scan_T[g.lines[line], h["result"]])
    A = np.exp(ll - ll.max())
    post = np.array([(g.lik[r] * A).sum() for r in range(O.K)])
    post /= post.sum()
    got = np.array([lab.result["exact_rules"][n] for n in O.NAMES])
    assert np.allclose(post, got, atol=1e-5)


def test_hard_world_infers_the_fire_noise_level():
    from bayesenv.battleship_worlds import load
    H = load("hard")
    assert H.UNKNOWN_NOISE and H.OPEN_WORLD and H.FIRE_LEVELS == (0.05, 0.15, 0.30)
    assert not C.UNKNOWN_NOISE and C.FIRE_LEVELS == (0.1,)
    lab = H.run_policy("reference", "exact", 2, "t-hard")
    noise = lab.result["exact_fire_noise"]
    assert abs(sum(noise.values()) - 1) < 1e-5
    assert lab.result["hidden_fire_noise"] in H.FIRE_LEVELS
    # with many repeated fires at one cell the error level becomes identifiable
    b = H.Belief()
    for i in range(40):
        b.update(0, int(i % 10 < 3))        # 30% of the reports disagree with the majority
    assert b.noise().argmax() == 2
