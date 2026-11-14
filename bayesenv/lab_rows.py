"""Design rows from the lab simulators, in the row schema of bayesenv/datagen.py.

Purpose: a zero-shot evaluation set (`split: "lab_transfer"`) for models trained only on the
toy spec families. A row shows the lab's full disclosed model, a history of experiments, and six
candidate next experiments; `datagen.design_reward(row, completion)` scores the choice as
eig[chosen] / max(eig), unchanged. See docs/LAB_ROWS.md.

Labs (`spec`):
  lab:chem  bayesenv.chem_lab   design [temperature, time, concentration]; eig = exact expected
            information gain about the fault hypothesis (12-point Gauss-Hermite)
  lab:diag  bayesenv.diag       design [test number]; eig = exact one-step information gain about
            the cause; plus `value` = exact expected final reward of taking the test now and then
            following the optimal (dynamic programming) policy, `greedy_choice`, `dp_choice`
  lab:dag   bayesenv.dagnet     design [variable, value] ([-1, 0] = observe); eig = exact
            expected information gain of ONE more joint sample about (DAG, tables), which is what
            the lab's reference policy maximises (an experiment returns a batch of such samples)
  lab:wetlab bayesenv.wetlab    design [substrate, catalyst, product_spike, temperature, t1, t2,
            t3]; eig = the lab's simulation-based ESTIMATE of the expected information gain
            about the mechanism (mean of WET_REPS calls of wetlab.eig on the lab's particle
            belief). Not exact and not recomputable from the row; stability: wet_stability()

For the three exact labs everything a label depends on is in the row: the posterior used for
the labels is computed from the designs and results exactly as printed in the prompt. The hidden truth is never written.
"""

from __future__ import annotations

import hashlib
import json
import re

import numpy as np

from . import chem_lab as CH
from .datagen import N_CANDIDATES, fmt_design

SPLIT = "lab_transfer"
SALT = "lab_transfer"          # mixed into every hidden-state stream (see chem_lab.salted_key)
SEED_BASE = {"chem": 7_100_000, "diag": 7_200_000, "dag": 7_300_000, "wetlab": 7_400_000}
SPECS = ("lab:chem", "lab:diag", "lab:dag", "lab:wetlab")
# wet-lab label = mean of WET_REPS wetlab.eig(n_sim=WET_NSIM) calls
WET_REPS, WET_NSIM, WET_POOL = 8, 48, 40
# states whose best estimated gain is below this are skipped: there the labels are estimator
# noise (the belief has already settled on one mechanism) and eig / max(eig) means nothing
WET_MIN_EIG = 0.02
SOURCES = ("reference", "random")
POOL = 64                      # as datagen.design_candidates: best of a random pool of 64
# States in which no candidate has at least this much expected information gain (nats) are
# skipped: the belief has collapsed onto one hypothesis, every label is 0 to the printed
# precision and eig / max(eig) is undefined. (Only the chemistry lab reaches such states.)
MIN_EIG = 1e-3
VALUE_TIE = 1e-9               # values closer than this count as equal (diag)
INTRO = "You are a scientist running experiments on an unknown system."
BEGIN = "Begin. Run your first experiment."
RESULT_RE = re.compile(r"^Result: (.*?)\. (?:Experiments|Budget|Stock) remaining: ", re.S)


def _hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=float).encode()).hexdigest()[:12]


def _g(v: float) -> str:
    return f"{float(v):g}"


def candidates_message(clist: list[list]) -> str:
    """Same text as datagen.candidates_message, for designs that are already formatted lists."""
    lines = "\n".join(f"{i + 1}: {json.dumps(c)}" for i, c in enumerate(clist))
    return ("Choose your next experiment from these candidate designs, picking the one you expect "
            f"to be most informative:\n{lines}\nReply with exactly one tag, <observe>[design]</observe>.")


def _system(describe: str, card: str, limit: str, final: str, example: list, fmt: str) -> str:
    """The toy system prompt (llm_agent.system_prompt), section by section, with lab content."""
    return (f"{INTRO}\n\n{describe}\n\n{card}\n\n{limit} Choose each one to learn as much as "
            f"possible; {final}\n\n"
            "To run an experiment, reply with your reasoning followed by exactly one tag, e.g. "
            f"<observe>{json.dumps(example)}</observe>. To stop experimenting early, reply <done/>.\n"
            f"In the final phase you must answer with {fmt}, and nothing after it.")


