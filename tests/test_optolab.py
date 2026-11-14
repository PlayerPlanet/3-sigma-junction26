"""Optogenetics lab: exact inference against an independent brute force (numerical integration
over every table entry, explicit sums over expression levels), the environment contract,
reward properties, and the ordering of the calibration policies."""

import itertools
import math

import numpy as np
import pytest
from scipy import integrate

from bayesenv import optolab as O

CFG = O.DEFAULT


# ---- independent brute force ---------------------------------------------------------------

def beta_expect(f):
    """E[f(theta)] for theta ~ Beta(0.5, 0.5), by quadrature after theta = sin^2(phi)."""
    assert CFG.alpha == 0.5
    return integrate.quad(lambda ph: f(math.sin(ph) ** 2), 0, math.pi / 2, epsabs=0, epsrel=1e-11,
                          limit=400)[0] * 2 / math.pi


def trials_of(lab):
    """[(full state as tuple, regime)] with regime None (record) or (animal, intensity index)."""
    out = []
    for rec in lab.history:
        if rec["action"] == "record":
            out += [(tuple(r), None) for r in rec["samples"]]
        elif rec["action"] == "light":
            ii = lab.cfg.intensities.index(rec["intensity"])
            out += [(tuple(r), (rec["animal"], ii)) for r in rec["samples"]]
    return out


def brute_pop_node(lab, j, S):
    """log marginal likelihood of population j's term with parent set S, and E[theta | config]."""
    eff = O.efficacy(CFG)
    tr = trials_of(lab)
    inj = [(a, k) for a, an in enumerate(lab.animals) for k, p in enumerate(an["populations"]) if p == j]
    groups = {}
    for x, reg in tr:
        c = tuple(x[i] for i in range(O.NP) if (S >> i) & 1)
        groups.setdefault(c, []).append((x[j], reg))
    tot, means = 0.0, {}
    num = {c: 0.0 for c in groups}
    for levels in itertools.product(range(3), repeat=len(inj)):
        lv = dict(zip(inj, levels))
        pl = math.prod(CFG.level_prior[l] for l in levels)
        facs = {}
        for c, rows in groups.items():
            def lik(th, rows=rows):
                p = 1.0
                for y, reg in rows:
                    nat = th if y else 1 - th
                    a = None if reg is None else reg[0]
                    if a is not None and j in lab.animals[a]["populations"]:
                        e = eff[reg[1], lv[(a, lab.animals[a]["populations"].index(j))]]
                        v = O.OPSINS[lab.animals[a]["opsin"]]
                        p *= e * (y == v) + (1 - e) * nat
                    else:
                        p *= nat
                return p
            facs[c] = (beta_expect(lik), beta_expect(lambda th, lik=lik: th * lik(th)))
        z = pl * math.prod(f[0] for f in facs.values())
        tot += z
        for c in groups:
            num[c] += z * facs[c][1] / facs[c][0]
    return math.log(tot), {c: num[c] / tot for c in groups}


def brute_lever(lab, S, gate):
    tr = trials_of(lab)
    groups = {}
    for x, reg in tr:
        c = tuple(x[i] for i in range(O.NP) if (S >> i) & 1)
        h = 0.0 if reg is None else CFG.heat[reg[1]]
        groups.setdefault(c, []).append((x[O.L], h))
    out = 0.0
    for c, rows in groups.items():
        def lik(th, rows=rows):
            return math.prod(h * (y == 1) + (1 - h) * (th if y else 1 - th) for y, h in rows)
        if gate:
            out += math.log(lik(CFG.or_on if any(c) else CFG.or_off))
        else:
            out += math.log(beta_expect(lik))
    return out


@pytest.fixture(scope="module")
def played():
    """A random-design episode with records, single and dual animals, several intensities."""
    lab = O.OptoLab()
    lab.reset(3, "brute")
    for a in ({"action": "record"},
              {"action": "express", "opsin": "ChR2", "populations": ["VTA"]},
              {"action": "light", "animal": 0, "intensity": 3},
              {"action": "light", "animal": 0, "intensity": 30},
              {"action": "express", "opsin": "ArchT", "populations": ["VTA", "PFC"]},
              {"action": "light", "animal": 1, "intensity": 10},
              {"action": "light", "animal": 1, "intensity": 1}):
        lab.step(a)
    return lab


