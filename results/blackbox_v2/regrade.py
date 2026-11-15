"""Re-score every stored black-box credit desk v2 trial from its grading record.

    python results/blackbox_v2/regrade.py            # instant: recompute each reward from the logged per-step values
    python results/blackbox_v2/regrade.py --full     # re-solve the true-model DP from the task code and check every
                                                     # logged V, Q and advantage (about 1 s per applicant)
    python results/blackbox_v2/regrade.py --full --only opus

Each trial folder under traces/ holds verifier/details.json, written by the task's grader (bblab.Lab.grade).
It records the desk's true generator, every applicant's prior seed, every sandbox purchase, and every live action
with the band it returned. That is all the grader needs: the reward depends on the agent's actions and the true
model, not on the random draws. Requires numpy and scipy.
"""
import argparse
import csv
import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]
TASKS = REPO / "tasks" / "credit-blackbox-v2"


def fast(d):
    """reward from the logged quantities, exactly as bblab.Lab.grade combines them"""
    v_hat = sum(a["V_true_dp"] - sum(s["advantage"] for s in a["steps"]) for a in d["applicants"]) - d["sandbox_spend"]
    nd, vref = d["V_nodata"], d["V_ref"]
    return min(max((v_hat - nd) / (vref - nd), 0.0), 1.0), v_hat


_mods = {}


def task_code(desk):
    """import the desk's own grader modules (credit_core, bbpub, bbsecret) from the rendered task"""
    if desk not in _mods:
        src = TASKS / f"credit-blackbox-{desk}" / "environment" / "mcp-server"
        for m in ("credit_core", "bbpub", "bbsecret"):
            sys.modules.pop(m, None)
        sys.path.insert(0, str(src))
        import credit_core, bbpub, bbsecret  # noqa: E401
        sys.path.pop(0)
        _mods[desk] = (credit_core, bbpub, bbsecret)
    return _mods[desk]


def full(d, desk, tol=0.01):
    """re-solve the true-model DP for every applicant and replay the agent's actions through it"""
    import numpy as np
    cc, P, Z = task_code(desk)
    model = Z.desk_model(desk)
    assert model == d["true_model"], "logged generator differs from the desk's generator"
    tables = Z.true_tables(model)
    worst, v_sum = 0.0, 0.0
    for a in d["applicants"]:
        S = cc.Solver(P.TableInst(cc.Inst(a["seed"]).prior, tables), "m", 16.0)
        S.solve()
        cnt, adv_sum = np.zeros((cc.E, cc.B), int), 0.0
        for s in a["steps"]:
            r = S.analyse(cnt)
            act = s["action"]
            if act.startswith("check "):
                e = P.CHECKS.index(act.split()[1])
                qa = float(r["q_cont"][e])
            else:
                qa = r["v_approve"] if act == "approve" else 0.0
            adv = r["V"] - qa
            worst = max(worst, abs(adv - s["advantage"]), abs(r["V"] - s["V"]))
            adv_sum += adv
            if act.startswith("check "):
                cnt[e, s["band_index"]] += 1
        v_sum += S.V0() - adv_sum
    v_hat = v_sum - d["sandbox_spend"]
    reward = min(max((v_hat - d["V_nodata"]) / (d["V_ref"] - d["V_nodata"]), 0.0), 1.0)
    return reward, v_hat, worst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="re-solve the DP from the task code")
    ap.add_argument("--only", default="", help="substring filter on the agent folder name")
    args = ap.parse_args()
    index = {r["path"]: r for r in csv.DictReader(open(HERE / "trials.csv", encoding="utf-8"))}
    n = bad = 0
    print(f"{'agent':24s} {'desk':5s} {'stored':>7s} {'regraded':>9s}" + ("  max |dV|" if args.full else ""))
    for path, row in index.items():
        if args.only not in row["agent"]:
            continue
        d = json.load(open(HERE / path / "verifier" / "details.json", encoding="utf-8"))
        stored = float(d["reward"])
        if args.full:
            r, _, worst = full(d, int(row["desk"]))
        else:
            (r, _), worst = fast(d), None
        ok = math.isclose(r, stored, abs_tol=1e-4) and (worst is None or worst < 0.01)
        n += 1
        bad += not ok
        print(f"{row['agent']:24s} {row['desk']:5s} {stored:7.3f} {r:9.3f}" + (f"  {worst:9.2e}" if args.full else "")
              + ("" if ok else "   MISMATCH"))
    print(f"\n{n} trials regraded, {bad} mismatches")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
