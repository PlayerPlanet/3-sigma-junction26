"""v2 black-box credit environment for GRPO: decision prompts under a FITTED model, graded by the TRUE-model DP.

Decomposition of one episode (same as the grader's accounting):
  1. calibration step: choose sandbox draws per (segment, check) cell from N0_MENU (cost n0 * 18 dollars).
     The sandbox data are then fitted with the reference's bootstrap empirical fit (bbpub.fit_empirical_boot).
  2. decision steps, per applicant: state = posterior over segments under the fitted tables, fitted band
     tables, bands seen, checks left. Actions: check_bureau / check_income / check_bank / approve / decline.
     Reward: exp(-(V_true - Q_true(a)) / 20) at the count state (true-model advantage lost, in check-cost units).
Grading of a full episode is identical to bblab.Lab.grade: V_hat = sum_i (V*_i - sum adv) - sandbox spend,
reward = clip((V_hat - V_nodata) / (V_ref - V_nodata), 0, 1).
"""
import json, math, re
import numpy as np
import credit_core as cc
import bbsecret as Z
import bbpub as P

PR = 16.0
N_APP = 20
MIN_GAIN = 20.0
N0_MENU = [4, 8, 12, 20, 30]
EVAL_DESKS = [3004, 3005, 3008, 3016, 3017, 3019]
ACTIONS = ["check_bureau", "check_income", "check_bank", "approve", "decline"]
BANDS = ["<560", "560-629", "630-689", "690-749", "750-819", ">=820"]
A_VAL = cc.approve_values(PR)

SYSTEM = ("You are a credit underwriter. Maximise expected profit: the payoff of each final decision minus the money "
          "spent on checks and on sandbox calibration. Reply with the answer only.")


def money(x):
    return ("-" if x < 0 else "") + f"${abs(x):,.0f}"


def pick_seeds(desk, T):
    seeds, j = [], 0
    while len(seeds) < N_APP:
        s = 50_000 + 100 * desk + j
        S = cc.Solver(P.TableInst(cc.Inst(s).prior, T), "m", PR)
        if S.solve() - S.nodata() >= MIN_GAIN:
            seeds.append(s)
        j += 1
    return seeds


def samples_of(model, n0, rng):
    return {c: [(k, float(Z.draw_scores(model, c, k, rng.random()))) for k in range(cc.K) for _ in range(n0)]
            for c in P.CHECKS}


def fitted(model, n0, rng, boot_seed):
    return P.fit_empirical_boot(samples_of(model, n0, rng), seed=boot_seed)


def posterior(prior, tab, counts):
    logL = np.log(np.clip(tab, 1e-12, 1)).transpose(0, 2, 1).reshape(cc.E * cc.B, cc.K)
    lp = np.log(prior) + np.asarray(counts, float).reshape(-1) @ logL
    lp -= lp.max()
    q = np.exp(lp)
    return q / q.sum()


# ------------------------------------------------------------------ prompts
def calib_prompt(priors):
    pri = " ".join(f"{np.dot(p, A_VAL):.0f}" for p in priors)
    lines = [
        "You will underwrite 20 loan applicants. Six risk segments S1..S6 with default probabilities "
        "2%, 5%, 12%, 30%, 60%, 90%. Approve pays $1,000 if repaid and loses $16,000 on default; decline pays $0.",
        "Each applicant can get up to 8 live checks (bureau, income, bank; $20 each) that return a score band. "
        "Score = location(segment, check) + noise; locations, noise family (some checks are heavy-tailed) and "
        "scale are hidden.",
        "Before starting you must calibrate a model of the checks in a sandbox: for each of the 18 "
        "(segment, check) cells you draw the same number of raw scores at $1 per draw. The fitted band tables "
        "are then used for every applicant. Too few draws: wrong tables and bad decisions. Too many: wasted money.",
        f"Expected payoff of approving each applicant on its prior alone: {pri} (dollars).",
        "Options (draws per cell -> total sandbox cost): " +
        ", ".join(f"calib_{n} -> {money(18 * n)}" for n in N0_MENU) + ".",
        "Answer with exactly one of: " + ", ".join(f"calib_{n}" for n in N0_MENU) + "."]
    return "\n".join(lines), [f"calib_{n}" for n in N0_MENU]


def decision_prompt(prior, tab, counts, n0):
    counts = np.asarray(counts).reshape(cc.E, cc.B)
    n = int(counts.sum())
    q = posterior(prior, tab, counts)
    seen = [f"{P.CHECKS[e]} {BANDS[b]}" + (f" x{counts[e, b]}" if counts[e, b] > 1 else "")
            for e in range(cc.E) for b in range(cc.B) if counts[e, b]]
    lines = [
        "Applicant risk segments (PD = probability of default). Posterior under your FITTED model:",
        "  " + " | ".join(f"S{t + 1} PD {100 * cc.PD[t]:g}%: {q[t]:.3f}" for t in range(cc.K)),
        "Approve pays $1,000 if repaid, loses $16,000 on default; payoff by segment: " +
        ", ".join(f"S{t + 1} {money(A_VAL[t])}" for t in range(cc.K)) + ".",
        f"Expected payoff of approving now (fitted model): {money(float(q @ A_VAL))}. Decline pays $0.",
        f"Bands seen so far: {', '.join(seen) if seen else 'none'}.",
        f"Each check costs $20. Checks used: {n} of 8 ({8 - n} remaining).",
        f"Fitted P(band | segment), estimated from only {n0} sandbox draws per cell (so it is uncertain), "
        "bands " + ", ".join(BANDS) + ":"]
    for e in range(cc.E):
        lines.append(f"  check_{P.CHECKS[e]}:")
        for t in range(cc.K):
            lines.append(f"    S{t + 1}: " + " ".join(f"{p:.2f}" for p in tab[e, t]))
    allowed = ACTIONS if n < cc.T else ACTIONS[3:]
    lines.append("Answer with exactly one of: " + ", ".join(allowed) + ".")
    return "\n".join(lines), allowed