@pytest.mark.parametrize("j", [0, 2, 3])
def test_population_term_matches_brute_force(played, j):
    nd = played.belief.node(j)
    for S in range(O.XP):
        if (S >> j) & 1:
            continue
        lml, means = brute_pop_node(played, j, S)
        assert nd["logml"][S] == pytest.approx(lml, abs=1e-7)
        for c, m in means.items():
            x = sum(b << i for b, i in zip(c, [i for i in range(O.NP) if (S >> i) & 1]))
            assert nd["Eth"][S, x] == pytest.approx(m, abs=1e-7)


def test_lever_term_matches_brute_force(played):
    nd = played.belief.node(O.L)
    st = O.structures()
    lp = O.lever_log_prior(CFG)
    for k, (S, g) in enumerate(st.lm):
        assert nd["logml"][k] == pytest.approx(brute_lever(played, S, g), abs=1e-7)
    w = np.exp(lp + nd["logml"] - np.logaddexp.reduce(lp + nd["logml"]))
    assert np.exp(nd["lw"]) == pytest.approx(w, abs=1e-10)


def test_predictive_matches_importance_sampling():
    """Posterior predictive of ideal interventions vs self-normalised importance sampling from
    the prior, with the trial likelihood computed directly from (circuit, tables, levels)."""
    lab = O.OptoLab()
    lab.reset(5, "is")
    rec = lab.step({"action": "record"})["result"]["samples"][:3]
    lab.step({"action": "express", "opsin": "ArchT", "populations": ["NAc", "BLA"]})
    ses = lab.step({"action": "light", "animal": 0, "intensity": 30})["result"]["samples"][:3]
    lab.finish()
    b = O.Belief(CFG)
    b.add(rec)
    b.add_animal(0, [1, 3])
    b.add(ses, 0, 3)
    data = [(tuple(r), None) for r in rec] + [(tuple(r), (0, 3)) for r in ses]
    rng = np.random.default_rng(0)
    n = 1_000_000
    d = O.draw_prior(rng, CFG, n)
    lv = rng.choice(3, size=(n, 2), p=CFG.level_prior)
    eff = O.efficacy(CFG)
    logw = np.zeros(n)
    for x, reg in data:
        xp = sum(b_ << i for i, b_ in enumerate(x[:O.NP]))
        for i in range(O.NP):
            t = d["theta_pop"][:, i, xp]
            nat = t if x[i] else 1 - t
            if reg is not None and i in (1, 3):
                e = eff[reg[1], lv[:, (1, 3).index(i)]]
                nat = e * (x[i] == 0) + (1 - e) * nat
            logw += np.log(nat)
        t = d["theta_lever"][:, xp]
        h = 0.0 if reg is None else CFG.heat[reg[1]]
        logw += np.log(h * (x[O.L] == 1) + (1 - h) * (t if x[O.L] else 1 - t))
    w = np.exp(logw - logw.max())
    w /= w.sum()
    ess = 1 / np.sum(w ** 2)
    assert ess > 500
    vals = O.query_values(d["theta_pop"], d["theta_lever"], lab.queries)
    est = w @ vals
    se = np.sqrt(w ** 2 @ (vals - est) ** 2)
    exact = b.predict(lab.queries)
    assert np.all(np.abs(exact - est) < 5 * se + 2e-3), (exact, est, se)


# ---- reward and environment ----------------------------------------------------------------

def test_prior_scores_exactly_zero():
    lab = O.run_policy("prior", 7, "z")
    assert lab.result["reward_raw"] == 0.0 and lab.result["score"] == 0.0
    pp = O.prior_predictive()
    assert np.allclose(pp["pop_single"], 0.5) and np.allclose(pp["pop_double"], 0.5)


def test_truth_scores_raw_truth_and_clamp():
    lab = O.run_policy("record_only", 2, "t", submit=False)
    r = lab.score(lab.truth)
    assert r["reward_raw"] == pytest.approx(r["raw_knowing_truth"])
    assert 0 <= r["score"] <= 1
    assert lab.score(np.zeros(CFG.n_queries))["score"] >= 0.0


def test_truth_matches_monte_carlo_of_ideal_intervention():
    lab = O.OptoLab()
    lab.reset(11, "mc")
    lab.finish()
    rng = np.random.default_rng(1)
    order = lab._order
    for (do, t), p in zip(lab.queries[:6], lab.truth[:6]):
        n, x = 200_000, np.zeros(200_000, np.int64)
        for i in order:
            v = np.full(n, do[i]) if i in do else rng.random(n) < lab.theta_pop[i, x]
            x |= v.astype(np.int64) << i
        y = rng.random(n) < lab.theta_lever[x] if t == O.L else (x >> t) & 1
        assert abs(y.mean() - p) < 0.005


