"""Export everything the static demo page (demo/index.html) needs, from the real engine.

    python scripts/build_demo_data.py            # writes demo/data.js

Nothing in demo/data.js is typed by hand: boards, noise draws, recorded games and their scores
come from bayesenv.battleship, the calibration table from results/battleship_calibration.json,
the wet-lab time courses from bayesenv.wetlab. The page's JavaScript engine is checked against
the `tests` block (node demo/src/verify.mjs).

The measured results quoted on the page (`measured`) are read from results/blackbox_v2/trials.csv
and results/battleship_harbor/.

Recorded players in the in-browser game (documented proxies, labelled on the page):
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


# Measured numbers quoted on the page. The rewards are computed here from the tracked trial
# records, not typed by hand; the sentences quote README.md. The old "0.24 vs 0.95" headline
# (hyperbolic discounting) is retracted in the paper: that task withheld the model, and Opus
# scored 0.98 once it was stated. Do not bring it back.
DESK_NAMES = {  # trials.csv `agent` -> label on the page
    "reference": "Reference", "claude-opus-5.5": "Claude Opus 5.5",
    "claude-sonnet-5.5": "Claude Sonnet 5.5", "kimi-k3.1-pro": "Kimi K3.1 Pro",
    "gemini-4-carbon": "Gemini 4 Carbon", "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
    "gemini-4-argon": "Gemini 4 Argon", "minimax-m3": "MiniMax-M3",
    "gpt-5.6-terra": "GPT-5.6 Terra", "nemotron-3-ultra": "Nemotron 3 Ultra",
}
INTEGRITY = [  # reward-integrity facts, each measured; sources in `source`
    {"value": "0", "text": "What doing nothing scores on the credit desk (4 Harbor trials).",
     "source": "README.md, Results table, Do nothing (-a nop)"},
    {"value": "54 / 54",
     "text": "Graded trials that results/blackbox_v2/regrade.py re-checks from the grader's "
             "record in under a second (0.15 s): 0 mismatches.",
     "source": "README.md, 'Check our numbers in under a second'"},
    {"value": "0.92", "versus": "0",
     "text": "What a naive accuracy grader pays an agent that runs no experiments. Ours pays 0.",
     "source": "docs/RESULTS.md, E1 (hyperbolic discounting)"},
]
TRAINING = {  # quoted from README.md "Training on the reward"
    "before": "0.00", "after": "0.28", "pm": "0.05",
    "text": "GRPO on our reward raised Gemma 4 E2B from 0.00 to 0.28 ± 0.05 on the six credit "
            "desks: the level of one-step lookahead, far below the reference. Its gains on "
            "other tasks are a learned bias towards gathering information, not better "
            "experiment choice.",
    "source": "README.md, 'Training on the reward'; paper, Training section",
}
STATED = {  # quoted from README.md "How we got here" and paper Table 'stated'
    "count": 11,
    "text": "Stated-model environments where agents with a shell (Claude Code with Opus 5.5) "
            "wrote exact inference and matched the reference.",
    "source": "README.md, 'How we got here'; paper, Table 'Stated-model environments'",
}


def desk_results() -> dict:
    """Mean reward per agent on the black-box credit desk, from results/blackbox_v2/trials.csv."""
    import csv
    rows: dict[str, list[float]] = {}
    harness: dict[str, str] = {}
    with open(ROOT / "results" / "blackbox_v2" / "trials.csv", newline="") as f:
        for t in csv.DictReader(f):
            rows.setdefault(t["agent"], []).append(float(t["reward"]))
            harness[t["agent"]] = t["harness"]
    out = [{"name": DESK_NAMES.get(k, k), "harness": harness[k], "n": len(v),
            "mean": round(float(np.mean(v)), 2), "reference": k == "reference"}
           for k, v in rows.items()]
    out.sort(key=lambda x: (not x["reference"], -x["mean"]))
    out.append({"name": "Do nothing", "harness": "-", "n": 4, "mean": 0.0, "reference": False,
                "source": "README.md, Results table"})
    return {"rows": out, "trials": sum(len(v) for v in rows.values()),
            "source": "results/blackbox_v2/trials.csv",
            "opus": "Opus decides within $1–35 of the true-model optimum, but buys an extra "
                    "$200–500 of calibration data, which buys back at most about $170.",
            "opus_source": "README.md, 'What the decomposition shows'"}


def battleship_harbor() -> dict:
    """Claude Code + Opus 5.5 against the reference on Rulebound Battleship (Harbor trials)."""
    base = ROOT / "results" / "battleship_harbor"
    def rewards(prefix):
        return [float(p.read_text()) for p in sorted(base.glob(f"{prefix}*/*/verifier/reward.txt"))]
    opus, ref = rewards("bs-opus"), rewards("bs-oracle")
    return {"opus": round(float(np.mean(opus)), 2), "opus_n": len(opus),
            "reference": round(float(np.mean(ref)), 2), "reference_n": len(ref),
            "source": "results/battleship_harbor/bs-opus*, bs-oracle* (verifier/reward.txt)"}


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
        "measured": {"desk": desk_results(), "battleship": battleship_harbor(),
                     "integrity": INTEGRITY, "training": TRAINING, "stated": STATED},
        "wetlab": wetlab_curves(),
        "tests": engine_tests(),
        # Slots for language-model games in the in-browser Battleship. Leave null until the runs
        # exist; the page then shows the labelled proxy. `transfer` is no longer drawn on the
        # page (empty bars were cut). Schema in demo/README.md.
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
