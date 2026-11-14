"""Play every reference/baseline procedure in-process against the task engine (bblab.Lab, same grader as the
server) over several salts. usage: python sim_lab.py <n salts> [policies]"""
import sys, json, asyncio
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, "template/environment/mcp-server"); sys.path.append("template/solution")
import bblab as L
import refpolicy
META = {int(k): v for k, v in json.load(open("build_meta.json")).items()}
POLS = sys.argv[2].split(",") if len(sys.argv) > 2 else ["ref", "mle", "naive", "medfix", "onestep", "guess", "over", "decline"]


def one(args):
    desk, salt, pol = args
    m = META[desk]
    lab = L.Lab(desk, m["seeds"], f"val{salt}", m["V_ref"])
    async def call(tool, a):
        return getattr(lab, tool)(**a) if tool != "get_rules" else rules(lab)
    asyncio.run(refpolicy.play(call, pol))
    g = lab.grade()
    return desk, salt, pol, g["score"], g["V_hat"], g["V_ref"], g["V_true_dp"], g["V_nodata"], g["sandbox_spend"], g["mean_checks"]


def rules(lab):
    import credit_core as cc, bbpub as P
    return {"segments": P.SEGMENTS, "applicant_priors": [L.applicant_prior(s) for s in lab.seeds],
            "payoff": {"loss_given_default": L.PR * cc.M, "margin_if_repaid": cc.M},
            "sandbox": {"max_draws_per_episode": L.SIM_MAX_TOTAL}}


if __name__ == "__main__":
    ns = int(sys.argv[1])
    with Pool(16) as p:
        res = p.map(one, [(d, s, pol) for d in META for s in range(ns) for pol in POLS])
    json.dump(res, open("sim_lab.json", "w"))
    print("policy   score mean [min,max]  | V_hat - V_nodata (mean) | sandbox $ | checks/applicant")
    for pol in POLS:
        r = [x for x in res if x[2] == pol]
        sc = np.array([x[3] for x in r])
        print(f"{pol:8s} {sc.mean():.3f} [{sc.min():.2f},{sc.max():.2f}] | {np.mean([x[4] - x[7] for x in r]):8.1f} | {np.mean([x[8] for x in r]):6.0f} | {np.mean([x[9] for x in r]):.2f}")
    print("V_ref - V_nodata per desk:", {d: round(META[d]["V_ref"] - META[d]["V_nodata"], 1) for d in META},
          " true DP:", {d: round(META[d]["V_true_dp"] - META[d]["V_nodata"], 1) for d in META},
          " informed MLE:", {d: round(META[d]["V_mle"] - META[d]["V_nodata"], 1) for d in META})
