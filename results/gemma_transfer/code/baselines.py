"""CPU baselines on exactly the same episodes / bank states as run_gpu.py. usage: python baselines.py OUTDIR conds"""
import json, sys, time
from pathlib import Path
import numpy as np
import tasks as X
import suite as S

POL = {"diag": ["dp", "greedy", "greedy_per_cost", "random"],
       "credit": ["dp", "one_step", "check_once", "no_check", "random"],
       "bship": ["reference", "fires_only", "hunter", "random", "stop_early", "do_nothing"]}


def main():
    out, conds = Path(sys.argv[1]), sys.argv[2].split(",")
    out.mkdir(exist_ok=True)
    for cond in conds:
        t = time.time()
        res = {}
        if cond.startswith("bank"):
            fam = "diag" if cond == "bank_diag" else "credit"
            for pol in POL[fam] + ["always_commit", "always_gather"]:
                bank = S.diag_bank() if fam == "diag" else S.credit_bank()
                rng = np.random.default_rng(0)

                def choose(L):
                    acts = []
                    for b in L:
                        ep = b.ep
                        if pol == "always_commit":
                            acts.append("stop" if fam == "diag" else X.credit_policy_action(ep, "no_check"))
                        elif pol == "always_gather":   # random gather action
                            al = [a for a in ep.allowed() if a not in ("stop", "approve", "decline")]
                            acts.append(al[int(rng.integers(len(al)))] if al else ep.fallback())
                        elif fam == "diag":
                            acts.append(X.diag_policy_action(ep, pol, rng))
                        else:
                            acts.append(X.credit_policy_action(ep, pol, rng))
                    return acts
                res[pol] = dict(records=S.bank_eval(bank, choose))
        else:
            fam = "diag" if cond.startswith("diag") else cond
            for pol in POL[fam]:
                eps = S.episodes(cond)
                rng = np.random.default_rng(0)
                fn = {"diag": X.diag_policy_action, "credit": X.credit_policy_action, "bship": X.bs_policy_action}[fam]
                X.run_policy_episodes(eps, lambda e: fn(e, pol, rng))
                res[pol] = dict(episodes=S.summarise(cond, eps))
        json.dump(res, open(out / f"{cond}.json", "w"), default=float)
        print(cond, "done", round(time.time() - t), "s", flush=True)


if __name__ == "__main__":
    main()