def _row(lab: str, spec_hash: str, family: str, seed: int, source: str, system: str,
         history: list[tuple[list, str]], clist: list[list], eig, extra: dict | None = None) -> dict:
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": BEGIN}]
    for design, result in history:
        msgs.append({"role": "assistant", "content": f"<observe>{json.dumps(design)}</observe>"})
        msgs.append({"role": "user", "content": result})
    msgs[-1] = {"role": "user", "content": msgs[-1]["content"] + "\n" + candidates_message(clist)}
    return {"spec": f"lab:{lab}", "spec_hash": spec_hash, "instance": -1, "seed": int(seed),
            "split": SPLIT, "env": f"lab:{lab}@{spec_hash}", "family": family, "source": source,
            "depth": len(history), "prompt": msgs, "kind": "design", "candidates": clist,
            "eig": [round(float(e), 5) + 0.0 for e in eig], **(extra or {})}


def parse_history(row: dict) -> tuple[list[list], list[str]]:
    """(designs, result strings) of the experiments in a row's prompt, in order."""
    msgs = row["prompt"]
    designs = [json.loads(m["content"][len("<observe>"):-len("</observe>")])
               for m in msgs if m["role"] == "assistant"]
    results = [RESULT_RE.match(m["content"]).group(1) for m in msgs[3::2]]
    assert len(designs) == len(results) == row["depth"]
    return designs, results


# ---- chemistry lab ----------------------------------------------------------------------

def chem_system() -> str:
    b, hyps = CH.BOUNDS, CH.HYPOTHESES
    describe = (
        "You operate a reactor running A -> B. Exactly one of the hypotheses listed below about "
        "the reactor is true (a fault, or no fault). Each experiment sets the temperature (in K), "
        "the reaction time (in min) and the co-reagent concentration (in M) and returns a noisy "
        "measured yield (the fraction of A converted). Experiments are numbered i = 0, 1, ... in "
        "the order you run them. Design an experiment by choosing [temperature, time, "
        f"concentration] with {_g(b['temperature'][0])} <= temperature <= {_g(b['temperature'][1])} K, "
        f"{_g(b['time'][0])} <= time <= {_g(b['time'][1])} min, "
        f"{_g(b['concentration'][0])} <= concentration <= {_g(b['concentration'][1])} M. The outcome "
        "is the measured yield, with additive measurement noise (not clipped to [0, 1]). At the "
        "end, report the probability of each hypothesis.")
    hl = "\n".join(f"{k + 1}. {h.name} (prior {_g(h.prior)}): {h.description}" for k, h in enumerate(hyps))
    card = (
        f"Exact generative model: one hypothesis is drawn from the priors below. "
        f"outcome = 1 - exp(-k * time) + Normal(0, sd {_g(CH.SIGMA)}) noise, with rate "
        f"k = {_g(CH.A0)} * exp(-{_g(CH.EA)} / ({_g(CH.R)} * T_act)) * c_act * decay ** i per min, "
        "where T_act = temperature + dT, c_act = max(scale * concentration - delta, 0), and "
        "(dT, scale, delta, decay) = (0, 1, 0, 1) unless the hypothesis says otherwise.\n"
        f"Hypotheses:\n{hl}")
    return _system(
        describe, card, f"You may run at most {CH.BUDGET} experiments.",
        "you will then be asked for the probability of each hypothesis. Your answer is scored by "
        "the log of the probability it assigns to the true hypothesis, so be calibrated: confident "
        "where the evidence supports it, uncertain where it does not.",
        [330, 30, 0.2], "a JSON list of probabilities, one per hypothesis in the order listed")


def _chem_round(x) -> np.ndarray:
    lo = np.array([CH.BOUNDS[k][0] for k in CH.KEYS])
    hi = np.array([CH.BOUNDS[k][1] for k in CH.KEYS])
    return np.clip(np.array(fmt_design([float(f"{v:.4g}") for v in np.asarray(x, float)]), float), lo, hi)


def _chem_random(rng: np.random.Generator, n: int) -> np.ndarray:
    lo = np.array([CH.BOUNDS[k][0] for k in CH.KEYS])
    hi = np.array([CH.BOUNDS[k][1] for k in CH.KEYS])
    return np.array([_chem_round(lo + (hi - lo) * rng.random(3)) for _ in range(n)])


def chem_state(row: dict) -> tuple[np.ndarray, int]:
    """(exact posterior over hypotheses, run index of the next experiment) from the prompt."""
    designs, results = parse_history(row)
    return CH.posterior(designs, [float(r) for r in results]), len(designs)


def chem_labels(row: dict) -> np.ndarray:
    p, index = chem_state(row)
    return CH.eig(p, np.array(row["candidates"], float), index)


