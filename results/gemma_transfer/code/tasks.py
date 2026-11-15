"""Transfer-test environments (CPU only): stated-posterior prompts, parsing and exact per-step grading for
  diag    diagnostic planning lab (bayesenv/diag.py from origin/diag): exact DP Q-values at every visited state
  credit  stated-model credit desk (credit_core, true band tables shown, graded by the true DP)
  bship   Rulebound Battleship full games (bayesenv/battleship.py), stated posterior, exact EIG per step
Every episode object exposes  prompt() -> messages | None (done),  act(action_or_None_if_invalid),  fallback(),
parse(text) -> canonical action or None,  and records per-step grading in .steps.
"""
import math, re
import numpy as np

# ---------------------------------------------------------------- shared parsing (same rule as benv.parse)
def parse_choice(text, allowed):
    t = text.strip().lower()
    t = re.sub(r"[`*\"'<>/]|action\s*[:=]?|answer\s*[:=]?|test\s*[:=]", " ", t).strip()
    for a in sorted(allowed, key=len, reverse=True):
        if t == a or t.startswith(a + " ") or t.startswith(a + ".") or t.startswith(a + ","):
            return a
    found = {a for a in allowed if re.search(r"(?<![a-z_0-9])" + re.escape(a) + r"(?![a-z_0-9])", t)}
    return found.pop() if len(found) == 1 else None


RETRY = "\n(Your previous answer was invalid. Answer with exactly one allowed action name.)"

# ================================================================ diagnostic lab
from bayesenv import diag as D


class DiagDP:
    """exact DP over (test subset, outcomes) keeping values, so every state has V, Q(stop), Q(test).
    lam > 0: every unit of budget spent costs lam nats of score (priced variant; lam = 0 is the engine's DP)."""

    def __init__(self, tb, lam=0.0):
        self.tb, self.lam = tb, float(lam)
        budget = tb.budget

        def leaf(s, w):
            r, _, tot = D._terminal(tb, w)
            return r - self.lam * float(sum(tb.costs[t] for t in s)) * tot, tot
        store = D._sweep(tb, budget, leaf)
        self.stop = {s: v[0] for s, v in store.items()}
        self.tot = {s: v[1] for s, v in store.items()}
        self.U = {}
        for s in sorted(self.stop, key=len, reverse=True):
            best = self.stop[s].copy()
            for t, s2, axis in D._extensions(tb, s, budget):
                best = np.maximum(best, self.U[s2].sum(axis=axis))
            self.U[s] = best
        self.value = float(self.U[()])

    def q(self, obs):
        """per-state normalised values: V, Q_stop, {test: Q}"""
        so = sorted(obs)
        s = tuple(t for t, _ in so)
        o = tuple(x for _, x in so)
        P = float(self.tot[s][o])
        qs = float(self.stop[s][o]) / P
        Q = {}
        for t, s2, axis in D._extensions(self.tb, s, self.tb.budget):
            Q[t] = float(self.U[s2].sum(axis=axis)[o]) / P
        V = float(self.U[s][o]) / P
        return V, qs, Q


def rename_random(tb, rng):
    """neutral names for a generator table (no 'control'/'specific' hints), tests in shuffled order"""
    perm = rng.permutation(tb.T)
    words = ["alpha", "bravo", "delta", "echo", "golf", "hotel", "kilo", "lima", "oscar", "romeo", "tango", "victor"]
    tests = [f"check_{words[i]}" for i in range(tb.T)]
    from dataclasses import replace
    return replace(tb, causes=[f"cause_{'ABCDEFGHIJ'[i]}" for i in range(tb.C)],
                   nuisances=["N1", "N2", "N3", "N4"], tests=tests,
                   costs=tb.costs[perm], outcomes=[[f"r{j + 1}" for j in range(len(tb.outcomes[p]))] for p in perm],
                   lik=[tb.lik[p] for p in perm], roles=[tb.roles[p] for p in perm],
                   description="A process failed. Exactly one of the listed causes is true.")


DIAG_SYSTEM = ("You are a diagnostician. Maximise your expected final score: the log-probability your final report "
               "gives to the true cause, relative to the prior. Reply with the answer only.")


