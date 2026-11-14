"""Turn Harbor grader records (verifier/details.json) of the diagnostic lab into replay traces
for the 3D viewer in demo/planning-lab/.

    uv run --no-project --with numpy --with scipy --with pyyaml python scripts/export_diag_trace.py \
        --agent-runs <dir with <trial>/verifier/details.json> --agent-name "Opus" \
        --oracle-runs <dir of optimal-policy runs> \
        --out demo/planning-lab/traces.js

A grader record lists the tests an agent ran and the readings it saw, but not its belief
after each step. This script pushes the recorded (test, reading) pairs back through the
engine's exact posterior (bayesenv/diag.py) and writes, after every step: the probability of
each cause, the budget left, and the one-step expected information gain the test had at the
moment it was chosen (bits).

For every case it also adds the greedy policy and the optimal (exact DP) policy ON THE SAME
HIDDEN CASE. The salt of a Harbor trial is random and not stored, so the case cannot be
re-drawn from a seed. Instead the record gives the reference policies' test order and reward
on that draw (dp_tests / dp_reward, greedy_tests / greedy_reward); both policies are
deterministic given the readings, so the readings are recovered by enumerating outcome
sequences and keeping those under which the policy picks exactly the recorded tests and
earns exactly the recorded reward. If that match is not unique-or-existent, the script falls
back to a fresh seeded case and says so in the trace.

Every trace carries  source: "recorded" (a real Harbor run)  or  "simulated" (a policy played
by this script), plus same_case and a plain-language note.

Single process, a few seconds (one exact DP). No network, no LLM.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bayesenv import diag as D  # noqa: E402

LN2 = math.log(2.0)

# Where each test stands in the room: purely presentational grouping for the viewer.
GROUPS = {
    "hplc_reference_standard": "analytical", "hplc_crude": "analytical",
    "hplc_mother_liquor": "analytical", "hplc_in_process": "analytical",
    "hplc_aqueous_layer": "analytical",
    "catalyst_metals_assay": "specialist", "solvent_water_external_lab": "specialist",
    "thermocouple_audit": "specialist",
    "colour_check": "floor", "stirrer_torque_log": "floor", "repeat_yield_assay": "floor",
    "equipment_inspection": "floor",
    "batch_record_review": "records", "lot_certificate_review": "records",
    "operator_interview": "records",
}


def replay(tb: D.Table, pairs, hidden_cause: str, submitted=None) -> dict:
    """pairs: [(test name, reading name)] in order -> per-step exact beliefs."""
    c = tb.causes.index(hidden_cause)
    w = tb.joint / tb.joint.sum()
    left = float(tb.budget)
    steps = []
    for i, (name, reading) in enumerate(pairs):
        t = tb.index(name)
        o = tb.outcomes[t].index(reading)
        gain = D.info_gain(tb, w, t) / LN2
        w = w * tb.lik[t][:, :, o]
        w = w / w.sum()
        left -= float(tb.costs[t])
        steps.append({"step": i + 1, "test": name, "cost": float(tb.costs[t]),
                      "reading": reading, "role": tb.roles[t],
                      "gain_bits": round(float(gain), 5),
                      "budget_left": round(left, 9),
                      "probs": [float(v) for v in w.sum(1)]})
    exact = w.sum(1)
    q = exact if submitted is None else D.parse_belief(tb, submitted)
    res = D.score(tb, q, c, exact)
    return {"steps": steps, "prior": [float(v) for v in tb.prior],
            "final_exact": [float(v) for v in exact],
            "submitted": None if submitted is None else [float(v) for v in q],
            "p_true": float(q[c]), "p_true_exact": float(exact[c]),
            "reward": float(res["reward"]),
            "score": D.unit_score(res["reward"], D.max_reward(tb, c)),
            "budget": float(tb.budget), "budget_spent": round(float(tb.budget) - left, 9),
            "n_tests": len(steps)}


def recover_readings(tb: D.Table, policy, tests, reward, hidden_cause, hidden_nuisance, known):
    """All outcome sequences under which `policy` picks exactly `tests`, then stops, and the
    exact posterior earns `reward`. `known`: test name -> reading already on record."""
    c = tb.causes.index(hidden_cause)
    n = tb.nuisances.index(hidden_nuisance)
    want = [tb.index(x) for x in tests]
    found = []

    def rec(i, obs, w, remaining, logp):
        pick = policy(tb, w, obs, remaining)
        if i == len(want):
            if pick is None:
                r = D.score(tb, w.sum(1), c, w.sum(1))["reward"]
                if abs(r - reward) < 1e-7:
                    found.append((logp, obs))
            return
        if pick != want[i]:
            return
        t = want[i]
        name = tb.tests[t]
        outs = [tb.outcomes[t].index(known[name])] if name in known \
            else range(len(tb.outcomes[t]))
        for o in outs:
            p = float(tb.lik[t][c, n, o])
            if p <= 0:
                continue
            w2 = w * tb.lik[t][:, :, o]
            rec(i + 1, obs + ((t, o),), w2 / w2.sum(), remaining - float(tb.costs[t]),
                logp + math.log(p))

    rec(0, (), tb.joint / tb.joint.sum(), float(tb.budget), 0.0)
    found.sort(key=lambda x: -x[0])
    return [[(tb.tests[t], tb.outcomes[t][o]) for t, o in obs] for _, obs in found]


def reference_trace(tb, policy, label, rec, known, key, fallback_seed):
    tests, reward = rec[f"{key}_tests"], rec[f"{key}_reward"]
    sols = recover_readings(tb, policy, tests, reward, rec["hidden_cause"],
                            rec["hidden_nuisance"], known)
    if sols:
        tr = replay(tb, sols[0], rec["hidden_cause"])
        tr.update(source="simulated", same_case=True,
                  hidden_cause=rec["hidden_cause"], hidden_nuisance=rec["hidden_nuisance"],
                  note=(f"{label} policy played by the engine on the same hidden case. Test "
                        "order and reward are the grader's; readings recovered from them"
                        + ("." if len(sols) == 1 else
                           f" ({len(sols)} reading sequences fit; the most likely is shown).")))
        for name, reading in sols[0]:
            known.setdefault(name, reading)
        return tr
    lab = D.run_policy(tb, policy, fallback_seed, "planning-lab-demo")
    tr = replay(tb, [(h["test"], h["outcome"]) for h in lab.history], lab.hidden)
    tr.update(source="simulated", same_case=False, hidden_cause=lab.hidden,
              hidden_nuisance=lab.hidden_nuisance,
              note=(f"{label} policy on a fresh simulated case (seed {fallback_seed}); the "
                    "recorded case could not be reproduced."))
    return tr


def find_records(d: Path):
    return sorted(Path(d).glob("*/verifier/details.json")) if Path(d).is_dir() else [Path(d)]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--agent-runs", action="append", default=[],
                    help="details.json, or a directory of <trial>/verifier/details.json")
    ap.add_argument("--agent-name", default="Opus")
    ap.add_argument("--oracle-runs", action="append", default=[],
                    help="same, for recorded runs of the optimal policy")
    ap.add_argument("--table", default="low_yield")
    ap.add_argument("--out", default=str(ROOT / "demo" / "planning-lab" / "traces.js"))
    a = ap.parse_args()

    tb = D.load_table(a.table)
    dp = D.exact_dp(tb)
    cases = []
    jobs = [(p, "agent") for d in a.agent_runs for p in find_records(d)] + \
           [(p, "oracle") for d in a.oracle_runs for p in find_records(d)]
    counts = {"agent": 0, "oracle": 0}
    for k, (path, kind) in enumerate(jobs):
        rec = json.loads(Path(path).read_text(encoding="utf-8"))
        counts[kind] += 1
        trial = Path(path).parent.parent.name
        pairs = [(s["test"], s["reading"]) for s in rec["tests_run"]]
        main_tr = replay(tb, pairs, rec["hidden_cause"], rec.get("submitted_posterior"))
        assert np.allclose(main_tr["final_exact"],
                           [rec["exact_posterior"][c] for c in tb.causes], atol=1e-9), path
        assert abs(main_tr["reward"] - rec["reward"]) < 1e-7, path
        main_tr.update(source="recorded", same_case=True, hidden_cause=rec["hidden_cause"],
                       hidden_nuisance=rec["hidden_nuisance"], score=float(rec["score"]),
                       note=f"Real Harbor run, trial {trial}. Tests, readings and final answer "
                            "are the grader's record; the probabilities after each step are "
                            "recomputed exactly from those readings.")
        known = dict(pairs)
        tracks = {}
        if kind == "agent":
            tracks["agent"] = main_tr
            tracks["optimal"] = reference_trace(tb, dp.policy, "Optimal", rec, known, "dp", 1000 + k)
        else:
            tracks["optimal"] = main_tr
        tracks["greedy"] = reference_trace(tb, D.greedy_policy, "Greedy", rec, known,
                                           "greedy", 2000 + k)
        label = (f"{a.agent_name} run {counts['agent']}" if kind == "agent"
                 else f"Optimal policy run {counts['oracle']}")
        cases.append({"id": trial, "label": label, "kind": kind, "tracks": tracks})
        print(f"{label:24s} {trial:18s} hidden={rec['hidden_cause']:27s} " + "  ".join(
            f"{n}: {t['n_tests']} tests, {t['source']}{'' if t['same_case'] else ' (fresh case)'}"
            for n, t in tracks.items()))

    data = {
        "table": tb.name, "budget": float(tb.budget), "agent_name": a.agent_name,
        "causes": [{"name": c, "prior": float(p)} for c, p in zip(tb.causes, tb.prior)],
        "tests": [{"name": n, "cost": float(c), "role": r, "outcomes": o,
                   "group": GROUPS.get(n, "floor")}
                  for n, c, r, o in zip(tb.tests, tb.costs, tb.roles, tb.outcomes)],
        "cases": cases,
    }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("// Generated by scripts/export_diag_trace.py. Do not edit by hand.\n"
                   "window.LAB_TRACES = " + json.dumps(data, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} kB, {len(cases)} cases)")


if __name__ == "__main__":
    main()
