"""Export everything the static demo page (demo/index.html) needs, from the real engine.

    python scripts/build_demo_data.py            # writes demo/data.js

Nothing in demo/data.js is typed by hand: boards, noise draws, recorded games and their scores
come from bayesenv.battleship, the calibration table from results/battleship_calibration.json,
the wet-lab time courses from bayesenv.wetlab. The page's JavaScript engine is checked against
the `tests` block (node demo/src/verify.mjs).

Recorded players (no language model has played yet, so these are the documented proxies):
  reference  greedy information per shot + exact posterior
  coder      the reference's shots, but every report treated as exact (a typical coding bug)
  naive      human-style hunt/target shots + reports treated as exact
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from bayesenv import battleship as B  # noqa: E402
from bayesenv import wetlab as W  # noqa: E402

BOARDS = 6          # boards offered in the page, one per hidden rule
SEED_POOL = range(0, 200)
FIRST = 39          # the documented showcase board (docs/BATTLESHIP.md)
PLAYERS = {"reference": ("reference", "exact"), "coder": ("reference", "noiseless"),
           "naive": ("hunter", "noiseless")}


# Measured elsewhere in this repo and quoted on the page. Source: README.md "Headline numbers"
# (results/e7 for the agent row, docs/RESULTS.md E1 for the naive grader).
HEADLINE = [
    {"value": "0.24", "versus": "0.95",
     "text": "Claude Code with Opus 5.5 on the hyperbolic discounting task, against the "
             "Bayesian reference. It chose reasonable experiments, then stated beliefs that "
             "did not follow from its own data.",
     "short": "Claude Code with Opus 5.5 against the Bayesian reference.",
     "source": "README.md, headline numbers, hyperbolic discounting, 15 trials"},
    {"value": "0.92", "versus": "0",
     "text": "What a naive accuracy grader pays an agent that runs no experiments at all. "
             "Our reward pays it exactly 0.",
     "short": "What a naive grader pays an agent that runs no experiments. Ours pays 0.",
     "source": "README.md and docs/RESULTS.md, E1"},
]


def r(x, nd=5):
    return np.round(np.asarray(x, float), nd).tolist()


def noiseless_belief() -> B.Belief:
    g = B.geometry()
    tiny = 1e-6
    T = np.full_like(g.scan_T, tiny)
    np.fill_diagonal(T, 1.0)
    return B.Belief(fire_noise=tiny, scan_T=T / T.sum(1, keepdims=True))


def own_beliefs(lab: B.BattleshipLab, inference: str) -> list[dict]:
    """The player's OWN belief after each action (what its fog shows)."""
    if inference == "exact":
        return [{"rules": r(s["rules"]), "occ": r(s["occupancy"])} for s in lab.snapshots]
    b = noiseless_belief()
    out = [{"rules": r(b.rules()), "occ": r(b.occupancy())}]
    for a, y in lab.belief.obs:
        b.update(a, y)
        out.append({"rules": r(b.rules()), "occ": r(b.occupancy())})
    return out


def record(design: str, inference: str, seed: int, salt: str) -> dict:
    lab = B.run_policy(design, inference, seed, salt)
    res = lab.result
    return {
        "actions": [int(a) for a, _ in lab.belief.obs],
        "results": [int(y) for _, y in lab.belief.obs],
        "beliefs": own_beliefs(lab, inference),
        "exact": [{"rules": r(s["rules"]), "occ": r(s["occupancy"])} for s in lab.snapshots],
        "submitted_rules": r([res["submitted_rules"][n] for n in B.NAMES]),
        "submitted_occ": r(np.array(res["submitted_occupancy"]).ravel()),
        "score": {k: float(res[k]) for k in
                  ("score_raw", "score", "rule_part", "cell_part", "design", "inference")},
    }


def board(seed: int) -> dict:
    salt = f"demo-{seed}"
    lab = B.BattleshipLab()
    lab.reset(seed, salt)
    g = B.geometry()
    key = B.salted_key(seed, salt, lab.TAG_NOISE)
    u = [float(np.random.default_rng(key + [i]).random()) for i in range(B.BUDGET)]
    return {
        "seed": seed, "rule": lab.hidden_rule, "layout": lab.hidden_layout,
        "ships": g.layout_cells(lab.hidden_layout), "u": u,
        "runs": {k: record(d, i, seed, salt) for k, (d, i) in PLAYERS.items()},
    }