def pct(x):
    return str(int(round(100 * x)))


class DiagEpisode:
    def __init__(self, tb, dp, seed, salt, lam=0.0, name=""):
        self.tb, self.dp, self.lam, self.name = tb, dp, lam, name
        self.lab = D.DiagLab(tb)
        self.lab.reset(seed, salt)
        self.seed = seed
        self.order = np.random.default_rng([seed, 4321]).permutation(tb.T)   # listing order, fixed per episode
        self.steps, self.done, self.retry, self.invalid = [], False, False, 0
        self.result = None

    # --- state
    def obs(self):
        return self.lab.obs

    def affordable(self):
        return D.affordable(self.tb, self.lab.obs, self.lab.remaining)

    def allowed(self):
        return [self.tb.tests[t] for t in self.affordable()] + ["stop"]

    def text(self, obs=None, remaining=None):
        tb = self.tb
        obs = self.lab.obs if obs is None else obs
        remaining = self.lab.remaining if remaining is None else remaining
        w = D.joint_weights(tb, obs)
        J = w / w.sum()
        q = J.sum(1)
        pn = J.sum(0)
        spent = tb.budget - remaining
        aff = set(D.affordable(tb, obs, remaining))
        aff = [t for t in self.order if t in aff]
        exp_now = D.expected_reward(tb, w) - self.lam * spent
        lines = [tb.description.strip() + " Run tests one at a time within the budget (each test at most once); "
                 "when you stop, the exact posterior over causes is reported for you.",
                 "Causes, exact posterior probability given the results so far (prior in brackets):",
                 "  " + " | ".join(f"{c} {q[i]:.3f} ({tb.prior[i]:.2f})" for i, c in enumerate(tb.causes)),
                 "Hidden nuisance conditions (not asked for, but they change what some tests show; they make test "
                 "results correlated, so the table below is updated after every result). Posterior: " +
                 " | ".join(f"{n} {pn[i]:.2f}" for i, n in enumerate(tb.nuisances)) + ".",
                 "Results so far: " + (", ".join(f"{tb.tests[t]} = {tb.outcomes[t][o]}" for t, o in obs) or "none") + ".",
                 f"Budget: {spent:g} of {tb.budget:g} units used ({remaining:g} remaining). Each test can be run once.",
                 "When you stop, the exact posterior at that point is reported; score = log q(true cause) - "
                 "log prior(true cause)." + (f" Every unit of budget spent costs {self.lam:g} from the score." if self.lam else
                                             " Unspent budget is worth nothing."),
                 f"Expected score if you stop now: {exp_now:.3f}.",
                 "Tests you can run now: cost, and P(result | cause) in percent given everything seen so far "
                 "(causes in the order above):"]
        for t in aff:
            pco = np.einsum("cn,cno->co", J, tb.lik[t]) / np.maximum(q[:, None], 1e-300)
            lines.append(f"  {tb.tests[t]} (cost {tb.costs[t]:g}):")
            for o, on in enumerate(tb.outcomes[t]):
                lines.append(f"    {on}: " + " ".join(pct(x) for x in pco[:, o]))
        allowed = [tb.tests[t] for t in aff] + ["stop"]
        lines.append("Answer with exactly one of: " + ", ".join(allowed) + ". Do not answer with a cause name.")
        return "\n".join(lines)

    def prompt(self):
        if self.done:
            return None
        if not self.affordable():          # nothing left: forced stop (not a decision)
            self._finish()
            return None
        u = self.text() + (RETRY if self.retry else "")
        return [{"role": "system", "content": DIAG_SYSTEM}, {"role": "user", "content": u}]

    def parse(self, text):
        return parse_choice(text, self.allowed())

    def fallback(self):
        return "stop"

    def act(self, a):
        V, qs, Q = self.dp.q(self.lab.obs)
        if a == "stop":
            qa = qs
        else:
            qa = Q[self.tb.index(a)]
        best_t = max(Q.values()) if Q else -np.inf
        dp_cont = best_t > qs + 1e-9
        # selection loss: if the agent tests, loss vs the best test (0 if it stops)
        self.steps.append(dict(a=a, adv=V - qa, stop=a == "stop", dp_cont=bool(dp_cont),
                               sel_adv=(best_t - qa) if a != "stop" else None,
                               n=len(self.lab.obs), remaining=float(self.lab.remaining)))
        if a == "stop":
            self._finish()
        else:
            self.lab.step(a)

    def _finish(self):
        self.done = True
        self.result = self.lab.submit(self.lab.exact_posterior())
        self.result["spent"] = float(self.lab.spent)
        self.result["reward_priced"] = self.result["reward"] - self.lam * self.lab.spent