def chem_row(seed: int, source: str, depth: int) -> dict | None:
    lab = CH.ChemLab()
    lab.reset(seed, SALT)
    rng = np.random.default_rng([seed, 0xC4E0, SOURCES.index(source)])
    xs, ys, history = [], [], []
    for i in range(depth):
        # the policy acts on the posterior of the data as printed (yields to 6 significant digits)
        x = _chem_round(CH.eig_action(CH.posterior(xs, ys), i)) if source == "reference" \
            else _chem_random(rng, 1)[0]
        y = float(_g(lab.step(x)["result"]["yield"]))
        xs.append(x)
        ys.append(y)
        history.append((fmt_design(x), f"Result: {_g(y)}. Experiments remaining: {lab.remaining}."))
    p = CH.posterior(xs, ys)
    pool = _chem_random(rng, POOL)
    best = pool[int(np.argmax(CH.eig(p, pool, depth)))]
    cands = np.vstack([_chem_random(rng, N_CANDIDATES - 1), best[None]])[rng.permutation(N_CANDIDATES)]
    if CH.eig(p, cands, depth).max() < MIN_EIG:
        return None
    return _row("chem", _hash(CH.rules()), "gaussian", seed, source, chem_system(), history,
                [fmt_design(c) for c in cands], CH.eig(p, cands, depth))


# ---- diagnostic lab ---------------------------------------------------------------------

def _cond(when: dict) -> str:
    parts = []
    for k, v in when.items():
        vals = v if isinstance(v, (list, tuple)) else [v]
        key = "the cause" if k == "cause" else k
        parts.append(f"{key} is {vals[0]}" if len(vals) == 1 else f"{key} is one of {', '.join(vals)}")
    return " and ".join(parts)


def _plist(p) -> str:
    return "[" + ", ".join(_g(v) for v in p) + "]"


def diag_system(table, spec: dict) -> str:
    """The table in plain language, rendered from its YAML structure (all numbers included)."""
    T = table.T
    describe = (
        f"{' '.join(table.description.split())} Each test has a cost and a noisy result; the "
        "result of some tests also depends on hidden nuisance factors that you are not asked "
        f"about. Design an experiment by choosing [test] with test the number (1 to {T}) of a "
        "test in the list below that you have not run yet and can still afford. The outcome is "
        "the result of that test.")
    causes = "\n".join(f"- {c} (prior {_g(p)})" for c, p in zip(table.causes, table.prior))
    nl = []
    for name, f in (spec.get("nuisances") or {}).items():
        s = f"- {name}: states [{', '.join(f['states'])}] with probabilities {_plist(f['prob'])}"
        exc = [f"{_plist(p)} if the cause is {c}" for c, p in (f.get("given_cause") or {}).items()]
        exc += [f"{_plist(p)} if {par} is {st}" for par, tab in (f.get("given_nuisance") or {}).items()
                for st, p in tab.items()]
        nl.append(s + ("; instead " + "; ".join(exc) if exc else "") + ".")
    tl = []
    for k, (name, t) in enumerate(spec["tests"].items()):
        s = (f"{k + 1}. {name} (cost {_g(t['cost'])}): outcomes [{', '.join(t['outcomes'])}] with "
             f"probabilities {_plist(t['default'])}")
        rows = [f"{_plist(r['p'])} if {_cond(r['when'])}" for r in t.get("rows") or []]
        tl.append(s + ("; instead " + "; ".join(rows) if rows else "") + ".")
    card = (
        "Exact generative model: one cause is drawn from the priors below, then each nuisance "
        "factor, then each test result independently given the cause and the nuisance factors. "
        "Where several 'instead' rules of a test apply, the last one listed applies.\n"
        f"Causes:\n{causes}\nNuisance factors (hidden, not asked for):\n" + "\n".join(nl) +
        "\nTests:\n" + "\n".join(tl))
    return _system(
        describe, card,
        f"You may spend at most {_g(table.budget)} cost units on tests, each test at most once.",
        "you will then be asked for the probability of each cause. Your answer is scored by the "
        "log of the probability it assigns to the true cause, so be calibrated: confident where "
        "the evidence supports it, uncertain where it does not.",
        [1], "a JSON list of probabilities, one per cause in the order listed")