def compact(text):
    """band tables as integer percentages (cuts the prompt by ~300 tokens); idempotent"""
    text = text.replace("Fitted P(band | segment), estimated", "Fitted P(band | segment) in percent, estimated")
    return re.sub(r"(?m)^(    S\d: )([0-9. ]+)$",
                  lambda mm: mm.group(1) + " ".join(str(int(round(float(x) * 100))) if "." in x else x
                                                    for x in mm.group(2).split()), text)


def messages(text):
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": compact(text)}]


def parse(text, allowed):
    t = text.strip().lower()
    t = re.sub(r"[`*\"'<>/]|action\s*[:=]?|answer\s*[:=]?", " ", t).strip()
    for a in sorted(allowed, key=len, reverse=True):
        if t == a or t.startswith(a + " ") or t.startswith(a + ".") or t == a.rstrip():
            return a
    found = {a for a in allowed if re.search(r"(?<![a-z_0-9])" + re.escape(a) + r"(?![a-z_0-9])", t)}
    return found.pop() if len(found) == 1 else None


def step_reward(Q, V, ai):
    if ai is None:
        return -0.5
    adv = V - Q[ai]          # two scales: $4 separates a wasted check from the optimal stop, $40 grades big losses
    return 0.5 * math.exp(-adv / 4.0) + 0.5 * math.exp(-adv / 40.0)


def qvals(S, counts):
    a = S.analyse(counts)
    return list(map(float, a["q_cont"])) + [float(a["v_approve"]), 0.0], float(a["V"])


# ------------------------------------------------------------------ desks
class Desk:
    def __init__(self, desk, seeds=None):
        self.desk = desk
        self.model = Z.desk_model(desk)
        self.T = Z.true_tables(self.model)
        self.seeds = seeds or pick_seeds(desk, self.T)
        self.priors = [cc.Inst(s).prior for s in self.seeds]
        self._S = {}

    def true_solver(self, i):
        if i not in self._S:
            S = cc.Solver(P.TableInst(self.priors[i], self.T), "m", PR)
            S.solve()
            self._S[i] = S
        return self._S[i]

    def drop(self):
        self._S = {}


def gen_states(desk, n_datasets=3, rollouts=2, seed=0):
    """Training rows for one training desk: per sandbox dataset (n0 drawn from the menu) and applicant,
    roll out a mixture of (true DP / fitted one-step lookahead / fitted greedy-stop / random) behaviour and keep
    every visited state with the true-model Q-values."""
    D = Desk(desk)
    rng = np.random.default_rng([seed, desk])
    rows = []
    for ds in range(n_datasets):
        n0 = int(rng.choice(N0_MENU))
        tab = fitted(D.model, n0, rng, boot_seed=int(rng.integers(1 << 30)))
        for i in range(N_APP):
            S = D.true_solver(i)
            Sf = cc.Solver(P.TableInst(D.priors[i], tab), "m", PR)   # fitted model (one-step only, no full DP)
            for ro in range(rollouts):
                h = int(rng.choice(cc.K, p=D.priors[i]))
                counts = np.zeros((cc.E, cc.B), int)
                mode = rng.choice(["dp", "one", "rand"], p=[0.45, 0.35, 0.2])
                while True:
                    n = int(counts.sum())
                    Q, V = qvals(S, counts)
                    text, allowed = decision_prompt(D.priors[i], tab, counts, n0)
                    rows.append(dict(kind="dec", desk=desk, n0=n0, app=i, n=n, Q=Q, V=V,
                                     prompt=messages(text), allowed=allowed))
                    if n >= cc.T:
                        break
                    if mode == "dp":
                        a = 3 if Q[3] >= V - cc.TOL else (4 if 0 >= V - cc.TOL else int(np.argmax(Q[:3])))
                    elif mode == "one":
                        q = posterior(D.priors[i], tab, counts)
                        best, arg = Sf._look(q[None], 1)
                        va = float(q @ A_VAL)
                        a = int(arg[0]) if best[0] > max(va, 0) + cc.TOL else (3 if va >= 0 else 4)
                    else:
                        a = int(rng.integers(5)) if n > 0 else int(rng.integers(3))
                    if a >= 3:
                        break
                    used = int(counts[a].sum())
                    x = Z.draw_scores(D.model, P.CHECKS[a], h, rng.random())
                    counts[a, cc.bin_of(float(x))] += 1
        D.drop()
    return rows, D.seeds


def episode_value(D, n0, rep):
    """reference-procedure value (bootstrap fit + fitted DP) with n0 draws per cell, exact over live worlds"""
    r = np.random.default_rng([D.desk, rep, n0, 4242])
    tab = fitted(D.model, n0, r, boot_seed=rep)
    tot = 0.0
    for i in range(N_APP):
        Sf = cc.Solver(P.TableInst(D.priors[i], tab), "m", PR)
        Sf.solve()
        tot += D.true_solver(i).evaluate(Sf.dp_policy())[0]
    return tot - 18 * n0