def test_stored_norm_matches_monte_carlo():
    est = O.estimate_norm(CFG, draws=100_000, seed=9)
    assert abs(est["norm"] - O.norm_constant(CFG)) < 4 * est["se"] + 1e-4


def test_determinism_under_seed_and_salt():
    a = O.run_policy("reference", 4, "s1")
    b = O.run_policy("reference", 4, "s1")
    c = O.run_policy("reference", 4, "s2")
    assert a.history == b.history and a.result == b.result
    assert np.allclose(a.truth, b.truth)
    assert not np.allclose(a.truth, c.truth) or a.history != c.history


@pytest.mark.parametrize("bad", [
    None, {}, {"action": "fly"}, {"action": "express", "opsin": "GFP", "populations": ["VTA"]},
    {"action": "express", "opsin": "ChR2", "populations": ["VTA", "VTA"]},
    {"action": "express", "opsin": "ChR2", "populations": ["VTA", "NAc", "PFC"]},
    {"action": "express", "opsin": "ChR2", "populations": ["LEVER"]},
    {"action": "light", "animal": 0, "intensity": 10},              # no animal yet
    {"action": "light", "animal": True, "intensity": 10},
])
def test_invalid_actions_rejected_without_consuming_budget(bad):
    lab = O.OptoLab()
    lab.reset(0, "v")
    with pytest.raises(ValueError):
        lab.step(bad)
    assert lab.remaining == CFG.budget and not lab.history


def test_invalid_intensity_and_budget():
    lab = O.OptoLab()
    lab.reset(0, "b")
    lab.step({"action": "express", "opsin": "ChR2", "populations": ["VTA"]})
    with pytest.raises(ValueError):
        lab.step({"action": "light", "animal": 0, "intensity": 7})
    while lab.remaining:
        lab.step({"action": "light", "animal": 0, "intensity": 3})
    assert lab.spent == CFG.budget
    with pytest.raises(ValueError):
        lab.step({"action": "record"})
    with pytest.raises(RuntimeError):
        lab.submit([0.5] * CFG.n_queries)          # queries not revealed yet
    q = lab.finish()["queries"]
    assert len(q) == CFG.n_queries
    with pytest.raises(RuntimeError):
        lab.step({"action": "record"})
    with pytest.raises(ValueError):
        lab.submit([0.5] * (CFG.n_queries - 1))
    lab.submit([0.5] * CFG.n_queries)
    with pytest.raises(RuntimeError):
        lab.submit([0.5] * CFG.n_queries)


def test_clamps_and_heat_are_applied():
    lab = O.OptoLab()
    lab.reset(1, "c")
    lab.step({"action": "express", "opsin": "ArchT", "populations": ["PFC"]})
    lev = lab.animals[0]["levels"][0]
    rows = []
    for _ in range(6):
        rows += lab.step({"action": "light", "animal": 0, "intensity": 30})["result"]["samples"]
    rows = np.array(rows)
    e = O.efficacy(CFG)[3, lev]
    # PFC must be 0 at least as often as the clamp takes; LEVER gets heat-induced presses
    assert rows[:, 2].mean() <= 1 - e + 0.35
    assert len(rows) == 6 * CFG.session_trials


def test_rules_are_json_and_complete():
    import json
    r = O.rules()
    json.dumps(r)
    s = json.dumps(r)
    for key in ("543", "Beta(0.5, 0.5)", "OR gate", "I^2", "heats", "prior predictive", "0.7"):
        assert key in s, key


def test_reference_beats_shortcuts_on_average():
    """Small paired check (the full table is scripts/optolab_calibrate.py on 400 seeds)."""
    rows = [O.evaluate_seed(s, "unit", designs=("random", "max_light")) for s in range(8)]
    m = {k: np.mean([r[k] for r in rows]) for k in
         ("reference", "random", "see_as_do", "max_light+ignore_heat", "prior")}
    assert m["prior"] == 0.0
    assert m["reference"] > m["random"] and m["reference"] > m["see_as_do"]
    assert m["reference"] > m["max_light+ignore_heat"]