class DiagPlanner:
    """Exact dynamic programming over (set of tests, outcomes), keeping the value tables that
    bayesenv.diag.exact_dp discards. U[S][o] = P(o) * (optimal expected final reward from the
    state where the tests S gave outcomes o), within the table's budget."""

    def __init__(self, table):
        from . import diag as D
        self.D, self.table = D, table
        self.stop = D._sweep(table, table.budget, lambda s, w: D._terminal(table, w)[0])
        self.U = {}
        for s in sorted(self.stop, key=len, reverse=True):
            best = self.stop[s].copy()
            for _, s2, axis in D._extensions(table, s, table.budget):
                best = np.maximum(best, self.U[s2].sum(axis=axis))
            self.U[s] = best

    @property
    def value(self) -> float:
        return float(self.U[()])

    def q_values(self, obs) -> tuple[dict[int, float], float]:
        """({test: expected final reward of running it now, then acting optimally}, value of
        stopping now) for the state reached by `obs` = ((test, outcome), ...) in any order."""
        so = sorted(obs)
        s, o = tuple(t for t, _ in so), tuple(k for _, k in so)
        p = float(self.D.joint_weights(self.table, obs).sum())
        q = {t: float(self.U[s2].sum(axis=axis)[o]) / p
             for t, s2, axis in self.D._extensions(self.table, s, self.table.budget)}
        return q, float(self.stop[s][o]) / p

    def policy(self, table, w, obs, remaining):
        q, stop = self.q_values(obs)
        if not q:
            return None
        t = max(q, key=lambda k: (q[k], -k))
        return t if q[t] > stop + self.D.TOL else None


def diag_obs(table, row: dict) -> tuple:
    designs, results = parse_history(row)
    return tuple((int(d[0]) - 1, table.outcomes[int(d[0]) - 1].index(r)) for d, r in zip(designs, results))


def diag_labels(table, planner: DiagPlanner, row: dict) -> dict:
    """eig, value, greedy_choice and dp_choice of a row, recomputed from its prompt."""
    from . import diag as D
    obs = diag_obs(table, row)
    w = D.joint_weights(table, obs)
    tests = [int(c[0]) - 1 for c in row["candidates"]]
    q, _ = planner.q_values(obs)
    eig = np.array([D.info_gain(table, w, t) for t in tests])
    value = np.array([q[t] for t in tests])
    greedy = int(np.argmax(eig))
    # ties in value (e.g. two orders of the same tests) are resolved in favour of the greedy
    # choice, so greedy_choice != dp_choice always means a real loss in expected final reward
    dp = greedy if value[greedy] >= value.max() - VALUE_TIE else int(np.argmax(value))
    return {"eig": eig, "value": value, "greedy_choice": greedy, "dp_choice": dp}


def diag_row(table, spec: dict, planner: DiagPlanner, seed: int, source: str, depth: int) -> dict | None:
    """None if this seed's trajectory has no state at `depth` with six affordable tests."""
    from . import diag as D
    lab = D.DiagLab(table)
    lab.reset(seed, SALT)
    rng = np.random.default_rng([seed, 0xD1A0, SOURCES.index(source)])
    policy = planner.policy if source == "reference" else D.make_random_policy(rng)
    history = []
    for _ in range(depth):
        t = policy(table, lab.joints[-1], lab.obs, lab.remaining)
        if t is None:
            return None
        rec = lab.step(t)["result"]
        history.append(([t + 1], f"Result: {rec['outcome']}. Budget remaining: {_g(lab.remaining)}."))
    aff = D.affordable(table, lab.obs, lab.remaining)
    if len(aff) < N_CANDIDATES:
        return None
    w = D.joint_weights(table, lab.obs)
    gain = {t: D.info_gain(table, w, t) for t in aff}
    q, _ = planner.q_values(lab.obs)
    if max(gain.values()) < MIN_EIG:
        return None
    # the information-gain-best affordable test (as the toy rows include the EIG-best of their
    # pool) and the planning-best one, then random other affordable tests
    keep = list(dict.fromkeys([max(aff, key=lambda t: (gain[t], -t)), max(aff, key=lambda t: (q[t], -t))]))
    rest = [t for t in aff if t not in keep]
    keep += [int(t) for t in rng.choice(rest, N_CANDIDATES - len(keep), replace=False)]
    tests = [keep[i] for i in rng.permutation(N_CANDIDATES)]
    row = _row("diag", _hash(D.rules(table)), "categorical", seed, source, diag_system(table, spec),
               history, [[t + 1] for t in tests], [gain[t] for t in tests])
    lab_ = diag_labels(table, planner, row)
    row.update(value=[round(float(v), 5) + 0.0 for v in lab_["value"]],
               greedy_choice=lab_["greedy_choice"], dp_choice=lab_["dp_choice"])
    return row


# ---- DAG lab ----------------------------------------------------------------------------

def dag_design(do: dict) -> list:
    return [-1, 0] if not do else [int(k) for k in next(iter(do.items()))]


