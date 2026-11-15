"""Black-box credit lab engine (no MCP).

Hidden generator (bbsecret.desk_model): per (segment, check) score location, per check a noise family
(gauss / t3 / cauchy) and scale; the same for every applicant in the episode and for the sandbox.
Streams (all salted; the salt lives only in this container):
  sandbox draws : rng("sandbox", desk), fixed per desk (not salted) -- independent of
  live readings : rng(desk, applicant seed, salt, i)     (true segment + uniforms per check run)

Grading (exact, under the TRUE generator):
  V_hat_i = V_dp_i(start) - sum of DP advantages along the agent's trajectory on applicant i
  V_hat   = sum_i V_hat_i - sandbox spend
  V_ref   = expected value of the reference procedure (precomputed at render time, sandbox spend included)
  score   = clip((V_hat - V_nodata) / (V_ref - V_nodata), 0, 1),  V_nodata = sum_i max(prior_i . A, 0)
"""
from __future__ import annotations

import threading

import numpy as np

import credit_core as cc
import bbpub as P
import bbsecret as Z

PR = 16.0
SIM_PRICE = 1.0
SIM_MAX_PER_CALL = 50
SIM_MAX_TOTAL = 1000


def bands() -> list[str]:
    ed = [int(x) for x in cc.EDGES]
    return [f"score < {ed[0]}"] + [f"{a} <= score < {b}" for a, b in zip(ed[:-1], ed[1:])] + [f"score >= {ed[-1]}"]


def applicant_prior(seed: int) -> dict:
    p = cc.Inst(seed).prior
    return {P.SEGMENTS[t]: round(float(p[t]), 6) for t in range(cc.K)}


