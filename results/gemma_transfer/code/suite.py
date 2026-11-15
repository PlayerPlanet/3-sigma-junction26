"""Episode and state-bank construction for the transfer suite (shared by the GPU run and the CPU baselines).
Everything is deterministic in the seeds below, so base, trained and every baseline see the same hidden states."""
import json
import numpy as np
import tasks as X
from bayesenv import diag as D
import benv, credit_core as cc, bbsecret as Z

META = json.load(open("tasks_meta.json"))
LAM = 0.1
N_DIAG = 150
N_RAND_TABLES, N_RAND_SEEDS = 30, 4
CREDIT_DESKS = benv.EVAL_DESKS
N_CREDIT_WORLDS = 5
N_BS = 60

_cache = {}


def low_yield(lam=0.0):
    k = ("ly", lam)
    if k not in _cache:
        from dataclasses import replace
        tb = D.load_table("low_yield")
        tb = replace(tb, tests=["check_" + t for t in tb.tests],
                     description="A batch gave a third of the expected yield. Exactly one of the listed causes is true.")
        _cache[k] = (tb, X.DiagDP(tb, lam))
    return _cache[k]


def random_tables():
    if "rt" not in _cache:
        rng = np.random.default_rng(20261114)
        out = []
        for k in range(N_RAND_TABLES):
            tb = X.rename_random(D.random_table(rng), np.random.default_rng(k))
            out.append((tb, X.DiagDP(tb)))
        _cache["rt"] = out
    return _cache["rt"]


def diag_episodes(cond):
    if cond == "diag_free":
        tb, dp = low_yield()
        return [X.DiagEpisode(tb, dp, s, "transfer-diag", name="low_yield") for s in range(N_DIAG)]
    if cond == "diag_priced":
        tb, dp = low_yield(LAM)
        return [X.DiagEpisode(tb, dp, s, "transfer-priced", lam=LAM, name="low_yield_priced") for s in range(N_DIAG)]
    if cond == "diag_random":
        return [X.DiagEpisode(tb, dp, s, f"transfer-rand{k}", name=f"rand{k}")
                for k, (tb, dp) in enumerate(random_tables()) for s in range(N_RAND_SEEDS)]
    raise ValueError(cond)


def desk(d):
    if ("desk", d) not in _cache:
        _cache[("desk", d)] = benv.Desk(d, seeds=META[str(d)]["seeds"])
    return _cache[("desk", d)]


def credit_episodes(salt="stated", n_worlds=N_CREDIT_WORLDS):
    eps = []
    for d in CREDIT_DESKS:
        Dk = desk(d)
        for s in range(n_worlds):
            for i, sd in enumerate(Dk.seeds):
                r = Z.rng_of("live", d, sd, f"{salt}{s}", i)
                h = int(r.choice(cc.K, p=Dk.priors[i] / Dk.priors[i].sum()))
                ep = X.CreditEpisode(Dk, i, h, r.random((cc.E, cc.T)))
                ep.key = (d, s, i)
                eps.append(ep)
    return eps


def bs_episodes():
    return [X.BSEpisode(s, "transfer-bs") for s in range(N_BS)]


# ---------------------------------------------------------------- state banks (fixed, off-policy, paired)
class BankState:
    """wraps an episode advanced to a recorded state; one decision is graded"""

    def __init__(self, ep, label):
        self.ep, self.label = ep, label
        self.rec = None

    def prompt(self):
        return None if self.rec is not None else self.ep.prompt()


def _replay(ep, actions):
    for a in actions:
        ep.act(a)
    ep.steps = []
    return ep