def dag_do(design) -> dict:
    return {} if int(design[0]) < 0 else {int(design[0]): int(design[1])}


def dag_system(cfg) -> str:
    from . import dagnet as DN
    n, G = cfg.n, DN.structures(cfg.n, cfg.max_indegree).G
    names = ", ".join(f"X{i}" for i in range(n))
    describe = (
        f"A hidden causal Bayesian network connects {n} binary variables {names}. Each experiment "
        f"returns {cfg.batch} independent joint samples of all variables, either observational or "
        "under one intervention that sets one variable to a fixed value whatever its parents "
        f"are. Design an experiment by choosing [variable, value] with variable in 0..{n - 1} and "
        "value 0 or 1 to set that variable to that value, or [-1, 0] to observe without "
        f"intervening. The outcome is the list of {cfg.batch} samples, each giving the values of "
        f"[{names}]. At the end, predict the probability that a variable is 1 under new "
        "interventions on one or two variables.")
    limit = "" if cfg.max_indegree >= n - 1 else f" in which every node has at most {cfg.max_indegree} parents"
    card = (
        f"Exact generative model: the graph is drawn uniformly from all {G} directed acyclic "
        f"graphs on the {n} labelled nodes{limit} (the labels carry no order). For every variable "
        "and every configuration of its parents, the probability that the variable is 1 is drawn "
        f"independently from Beta({_g(cfg.alpha)}, {_g(cfg.alpha)}). A sample draws every variable "
        "given the values of its parents. Under an intervention the chosen variable is set to the "
        "chosen value regardless of its parents and every other variable is drawn from its own "
        "unchanged table given its parents. All samples are independent given the graph and the "
        "tables.")
    return _system(
        describe, card, f"You may run at most {cfg.budget} experiments.",
        "you will then be asked to predict the effect of interventions you may not have tried, "
        "including interventions on two variables at once. Your predictions are scored by how much "
        "probability they assign to what the system actually does, so be calibrated: confident "
        "where the evidence supports it, uncertain where it does not.",
        [2, 1], "a JSON list of probabilities that the target variable is 1, one per query")


def dag_belief(cfg, row: dict):
    from . import dagnet as DN
    belief = DN.Belief(cfg)
    designs, results = parse_history(row)
    for d, r in zip(designs, results):
        belief.add(dag_do(d), json.loads(r))
    return belief


def dag_labels(cfg, row: dict) -> np.ndarray:
    from . import dagnet as DN
    menu = DN.action_menu(cfg)
    eig = dag_belief(cfg, row).eig("joint")
    return np.array([eig[menu.index(dag_do(c))] for c in row["candidates"]])


def dag_row(cfg, seed: int, source: str, depth: int) -> dict | None:
    from . import dagnet as DN
    lab = DN.DagLab(cfg, track=False)
    lab.reset(seed, SALT)
    rng = np.random.default_rng([seed, 0xDA60, SOURCES.index(source)])
    menu = DN.action_menu(cfg)
    history = []
    for k in range(depth):
        do = DN.choose_action(lab.belief, source, k, rng)
        rec = lab.step(do)["result"]
        history.append((dag_design(do), f"Result: {json.dumps(rec['samples'])}. "
                                        f"Experiments remaining: {lab.remaining}."))
    eig = lab.belief.eig("joint")
    if eig.max() < MIN_EIG:
        return None
    best = int(np.argmax(eig))
    rest = [a for a in range(len(menu)) if a != best]
    keep = [best] + [int(a) for a in rng.choice(rest, N_CANDIDATES - 1, replace=False)]
    acts = [keep[i] for i in rng.permutation(N_CANDIDATES)]
    return _row("dag", _hash(DN.rules(cfg)), "categorical", seed, source, dag_system(cfg), history,
                [dag_design(menu[a]) for a in acts], eig[acts])


# ---- wet lab (approximate labels) -------------------------------------------------------

def wet_design(a: dict) -> list:
    return fmt_design([a["substrate"], a["catalyst"], a["product_spike"],
                       float(f"{a['temperature']:.4g}"), *a["sample_times"]])


def wet_action(design) -> dict:
    from . import wetlab as W
    return W.validate({"substrate": design[0], "catalyst": design[1], "product_spike": design[2],
                       "temperature": design[3], "sample_times": list(design[4:])})


def _wet_stock(stock: dict) -> str:
    return ", ".join(f"{k.replace('_', ' ')} {v}" for k, v in stock.items())