class Lab:
    def __init__(self, desk: int, seeds: list[int], salt: str, v_ref: float | None = None):
        self.desk, self.seeds, self.salt, self.v_ref = desk, list(seeds), salt, v_ref
        self.model = Z.desk_model(desk)
        self.tables = Z.true_tables(self.model)
        self.priors = [np.array(list(applicant_prior(s).values())) for s in self.seeds]
        self.sim_rng = Z.rng_of("sandbox", desk)          # fixed per desk: the reference run is reproducible
        self.worlds = []
        for i, s in enumerate(self.seeds):
            r = Z.rng_of("live", desk, s, salt, i)
            self.worlds.append((int(r.choice(cc.K, p=self.priors[i] / self.priors[i].sum())), r.random((cc.E, cc.T))))
        self.cur = 0
        self.counts = [np.zeros((cc.E, cc.B), int) for _ in self.seeds]
        self.used = [np.zeros(cc.E, int) for _ in self.seeds]
        self.steps = [[] for _ in self.seeds]
        self.decision = [None] * len(self.seeds)
        self.sim_draws = 0
        self.sim_log = []
        self._true = [None] * len(self.seeds)
        self._lock = threading.RLock()

    # ---------------- agent actions
    def simulate(self, segment: str, check: str, n: int = 1) -> dict:
        if segment not in P.SEGMENTS:
            raise ValueError(f"unknown segment {segment!r}; use one of {P.SEGMENTS}")
        if check not in P.CHECKS:
            raise ValueError(f"unknown check {check!r}; use one of {P.CHECKS}")
        n = int(n)
        if not 1 <= n <= SIM_MAX_PER_CALL:
            raise ValueError(f"n must be between 1 and {SIM_MAX_PER_CALL}")
        if self.sim_draws + n > SIM_MAX_TOTAL:
            raise ValueError(f"sandbox limit reached ({SIM_MAX_TOTAL} draws per episode; {self.sim_draws} used)")
        k = P.SEGMENTS.index(segment)
        x = Z.draw_scores(self.model, check, np.full(n, k), self.sim_rng.random(n))
        self.sim_draws += n
        self.sim_log.append((segment, check, n, self.cur))
        return {"segment": segment, "check": check, "scores": [round(float(v), 1) for v in x],
                "cost": SIM_PRICE * n, "sandbox_spend_total": SIM_PRICE * self.sim_draws,
                "sandbox_draws_remaining": SIM_MAX_TOTAL - self.sim_draws}

    def run_check(self, check: str) -> dict:
        if self.cur >= len(self.seeds):
            raise ValueError("all applicants are decided; nothing left to check")
        if check not in P.CHECKS:
            raise ValueError(f"unknown check {check!r}; use one of {P.CHECKS}")
        i, e = self.cur, P.CHECKS.index(check)
        n = int(self.counts[i].sum())
        if n >= cc.T:
            raise ValueError(f"check budget exhausted ({cc.T} checks) for this applicant; approve or decline")
        h, U = self.worlds[i]
        x = Z.draw_scores(self.model, check, h, U[e, self.used[i][e]])
        b = cc.bin_of(float(x))
        self.steps[i].append((self.counts[i].copy(), ("check", e), b))
        self.counts[i][e, b] += 1
        self.used[i][e] += 1
        return {"applicant": i + 1, "check": check, "band": bands()[b], "band_index": b,
                "checks_used": n + 1, "checks_remaining": cc.T - n - 1}

    def decide(self, decision: str) -> dict:
        if self.cur >= len(self.seeds):
            raise ValueError("all applicants are already decided")
        if decision not in ("approve", "decline"):
            raise ValueError("decision must be 'approve' or 'decline'")
        i = self.cur
        self.steps[i].append((self.counts[i].copy(), (decision, None), None))
        self.decision[i] = decision
        self.cur += 1
        out = {"applicant": i + 1, "decision": decision, "applicants_remaining": len(self.seeds) - self.cur}
        if self.cur < len(self.seeds):
            out["next_applicant"] = self.cur + 1
            out["next_prior"] = applicant_prior(self.seeds[self.cur])
        else:
            out["message"] = "all applicants decided; you are done"
        return out

    def status(self) -> dict:
        base = {"sandbox_draws_used": self.sim_draws, "sandbox_spend": SIM_PRICE * self.sim_draws,
                "live_checks_spend": cc.COST * int(sum(c.sum() for c in self.counts))}
        i = self.cur
        if i >= len(self.seeds):
            return {"done": True, "decisions": self.decision, **base}
        hist = [{"check": P.CHECKS[a[1]], "band": bands()[b], "band_index": b}
                for (_, a, b) in self.steps[i] if a[0] == "check"]
        return {"done": False, "applicant": i + 1, "of": len(self.seeds), "prior": applicant_prior(self.seeds[i]),
                "history": hist, "checks_remaining": cc.T - int(self.counts[i].sum()), **base}

    # ---------------- grading
    def true_solver(self, i):
        with self._lock:
            if self._true[i] is None:
                S = cc.Solver(P.TableInst(self.priors[i], self.tables), "m", PR)
                S.solve()
                self._true[i] = S
            return self._true[i]

    def precompute(self):
        for i in range(len(self.seeds)):
            self.true_solver(i)

    def grade(self) -> dict:
        per = []
        for i, seed in enumerate(self.seeds):
            S = self.true_solver(i)
            h, _ = self.worlds[i]
            V0, nd = S.V0(), S.nodata()
            steps = list(self.steps[i])
            undecided = self.decision[i] is None
            if undecided:
                steps.append((self.counts[i].copy(), ("decline", None), None))
            adv_sum, rec = 0.0, []
            for cnt, (kind, e), b in steps:
                a = S.analyse(cnt)
                Qa = float(a["q_cont"][e]) if kind == "check" else (a["v_approve"] if kind == "approve" else 0.0)
                adv = a["V"] - Qa
                adv_sum += adv
                rec.append({"n": int(cnt.sum()), "action": kind if kind != "check" else f"check {P.CHECKS[e]}",
                            "band_index": b, "posterior_true_model": [round(float(x), 5) for x in a["q"]],
                            "v_approve": round(a["v_approve"], 3), "q_checks": [round(float(x), 3) for x in a["q_cont"]],
                            "V": round(a["V"], 3), "Q_action": round(Qa, 3), "advantage": round(adv, 3)})
            n = int(self.counts[i].sum())
            final = steps[-1][1][0]
            per.append({"applicant": i + 1, "seed": seed, "true_segment": P.SEGMENTS[h], "decision": final,
                        "undecided": undecided, "n_checks": n, "V_true_dp": V0, "V_nodata": nd,
                        "V_hat": V0 - adv_sum, "loss_vs_true_dp": adv_sum,
                        "realised_expected_payoff": (float(S.A[h]) if final == "approve" else 0.0) - cc.COST * n,
                        "steps": rec})
        spend = SIM_PRICE * self.sim_draws
        v_hat = sum(p["V_hat"] for p in per) - spend
        nd = sum(p["V_nodata"] for p in per)
        v_dp = sum(p["V_true_dp"] for p in per)
        vref = self.v_ref if self.v_ref is not None else v_dp
        score = float(np.clip((v_hat - nd) / (vref - nd), 0, 1)) if vref - nd > 1e-9 else 0.0
        return {"score": score, "reward": score,
                "V_hat": v_hat, "V_ref": vref, "V_nodata": nd, "V_true_dp": v_dp,
                "score_vs_true_dp_unclipped": (v_hat - nd) / (v_dp - nd) if v_dp - nd > 1e-9 else None,
                "sandbox_draws": self.sim_draws, "sandbox_spend": spend,
                "sandbox_log": self.sim_log, "n_applicants": len(per),
                "n_decided": int(sum(not p["undecided"] for p in per)),
                "mean_checks": float(np.mean([p["n_checks"] for p in per])),
                "true_model": self.model, "applicants": per}