def diag_policy_action(ep, kind, rng=None):
    """baseline policies in the same episode harness"""
    tb, obs, rem = ep.tb, ep.lab.obs, ep.lab.remaining
    w = D.joint_weights(tb, obs)
    if kind == "dp":
        V, qs, Q = ep.dp.q(obs)
        if not Q or max(Q.values()) <= qs + 1e-9:
            return "stop"
        return tb.tests[max(Q, key=Q.get)]
    if kind == "random":
        aff = D.affordable(tb, obs, rem)
        return tb.tests[int(rng.choice(aff))] if aff else "stop"
    t = D.greedy_policy(tb, w, obs, rem, per_cost=(kind == "greedy_per_cost"))
    return "stop" if t is None else tb.tests[t]


# ================================================================ stated-model credit desk
import credit_core as cc
import bbpub as P
import benv
import bbsecret as Z

CREDIT_SYSTEM = benv.SYSTEM


def credit_text(prior, tab, counts):
    text, allowed = benv.decision_prompt(prior, tab, counts, 0)
    text = text.replace("Posterior under your FITTED model:", "Exact posterior:")
    text = text.replace(" (fitted model)", "")
    text = re.sub(r"Fitted P\(band \| segment\), estimated from only 0 sandbox draws per cell \(so it is uncertain\), ",
                  "True P(band | segment), known exactly, ", text)
    return benv.compact(text).replace("True P(band | segment) in percent", "True P(band | segment) in percent"), allowed


class CreditEpisode:
    def __init__(self, D_, i, h, U, tag=""):
        self.D, self.i, self.h, self.U = D_, i, h, U
        self.S = D_.true_solver(i)
        self.counts = np.zeros((cc.E, cc.B), int)
        self.used = np.zeros(cc.E, int)
        self.steps, self.done, self.retry, self.invalid, self.final = [], False, False, 0, None

    def allowed(self):
        return benv.ACTIONS if self.counts.sum() < cc.T else benv.ACTIONS[3:]

    def prompt(self):
        if self.done:
            return None
        t, _ = credit_text(self.D.priors[self.i], self.D.T, self.counts)
        if "True P(band" not in t:
            raise RuntimeError("prompt rewrite failed")
        return [{"role": "system", "content": CREDIT_SYSTEM}, {"role": "user", "content": t + (RETRY if self.retry else "")}]

    def parse(self, text):
        return parse_choice(text, self.allowed())

    def fallback(self):
        return "decline"

    def act(self, a):
        an = self.S.analyse(self.counts)
        n = int(self.counts.sum())
        Qc = list(map(float, an["q_cont"])) if n < cc.T else []
        k = benv.ACTIONS.index(a)
        qa = Qc[k] if k < 3 else (an["v_approve"] if a == "approve" else 0.0)
        stop_v = max(an["v_approve"], 0.0)
        dp_cont = bool(Qc) and max(Qc) > stop_v + 1e-6
        dp_act = (benv.ACTIONS[int(np.argmax(Qc))] if dp_cont else ("approve" if an["v_approve"] >= 0 else "decline"))
        self.steps.append(dict(a=a, adv=an["V"] - qa, stop=k >= 3, dp_cont=dp_cont, dp_act=dp_act, n=n,
                               sel_adv=(max(Qc) - qa) if k < 3 else None))
        if k >= 3:
            self.done, self.final = True, a
            return
        x = Z.draw_scores(self.D.model, P.CHECKS[k], self.h, self.U[k, self.used[k]])
        self.counts[k, cc.bin_of(float(x))] += 1
        self.used[k] += 1