def wet_system() -> str:
    from . import wetlab as W
    b = W.BOUNDS
    describe = (
        "You run catalysed reactions in single-use microreactor vessels holding a few hundred "
        "molecules. Exactly one of the mechanisms listed below is true; its rate constants are "
        "unknown and stay the same in every run. Each run starts a fresh vessel with substrate, "
        "catalyst and an optional product spike (whole numbers of molecules) at a temperature "
        "(in K) and reads the product count at three sampling times (in min). Design an "
        "experiment by choosing [substrate, catalyst, product_spike, temperature, t1, t2, t3] "
        f"with {b['substrate'][0]} <= substrate <= {b['substrate'][1]}, "
        f"{b['catalyst'][0]} <= catalyst <= {b['catalyst'][1]}, "
        f"{b['product_spike'][0]} <= product_spike <= {b['product_spike'][1]}, "
        f"{_g(b['temperature'][0])} <= temperature <= {_g(b['temperature'][1])} K and "
        f"{_g(b['sample_time'][0])} <= t1 < t2 < t3 <= {_g(b['sample_time'][1])} min. The outcome "
        "is the list of the three product readings, with additive measurement noise. At the end, "
        "report the probability of each mechanism.")
    ea = {n: e for n, _, _, e in W.REACTIONS}
    ml = []
    for k, (name, desc, params, rx) in enumerate(W.MECHANISMS):
        pr = "; ".join(f"{p} ~ LogUniform({_g(lo)}, {_g(hi)})" for p, lo, hi in params)
        act = ", ".join(f"{_g(ea[r] / 1000)}" for r in rx)
        ml.append(f"{k + 1}. {name} (prior {_g(W.PRIOR[k])}): {desc} {pr}. Activation energies "
                  f"of its reactions, in order: {act} kJ/mol.")
    card = (
        "Exact generative model: one mechanism is drawn from the priors below and its rate "
        f"constants from the listed log-uniform priors (which hold at {_g(W.T0)} K). Each vessel "
        "is an independent continuous-time Markov jump process (stochastic mass-action kinetics): "
        "a reaction with rate constant k and reactants A (+ B) fires at rate k * #A (* #B). Start: "
        "S = substrate, C = catalyst, P = product_spike, all other species 0. At temperature T "
        f"every rate constant is multiplied by exp(Ea / {_g(W.R)} * (1 / {_g(W.T0)} - 1 / T)) with the "
        "activation energy Ea of its reaction in J/mol. outcome at each sampling time = number of "
        f"P molecules at that time + Normal(0, sd {_g(W.SIGMA)}) noise; the three readings of a run "
        "come from the same trajectory. Units: k1 and ka per molecule per min; k2, kd and kcat per "
        "min; Kr is a ratio.\n"
        "Mechanisms:\n" + "\n".join(ml))
    return _system(
        describe, card,
        "You may run experiments until the stock runs out: a run uses its substrate, catalyst and "
        "product spike (from the product standard), one assay kit per reading and one vessel. "
        f"Starting stock: {_wet_stock(W.STOCK)}.",
        "you will then be asked for the probability of each mechanism. Your answer is scored by "
        "the log of the probability it assigns to the true mechanism, so be calibrated: confident "
        "where the evidence supports it, uncertain where it does not.",
        [150, 6, 0, 300, 4, 12, 35], "a JSON list of probabilities, one per mechanism in the order listed")


def wet_estimate(belief, cands: list[dict]) -> np.ndarray:
    from . import wetlab as W
    return np.mean([W.eig(belief, cands, WET_NSIM) for _ in range(WET_REPS)], axis=0)


def _wet_state(seed: int, source: str, depth: int):
    """(lab after `depth` runs, history, six candidate actions) or None if the stock cannot
    pay for six distinct candidates at that depth."""
    from . import wetlab as W
    lab = W.WetLab(track_reference=True)
    lab.reset(seed, SALT)
    rng = np.random.default_rng([seed, 0xD4E0, SOURCES.index(source)])
    history = []
    for _ in range(depth):
        a = W.reference_action(lab.belief, lab.stock, rng) if source == "reference" \
            else W.random_action(lab.stock, rng)
        if a is None:
            return None
        a = wet_action(wet_design(a))                 # run exactly what the prompt prints
        rec = lab.step(a)["result"]
        shown = "[" + ", ".join(_g(y) for y in rec["readings"]) + "]"
        history.append((wet_design(a), f"Result: {shown}. Stock remaining: {_wet_stock(lab.stock)}."))
    pool = W._fair(W.GRID, lab.stock)
    cands = [W.random_action(lab.stock, rng) for _ in range(N_CANDIDATES - 1)]
    if not pool or any(c is None for c in cands):
        return None
    if len(pool) > WET_POOL:
        pool = [pool[i] for i in rng.choice(len(pool), WET_POOL, replace=False)]
    cands.append(pool[int(np.argmax(W.eig(lab.belief, pool, WET_NSIM)))])
    cands = [wet_action(wet_design(c)) for c in cands]
    if len({json.dumps(wet_design(c)) for c in cands}) < N_CANDIDATES:
        return None
    return lab, history, [cands[i] for i in rng.permutation(N_CANDIDATES)]