def diag_bank(n_each=120):
    tb, dp = low_yield(LAM)
    rng = np.random.default_rng(77)
    pool = {True: [], False: []}
    for kind in ("dp", "greedy", "greedy_per_cost", "random"):
        prng = np.random.default_rng(5)
        for s in range(60):
            ep = X.DiagEpisode(tb, dp, 10_000 + s, "transfer-bank", lam=LAM)
            acts = []
            while ep.prompt() is not None:
                V, qs, Q = dp.q(ep.lab.obs)
                pool[bool(Q) and max(Q.values()) > qs + 1e-9].append((s, tuple(acts)))
                a = X.diag_policy_action(ep, kind, prng)
                acts.append(a)
                ep.act(a)
    out = []
    for cont in (False, True):
        uniq = sorted(set(pool[cont]))
        idx = rng.choice(len(uniq), min(n_each, len(uniq)), replace=False)
        for j in idx:
            s, acts = uniq[j]
            ep = _replay(X.DiagEpisode(tb, dp, 10_000 + s, "transfer-bank", lam=LAM), acts)
            out.append(BankState(ep, "dp_continue" if cont else "dp_stop"))
    return out


def _credit_ep(key):
    d, s, i = key
    Dk = desk(d)
    r = Z.rng_of("live", d, Dk.seeds[i], f"bank{s}", i)
    h = int(r.choice(cc.K, p=Dk.priors[i] / Dk.priors[i].sum()))
    ep = X.CreditEpisode(Dk, i, h, r.random((cc.E, cc.T)))
    ep.key = key
    return ep


def credit_bank(n_each=100):
    rng = np.random.default_rng(78)
    pool = {"check": [], "approve": [], "decline": []}
    keys = [(d, s, i) for d in CREDIT_DESKS for s in range(2) for i in range(benv.N_APP)]
    for kind in ("dp", "one_step", "random", "check_once"):
        prng = np.random.default_rng(6)
        for key in keys:
            ep0 = _credit_ep(key)
            acts = []
            while ep0.prompt() is not None:
                a = X.credit_policy_action(ep0, kind, prng)
                ep0.act(a)
                st = ep0.steps[-1]
                pool["check" if st["dp_cont"] else st["dp_act"]].append((key, tuple(acts)))
                acts.append(a)
    out = []
    for lab in ("check", "approve", "decline"):
        uniq = sorted(set(pool[lab]))
        idx = rng.choice(len(uniq), min(n_each, len(uniq)), replace=False)
        for j in sorted(idx):
            key, acts = uniq[j]
            out.append(BankState(_replay(_credit_ep(key), acts), "dp_" + lab))
    return out


def bank_eval(bank, choose_fn):
    """choose_fn(list of BankState) -> list of actions (None = invalid). Grades one step per state."""
    acts = choose_fn(bank)
    for b, a in zip(bank, acts):
        inval = a is None
        b.ep.act(a if a is not None else b.ep.fallback())
        st = b.ep.steps[-1]
        b.rec = dict(label=b.label, a=st["a"], adv=st["adv"], stop=st["stop"], invalid=inval)
    return [b.rec for b in bank]


# ---------------------------------------------------------------- per-episode summaries
def summarise(cond, eps):
    out = []
    for ep in eps:
        if cond.startswith("diag"):
            r = ep.result
            out.append(dict(name=ep.name, seed=ep.seed, reward=r["reward"], reward_priced=r["reward_priced"],
                            n_tests=r["n_tests"], spent=r["spent"], dp_value=ep.dp.value,
                            v_hat=ep.dp.value - sum(s["adv"] for s in ep.steps), steps=ep.steps, invalid=ep.invalid))
        elif cond == "credit":
            out.append(dict(key=list(ep.key), final=ep.final, checks=int(ep.counts.sum()),
                            V_star=ep.S.V0(), nodata=ep.S.nodata(), v_hat=ep.S.V0() - sum(s["adv"] for s in ep.steps),
                            steps=ep.steps, invalid=ep.invalid))
        elif cond == "bship":
            r = ep.result
            out.append(dict(seed=ep.seed, score_raw=r["score_raw"], rule_acc=r["accuracy"], n_actions=r["n_actions"],
                            n_scans=r["n_scans"], budget_used=r["budget_used"], steps=ep.steps, invalid=ep.invalid))
    return out


def episodes(cond):
    if cond.startswith("diag"):
        return diag_episodes(cond)
    if cond == "credit":
        return credit_episodes()
    if cond == "bship":
        return bs_episodes()
    raise ValueError(cond)