def credit_policy_action(ep, kind, rng=None):
    an = ep.S.analyse(ep.counts)
    n = int(ep.counts.sum())
    va = an["v_approve"]
    commit = "approve" if va >= 0 else "decline"
    if kind == "dp":
        Qc = an["q_cont"] if n < cc.T else None
        if Qc is not None and Qc.max() > max(va, 0) + 1e-6:
            return benv.ACTIONS[int(np.argmax(Qc))]
        return commit
    if kind == "no_check":
        return commit
    if kind == "always_decline":
        return "decline"
    if kind == "check_once":            # always one (best one-step) check, then commit on the posterior
        if n == 0:
            q = ep.S.post_counts(ep.counts)
            best, arg = ep.S._look(q[None], 1)
            return benv.ACTIONS[int(arg[0])]
        return commit
    if kind == "one_step":              # myopic one-step lookahead
        if n >= cc.T:
            return commit
        q = ep.S.post_counts(ep.counts)
        best, arg = ep.S._look(q[None], 1)
        return benv.ACTIONS[int(arg[0])] if best[0] > max(va, 0) + 1e-6 else commit
    if kind == "random":
        allowed = ep.allowed()
        return allowed[int(rng.integers(len(allowed)))]
    raise ValueError(kind)


# ================================================================ Battleship full games
from bayesenv import battleship as B

BS_SYSTEM = ("You are playing a search game. Maximise the expected score of your final report. "
             "Reply with the answer only.")


def bs_expected_score(b):
    """expected score_raw of reporting the exact posterior now (EPS mixing ignored: < 0.01)"""
    g = B.geometry()
    q = np.clip(b.rules(), 1e-12, 1)
    rule = float((q * (np.log(q) - np.log(B.RULE_PRIOR))).sum()) / B.RULE_NORM
    o = np.clip(b.occupancy(), 1e-9, 1 - 1e-9)
    p0 = g.p0
    cell = float((o * np.log(o / p0) + (1 - o) * np.log((1 - o) / (1 - p0))).sum()) / g.cell_norm
    return 0.5 * (rule + cell)


def bs_action_str(a):
    if a < 36:
        return f"fire {a // 6} {a % 6}"
    li = a - 36
    return f"scan row {li}" if li < 6 else f"scan col {li - 6}"


def bs_parse(text, remaining):
    t = text.strip().lower()
    if re.match(r"^\W*(stop|done|submit)\b", t):
        return "stop"
    m = re.search(r"fire\D{0,3}([0-5])\D{1,3}([0-5])", t)
    if m:
        a = int(m.group(1)) * 6 + int(m.group(2))
        return a if remaining >= 1 else None
    m = re.search(r"scan\W*(row|col|column)\D{0,3}([0-5])", t)
    if m:
        a = 36 + int(m.group(2)) + (6 if m.group(1).startswith("col") else 0)
        return a if remaining >= 2 else None
    if re.search(r"\bstop\b", t):
        return "stop"
    return None