def wet_row(seed: int, source: str, depth: int) -> dict | None:
    from . import wetlab as W
    state = _wet_state(seed, source, depth)
    if state is None:
        return None
    lab, history, cands = state
    eig = wet_estimate(lab.belief, cands)
    if eig.max() < WET_MIN_EIG:
        return None
    return _row("wetlab", _hash(W.rules()), "gaussian", seed, source, wet_system(), history,
                [wet_design(c) for c in cands], eig)


def wet_stability(seed: int, source: str, depth: int, reps: int = 4) -> dict | None:
    """How much the wet-lab labels move when re-estimated: `same` = again on the same particle
    belief, `indep` = on a fresh particle belief (other prior draws) updated with the same runs."""
    from . import wetlab as W
    state = _wet_state(seed, source, depth)
    if state is None:
        return None
    lab, _, cands = state
    same = np.array([wet_estimate(lab.belief, cands) for _ in range(reps)])
    if same[0].max() < WET_MIN_EIG:                   # the generator skips this state too
        return None
    indep = []
    for r in range(reps):
        b = W.Belief(np.random.default_rng([seed, 0x57AB, r]))
        for a, y in zip(lab.actions, lab.readings):
            b.update(a, y)
        indep.append(wet_estimate(b, cands))
    out = {"seed": seed, "source": source, "depth": depth}
    for tag, est in (("same", same), ("indep", np.array(indep))):
        top = est.argmax(1)
        rew = np.maximum(est, 0) / np.maximum(est.max(1, keepdims=True), 1e-12)
        mean = est.mean(0)
        out[tag] = {"top1_agree": float(np.mean(top == np.bincount(top).argmax())),
                    "reward_sd_mean": float(rew.std(0).mean()),
                    "top1_regret": float(np.mean(1 - (mean / max(mean.max(), 1e-12))[top]))}
    return out


# ---- generation and summaries -----------------------------------------------------------

DEPTHS = {"chem": list(range(CH.BUDGET)), "diag": [0, 1, 2, 3, 4], "dag": [0, 1, 2, 3, 4, 5],
          "wetlab": [0, 1, 2, 3]}


_CTX: dict = {}


def context(lab: str):
    """Per-lab objects that are expensive to build (the diagnostic table's exact DP)."""
    if lab not in _CTX:
        if lab == "diag":
            from . import diag as D
            spec = D.load_spec("low_yield")
            table = D.table_from_spec(spec)
            _CTX[lab] = (table, spec, DiagPlanner(table))
        elif lab == "dag":
            from . import dagnet as DN
            _CTX[lab] = (DN.DEFAULT,)
        else:
            _CTX[lab] = ()
    return _CTX[lab]


def cells(lab: str) -> list[tuple[str, str, int]]:
    return [(lab, source, depth) for source in SOURCES for depth in DEPTHS[lab]]


# A cell is generated in PARTS[lab] independent parts (own seed ranges), so that the slow wet
# lab can be spread over workers without changing which rows come out.
PARTS = {"wetlab": 5}