def pick_boards() -> list[int]:
    """FIRST, then the first seed for each remaining hidden rule, so all six rules appear."""
    chosen, seen = [FIRST], set()
    lab = B.BattleshipLab()
    lab.reset(FIRST, f"demo-{FIRST}")
    seen.add(lab.hidden_rule)
    for s in SEED_POOL:
        if len(chosen) == BOARDS:
            break
        lab.reset(s, f"demo-{s}")
        if lab.hidden_rule not in seen:
            seen.add(lab.hidden_rule)
            chosen.append(s)
    return chosen


def engine_tests(n: int = 6) -> list[dict]:
    """Random action sequences with the exact posterior, EIG and scores, for the JS port."""
    g = B.geometry()
    rng = np.random.default_rng(20261115)
    out = []
    for t in range(n):
        seed, salt = 1000 + t, "jstest"
        lab = B.BattleshipLab()
        lab.reset(seed, salt)
        while lab.remaining > 0:
            ok = [a for a in range(B.N_ACTIONS) if B.action_cost(a) <= lab.remaining]
            lab.step_id(int(rng.choice(ok)))
        key = B.salted_key(seed, salt, lab.TAG_NOISE)
        q = rng.dirichlet(np.ones(B.K))
        s_exact = B.score(lab.belief.rules(), lab.belief.occupancy(), lab.hidden_rule,
                          lab.hidden_layout)
        s_q = B.score(q, lab.belief.occupancy(), lab.hidden_rule, lab.hidden_layout)
        out.append({
            "rule": lab.hidden_rule, "layout": lab.hidden_layout,
            "u": [float(np.random.default_rng(key + [i]).random()) for i in range(B.BUDGET)],
            "actions": [int(a) for a, _ in lab.belief.obs],
            "results": [int(y) for _, y in lab.belief.obs],
            "rules": lab.belief.rules().tolist(), "occ": lab.belief.occupancy().tolist(),
            "eig": lab.belief.eig().tolist(),
            "greedy": B.greedy_action(lab.belief, 2),
            "score_exact": s_exact, "q": q.tolist(), "score_q": s_q,
        })
    return out


def wetlab_curves() -> dict:
    """Product time courses for each mechanism under one run design (prior draws of the rates)."""
    action = {"substrate": 120, "catalyst": 3, "product_spike": 0, "temperature": 300,
              "sample_times": [5.0, 15.0, 40.0]}
    out = {"action": action, "sigma": W.SIGMA, "mechanisms": []}
    for name, text, _, _ in W.MECHANISMS:
        tr = W.simulate_trajectories(name, None, action, n=14, points=60, t_max=40.0, seed=7)
        out["mechanisms"].append({"name": name, "text": text, "t": r(tr["t"], 2),
                                  "P": [[int(v) for v in row] for row in tr["P"]]})
    return out


def main() -> None:
    g = B.geometry()
    cal = json.loads((ROOT / "results" / "battleship_calibration.json").read_text())
    keep = ("reference", "noise_ignoring_coder", "naive_human", "hunter_design", "random_design",
            "do_nothing", "gamble_one_rule", "cheat_full")
    data = {
        "constants": {"N": B.N, "ships": list(B.SHIPS), "budget": B.BUDGET,
                      "fire_noise": B.FIRE_NOISE,
                      "scan_noise": [B.SCAN_NOISE[-1], B.SCAN_NOISE[0], B.SCAN_NOISE[1]],
                      "eps": B.EPS, "L": int(g.L), "n_rule": g.n_rule.tolist(),
                      "cell_norm": g.cell_norm, "p0": g.p0.tolist()},
        "rules": [{"name": n, "text": d} for n, d in B.RULES],
        "boards": [board(s) for s in pick_boards()],
        "calibration": {"seeds": cal["seeds"], "policies": {
            k: {"score_raw": cal["policies"][k]["score_raw"],
                "score_harbor": cal["policies"][k]["score_harbor"],
                "design": cal["policies"][k]["design"],
                "inference": cal["policies"][k]["inference"]} for k in keep}},
        "headline": HEADLINE,
        "wetlab": wetlab_curves(),
        "tests": engine_tests(),
        # Slots for measured language-model results. Leave null until the runs exist; the page
        # shows "not yet measured" for every null. Schema in demo/README.md.
        "llm": {"base": None, "tuned": None, "transfer": None},
    }
    out = ROOT / "demo" / "data.js"
    out.parent.mkdir(exist_ok=True)
    out.write_text("window.DEMO_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print(f"wrote {out} ({out.stat().st_size / 1e3:.0f} kB), boards "
          f"{[(b['seed'], B.NAMES[b['rule']]) for b in data['boards']]}")
    for b in data["boards"]:
        print(b["seed"], {k: round(v["score"]["score_raw"], 3) for k, v in b["runs"].items()})


if __name__ == "__main__":
    main()