class BSEpisode:
    def __init__(self, seed, salt):
        self.lab = B.BattleshipLab()
        self.lab.reset(seed, salt)
        self.seed = seed
        self.steps, self.done, self.retry, self.invalid, self.result = [], False, False, 0, None

    def text(self):
        b, lab = self.lab.belief, self.lab
        occ = b.occupancy().reshape(6, 6)
        r = b.rules()
        hist = "; ".join(f"{bs_action_str(B.parse_action(h)[0])} -> " +
                         (("hit" if h["result"] else "miss") if h["type"] == "fire" else str(h["result"]))
                         for h in lab.history) or "none"
        lines = [
            "A 6x6 board (rows and columns 0-5) hides three ships (lengths 4, 3, 2; horizontal or vertical; no "
            "overlap), placed by one of six rules: any, no_touch, parallel, border, center_clear, clustered.",
            "Exact posterior probability of each rule: " + " | ".join(f"{n} {p:.3f}" for n, p in zip(B.NAMES, r)) + ".",
            "Exact posterior probability (percent) that each cell is covered by a ship (row 0 first, columns 0-5):"]
        for i in range(6):
            lines.append(f"  row {i}: " + " ".join(f"{int(round(100 * x)):>3d}" for x in occ[i]))
        lines += [
            "Actions: fire at one cell, written 'fire <row> <column>' (cost 1): reports hit or miss, wrong with "
            "probability 0.1. Scan one whole row or column, written 'scan row <index>' or 'scan col <index>' (cost 2): "
            "reports the number of ship cells in that line, off by one with probability 0.3. 'stop': end now. "
            "Repeating an action is allowed (fresh noise).",
            f"Results so far: {hist}.",
            f"Budget: {lab.spent} of {B.BUDGET} used ({lab.remaining} remaining).",
            "When you stop (or the budget runs out) the exact posterior is reported; the score is the log-probability "
            "it gives to the true rule and the true cell states, relative to the prior. Unspent budget is worth nothing.",
            f"Expected score if you stop now: {max(0.0, bs_expected_score(b)):.3f}.",
            "Answer with exactly one action, for example: fire 2 3, scan row 1, scan col 4, or stop."]
        return "\n".join(lines)

    def prompt(self):
        if self.done:
            return None
        if self.lab.remaining <= 0:
            self._finish()
            return None
        return [{"role": "system", "content": BS_SYSTEM}, {"role": "user", "content": self.text() + (
            "\n(Your previous answer was invalid or unaffordable. Answer with exactly one action.)" if self.retry else "")}]

    def parse(self, text):
        return bs_parse(text, self.lab.remaining)

    def fallback(self):
        return "stop"

    def act(self, a):
        b = self.lab.belief
        eig = b.eig()
        cost = np.array([B.action_cost(x) for x in range(B.N_ACTIONS)])
        ok = cost <= self.lab.remaining
        per = np.where(ok, eig / cost, -np.inf)
        best = float(per.max())
        if a == "stop":
            ratio = 0.0
        else:
            ratio = float(per[a] / best) if best > 0 else 1.0
        self.steps.append(dict(a=a if a == "stop" else bs_action_str(a), stop=a == "stop", ratio=ratio,
                               scan=(a != "stop" and a >= 36), n=len(self.lab.history), remaining=self.lab.remaining,
                               ref_scan=bool(int(np.argmax(per)) >= 36)))
        if a == "stop":
            self._finish()
        else:
            self.lab.step_id(int(a))

    def _finish(self):
        self.done = True
        b = self.lab.belief
        self.result = self.lab.submit(b.rules(), b.occupancy(), reference=False)


def bs_policy_action(ep, kind, rng=None):
    lab = ep.lab
    if kind == "reference":
        return B.greedy_action(lab.belief, lab.remaining)
    if kind == "fires_only":
        return B.greedy_action(lab.belief, lab.remaining, fires_only=True)
    if kind == "random":
        ok = [a for a in range(B.N_ACTIONS) if B.action_cost(a) <= lab.remaining]
        return int(rng.choice(ok))
    if kind == "hunter":
        return B._hunter_action(lab, rng)
    if kind == "stop_early":
        return "stop" if lab.history else B.greedy_action(lab.belief, lab.remaining)
    if kind == "do_nothing":
        return "stop"
    raise ValueError(kind)


# ================================================================ drivers
def run_policy_episodes(eps, choose):
    """CPU baseline driver: choose(ep) -> action"""
    for ep in eps:
        while ep.prompt() is not None:
            ep.act(choose(ep))
    return eps


def run_model_episodes(eps, generate, max_new, log=None):
    """GPU driver: batched greedy generation across live episodes; invalid -> one retry -> fallback"""
    raws = []
    while True:
        live, msgs = [], []
        for ep in eps:
            p = ep.prompt()
            if p is not None:
                live.append(ep); msgs.append(p)
        if not live:
            break
        outs = generate(msgs, max_new)
        for ep, o in zip(live, outs):
            a = ep.parse(o)
            if len(raws) < 400:
                raws.append(o)
            if a is None:
                ep.invalid += 1
                if ep.retry:
                    ep.retry = False
                    ep.act(ep.fallback())
                else:
                    ep.retry = True
                continue
            ep.retry = False
            ep.act(a)
        if log:
            log(f"  live {len(live)}")
    return raws