def cell_jobs(lab: str, per_cell: int) -> list[tuple[str, str, int, int, int]]:
    """(lab, source, depth, rows, part) for every part of every cell of a lab."""
    parts = PARTS.get(lab, 1)
    sizes = [per_cell // parts + (k < per_cell % parts) for k in range(parts)]
    return [(*cell, n, k) for cell in cells(lab) for k, n in enumerate(sizes) if n]


def generate_part(lab: str, source: str, depth: int, n: int, part: int = 0) -> list[dict]:
    """n rows of one part of a (lab, source, depth) cell, one fresh seed per row. Seeds are a
    fixed function of (cell, part), so the output does not depend on who runs which part."""
    ctx = context(lab)
    seed = SEED_BASE[lab] + 10_000 * (20 * SOURCES.index(source) + depth) + 1_000 * part
    make = {"chem": chem_row, "diag": diag_row, "dag": dag_row, "wetlab": wet_row}[lab]
    rows = []
    while len(rows) < n:
        seed += 1
        row = make(*ctx, seed, source, depth)
        if row is not None:        # None: no six affordable candidates, or nothing left to learn
            rows.append(row)
    return rows


def generate_cell(lab: str, source: str, depth: int, per_cell: int) -> list[dict]:
    return [r for job in cell_jobs(lab, per_cell) if job[1:3] == (source, depth)
            for r in generate_part(*job)]


def generate(lab: str, per_cell: int) -> list[dict]:
    return [r for cell in cells(lab) for r in generate_cell(*cell, per_cell)]


def chance(row: dict) -> float:
    """Expected design_reward of a uniformly random candidate."""
    e = np.maximum(np.asarray(row["eig"], float), 0.0)
    return float(e.mean() / max(e.max(), 1e-12))


def summarize(rows: list[dict]) -> dict:
    out = {}
    for spec in sorted({r["spec"] for r in rows}):
        rs = [r for r in rows if r["spec"] == spec]
        ch = np.array([chance(r) for r in rs])
        depths = sorted({r["depth"] for r in rs})
        s = {"rows": len(rs), "chance": round(float(ch.mean()), 4),
             "near_flat_fraction": round(float((ch > 0.9).mean()), 4),
             "by_source": {k: sum(r["source"] == k for r in rs) for k in SOURCES},
             "by_depth": {str(d): {"rows": sum(r["depth"] == d for r in rs),
                                   "chance": round(float(np.mean([chance(r) for r in rs if r["depth"] == d])), 4)}
                          for d in depths}}
        if "value" in rs[0]:
            dis = [r for r in rs if r["greedy_choice"] != r["dp_choice"]]
            loss = [max(r["value"]) - r["value"][r["greedy_choice"]] for r in dis]
            s["greedy_dp_disagree"] = len(dis)
            s["greedy_dp_disagree_by_depth"] = {str(d): sum(r["depth"] == d for r in dis) for d in depths}
            s["mean_value_loss_of_greedy_when_disagree_nats"] = round(float(np.mean(loss)), 4) if loss else 0.0
            # value-based analogue of design_reward for a uniformly random candidate: the share of
            # the best candidate's advantage over the worst one that a random pick gets
            v = np.array([r["value"] for r in rs])
            span = v.max(1) - v.min(1)
            s["value_chance_minmax"] = round(float(np.mean((v.mean(1) - v.min(1))[span > 0] / span[span > 0])), 4)
        out[spec] = s
    return out


def per_cell(lab: str, rows: int) -> int:
    return -(-rows // len(cells(lab)))


def pick_sample(rows: list[dict], total: int = 12) -> list[dict]:
    """A small documentation sample: per lab the empty history, a mid-depth reference state, a
    random-policy state and one more (for the diagnostic lab: greedy and planning disagree)."""
    out = []
    per_lab = total // len({r["spec"] for r in rows})
    for spec in sorted({r["spec"] for r in rows}, key=SPECS.index):
        rs = sorted((r for r in rows if r["spec"] == spec), key=lambda r: r["seed"])
        mid = sorted({r["depth"] for r in rs})[len({r["depth"] for r in rs}) // 2]
        wants = [lambda r: r["depth"] == 0,
                 lambda r: r["source"] == "reference" and r["depth"] == mid,
                 (lambda r: r["depth"] > 0 and r["greedy_choice"] != r["dp_choice"]) if "value" in rs[0]
                 else (lambda r: r["source"] == "random" and r["depth"] == max(x["depth"] for x in rs)),
                 lambda r: r["source"] == "random" and r["depth"] == mid - 1]
        for want in wants[:per_lab]:
            hit = next((r for r in rs if want(r) and r not in out), None)
            if hit is not None:
                out.append(hit)
    return out


def write_output(rows: list[dict], out_dir, meta: dict, sample_out=None) -> dict:
    """rows.jsonl + meta.json in out_dir (and the committed sample, if asked). Validates rows."""
    from pathlib import Path

    from .datagen import validate_row
    rows = sorted(rows, key=lambda r: (r["spec"], r["source"], r["depth"], r["seed"]))
    for r in rows:
        validate_row(r)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    with (out / "rows.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    meta = {**meta, "split": SPLIT, "salt": SALT, "rows": len(rows),
            "spec_hashes": {s: next(r["spec_hash"] for r in rows if r["spec"] == s)
                            for s in sorted({r["spec"] for r in rows})},
            "labs": summarize(rows)}
    (out / "meta.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    if sample_out:
        with Path(sample_out).open("w", encoding="utf-8", newline="\n") as f:
            for r in pick_sample(rows):
                f.write(json.dumps(r) + "\n")
    return meta
