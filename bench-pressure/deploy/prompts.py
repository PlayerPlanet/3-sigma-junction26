"""State validation and prompt rendering for the Bench Pressure lab partners.

`describe()` and SYSTEM are a line-by-line port of gemini/gemini.js (the offline harness whose
runs are embedded in the page), so the live Gemini / Nemotron partner sees the same text as the
recorded games. `gemma_messages()` renders a game ticket in the format of the design rows Gemma
was GRPO-trained on (data/v1/rows.jsonl, kind == "design").
"""

from __future__ import annotations

import json
import math
import re
from decimal import ROUND_HALF_UP, Decimal

SYSTEM = """You are the lab lead in "Bench Pressure", a Bayesian lab game. You decide the science; a technician carries it out.

How the lab works:
- Each open grant ticket asks which hypothesis is true. The truth was drawn at random from the ticket's prior. You see the current posterior, updated by exact Bayes' rule after every plate read.
- "run": the technician prepares one experiment for one ticket (about 4-5 s of bench work), incubates it 6 s, then reads it. Each experiment gives a noisy yes/no result with the probabilities stated in its menu entry. There are 3 incubators, so up to 3 plates can grow at once, but the technician is one person and every plate costs bench time. Results of plates still growing are not in the posterior yet.
- "publish": the technician writes a paper claiming the hypothesis with the HIGHEST posterior at the moment of writing and submits it (about 5 s). The ticket closes; plates still growing for it are wasted.
- "wait": do nothing now; you will be asked again when something changes.

Scoring:
- Correct paper: +100 + round(60 x time_left / time_max) + max(0, 60 - 10 x plates_read_for_that_ticket).
- Wrong paper: -60 (retraction).
- A ticket that reaches 0 s left expires: -30.
- The round lasts 180 s. New tickets arrive every 22-30 s while fewer than 4 are open and more than 25 s remain.
- Game time is frozen while you think.

Answer with JSON only: {"action": "run"|"publish"|"wait", "ticket": <ticket id>, "experiment": <E number, for run>, "why": "<one short sentence, at most 25 words, explaining the choice in terms of the evidence>"}."""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "action": {"type": "STRING", "enum": ["run", "publish", "wait"]},
        "ticket": {"type": "INTEGER"},
        "experiment": {"type": "INTEGER"},
        "why": {"type": "STRING"},
    },
    "required": ["action", "why"],
    "propertyOrdering": ["action", "ticket", "experiment", "why"],
}


class BadState(ValueError):
    pass


# ---------------------------------------------------------------- validation
_LABEL = re.compile(r"^[A-Za-z0-9.+\- ]{1,12}$")


def _num(x, lo=-1e9, hi=1e9) -> float:
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or not lo <= x <= hi:
        raise BadState("bad number")
    return float(x)


def _int(x, lo, hi) -> int:
    if isinstance(x, bool) or not isinstance(x, (int, float)) or int(x) != x or not lo <= x <= hi:
        raise BadState("bad integer")
    return int(x)


def _probs(xs, n) -> list[float]:
    if not isinstance(xs, list) or len(xs) != n:
        raise BadState("bad distribution")
    return [_num(v, 0.0, 1.0) for v in xs]


def clean_state(s) -> dict:
    """Validate the compact game state the page sends and return a normalised copy. Only
    numbers, short labels and small lists are accepted, so the prompt cannot carry free text."""
    if not isinstance(s, dict):
        raise BadState("state must be an object")
    out = {
        "t": _num(s.get("t", 0), 0, 1000),
        "roundLeft": _num(s.get("roundLeft"), -10, 1000),
        "score": _int(s.get("score", 0), -100000, 100000),
        "canRun": bool(s.get("canRun")),
        "rack": _int(s.get("rack", 0), 0, 100),
        "freeInc": _int(s.get("freeInc", 0), 0, 3),
    }
    tks = s.get("tickets")
    if not isinstance(tks, list) or not 1 <= len(tks) <= 4:
        raise BadState("1-4 tickets")
    out["tickets"] = []
    for t in tks:
        if not isinstance(t, dict) or t.get("type") not in ("gene", "dose"):
            raise BadState("bad ticket")
        labels = t.get("labels")
        if not isinstance(labels, list) or not 2 <= len(labels) <= 8 or not all(isinstance(l, str) and _LABEL.match(l) for l in labels):
            raise BadState("bad labels")
        K = len(labels)
        exps = t.get("exps")
        if not isinstance(exps, list) or not 1 <= len(exps) <= 14:
            raise BadState("bad experiments")
        ce = []
        for e in exps:
            if not isinstance(e, dict):
                raise BadState("bad experiment")
            x = {"lik": _probs(e.get("lik"), K)}
            if t["type"] == "gene":
                pool = e.get("pool")
                if not isinstance(pool, list) or not 1 <= len(pool) < K:
                    raise BadState("bad pool")
                x["pool"] = [_int(i, 0, K - 1) for i in pool]
            else:
                x["dose"] = _int(e.get("dose"), 0, K - 1)
            ce.append(x)
        hist = t.get("history", [])
        pend = t.get("pending", [])
        if not isinstance(hist, list) or len(hist) > 60 or not isinstance(pend, list) or len(pend) > 3:
            raise BadState("bad history")
        out["tickets"].append({
            "id": _int(t.get("id"), 1, 10000), "type": t["type"], "labels": labels,
            "prior": _probs(t.get("prior", t.get("post")), K), "post": _probs(t.get("post"), K),
            "timeLeft": _num(t.get("timeLeft"), -10, 1000), "timeMax": _int(t.get("timeMax"), 1, 1000),
            "nExp": _int(t.get("nExp", 0), 0, 1000), "exps": ce,
            "history": [{"e": _int(h.get("e"), 0, len(ce) - 1), "y": bool(h.get("y"))} for h in hist if isinstance(h, dict)],
            "pending": [{"e": _int(p.get("e"), 0, len(ce) - 1), "ready": _num(p.get("ready", 0), 0, 100)} for p in pend if isinstance(p, dict)],
        })
    return out


# ------------------------------------------------- Gemini / Nemotron prompt
def f3(x: float) -> str:
    """JavaScript Number.prototype.toFixed(3) for the non-negative values used here."""
    return str(Decimal(x).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))


def ceil(x: float) -> int:
    return math.ceil(x)


def exp_line(t: dict, e: dict, i: int) -> str:
    if t["type"] == "gene":
        st = "{" + ", ".join(t["labels"][j] for j in e["pool"]) + "}"
        other = next(v for h, v in enumerate(e["lik"]) if h not in e["pool"])
        return f"E{i}: knock out {st}: P(phenotype lost) = {f3(e['lik'][e['pool'][0]])} if the culprit is in {st}, else {f3(other)}"
    lab = t["labels"][e["dose"]]
    return (f"E{i}: treat at {lab} µM: P(response) = {f3(e['lik'][0])} if the threshold is <= {lab} µM, "
            f"else {f3(t['exps'][0]['lik'][len(t['labels']) - 1])}")


def argmax(xs: list[float]) -> int:
    m = 0
    for i, p in enumerate(xs):
        if p > xs[m]:
            m = i
    return m


def describe(s: dict) -> str:
    L = [f"Round time left: {ceil(s['roundLeft'])} s. Score so far: {s['score']}."]
    L.append(f"Lab: {s['freeInc']} of 3 incubators free, {s['rack']} clean plates. You can run an experiment now."
             if s["canRun"] else
             "Lab: no incubator or clean plate free right now, so you cannot run an experiment; you may publish or wait.")
    for t in s["tickets"]:
        L.append("")
        unit = " µM" if t["type"] == "dose" else ""
        gene = t["type"] == "gene"
        L.append(f"Ticket {t['id']}: Culprit gene. Exactly one of these genes causes the phenotype." if gene else
                 f"Ticket {t['id']}: Dose threshold. Hypothesis \"X µM\" means X is the lowest dose that triggers a response (doses at or above X respond).")
        L.append(f"  Time left {ceil(t['timeLeft'])} s of {t['timeMax']}. Plates read so far: {t['nExp']}.")
        L.append("  Posterior: " + " | ".join(f"{l}{unit} {f3(p)}" for l, p in zip(t["labels"], t["post"])))
        if t["history"]:
            pos, neg = ("phenotype lost", "phenotype intact") if gene else ("response", "no response")
            L.append("  Results: " + "; ".join(f"E{h['e']} -> {pos if h['y'] else neg}" for h in t["history"]))
        if t["pending"]:
            L.append("  Growing now: " + ", ".join(f"E{p['e']} (result in {ceil(p['ready'])} s)" for p in t["pending"]))
        m = argmax(t["post"])
        L.append(f"  If published now, the paper claims {t['labels'][m]}{unit} (posterior {f3(t['post'][m])}).")
        L.append("  Experiment menu:")
        for i, e in enumerate(t["exps"]):
            L.append("    " + exp_line(t, e, i))
    L += ["", "Choose one action."]
    return "\n".join(L)


def coerce(d):
    """Accept "3", "E3", 3.0 for integer fields (chat models without a response schema)."""
    if not isinstance(d, dict):
        return d
    d = dict(d)
    if isinstance(d.get("action"), str):
        d["action"] = d["action"].strip().lower()
    for k in ("ticket", "experiment"):
        v = d.get(k)
        if isinstance(v, str):
            m = re.fullmatch(r"\s*[A-Za-z#]*\s*(\d+)\s*", v)
            if m:
                d[k] = int(m.group(1))
        elif isinstance(v, float) and v == int(v):
            d[k] = int(v)
    return d


def valid_decision(s: dict, d) -> bool:
    if not isinstance(d, dict):
        return False
    a = d.get("action")
    if a == "wait":
        return True
    t = next((t for t in s["tickets"] if t["id"] == d.get("ticket") and not isinstance(d.get("ticket"), bool)), None)
    if a == "publish":
        return t is not None
    ex = d.get("experiment")
    return (a == "run" and t is not None and s["canRun"] and isinstance(ex, int) and not isinstance(ex, bool)
            and 0 <= ex < len(t["exps"]))


def tidy(d: dict) -> dict:
    out = {"action": d["action"], "why": re.sub(r"\s+", " ", str(d.get("why", ""))).strip()[:220]}
    if d["action"] != "wait":
        out["ticket"] = d["ticket"]
    if d["action"] == "run":
        out["experiment"] = d["experiment"]
    return out


def parse_json_object(text: str):
    """First JSON object in a chat reply (tolerates code fences / leading prose)."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S)
    dec = json.JSONDecoder()
    for m in re.finditer(r"\{", text):
        try:
            obj, _ = dec.raw_decode(text[m.start():])
            if isinstance(obj, dict):
                return obj
        except ValueError:
            continue
    return None


# ------------------------------------------------------------------ Bayes
def _h2(p: float) -> float:
    return 0.0 if p <= 0 or p >= 1 else -(p * math.log(p) + (1 - p) * math.log(1 - p)) / math.log(2)


def eig(post: list[float], lik: list[float]) -> float:
    pr = sum(p * l for p, l in zip(post, lik))
    return max(0.0, _h2(pr) - sum(p * _h2(l) for p, l in zip(post, lik)))


# ------------------------------------------------- Gemma (training format)
MAX_EXPS = 10  # the training rows' "You may run at most 10 experiments"


def _g(x: float) -> str:
    return f"{x:.4g}"


def design_of(t: dict, e: dict) -> list:
    """The numeric design vector of one game experiment: [dose in µM] or [gene numbers, 1-based]."""
    if t["type"] == "dose":
        v = float(t["labels"][e["dose"]])
        return [int(v) if v == int(v) else v]
    return [i + 1 for i in e["pool"]]


def gemma_messages(t: dict) -> tuple[list[dict], list[list]]:
    """One ticket as a design-row conversation: system task description with the exact generative
    model, past plates as <observe>/Result turns, and the experiment menu as numbered candidates."""
    K = len(t["labels"])
    cands = [design_of(t, e) for e in t["exps"]]
    if t["type"] == "gene":
        e0 = next(e for e in t["exps"])
        hit = e0["lik"][e0["pool"][0]]
        miss = next(v for h, v in enumerate(e0["lik"]) if h not in e0["pool"])
        names = ", ".join(f"{i + 1} = {n}" for i, n in enumerate(t["labels"]))
        prior = ", ".join(f"{i + 1}: {_g(p)}" for i, p in enumerate(t["prior"]))
        desc = (f"A genetic screen looks for the gene that causes a phenotype. Exactly one of {K} genes, numbered 1 to {K} "
                f"({names}), is the culprit; which one is unknown. Each experiment knocks out a set of genes in fresh cells and "
                f"checks whether the phenotype is lost. Design an experiment by choosing [genes], the list of gene numbers to "
                f"knock out. The outcome is 1 if the phenotype is lost, else 0. Predict, for new designs, the probability that "
                f"the outcome is 1.\n\nExact generative model: culprit ~ Categorical over genes 1..{K} with probabilities "
                f"({prior}). P(outcome = 1 | [genes]) = {_g(hit)} if the culprit is in genes, else {_g(miss)}.")
        example = "[1, 3]"
    else:
        doses = ", ".join(t["labels"])
        hi = t["exps"][0]["lik"][0]
        lo = t["exps"][0]["lik"][K - 1]
        prior = ", ".join(f"{l}: {_g(p)}" for l, p in zip(t["labels"], t["prior"]))
        desc = (f"A compound is tested on fresh cell cultures, one culture per experiment. Each culture receives a dose (in µM) "
                f"and either responds or does not. The threshold (in µM) is the lowest dose that triggers a response: doses "
                f"at or above it respond, apart from noise. Design an experiment by choosing [dose] from {doses} µM. The "
                f"outcome is 1 if the culture responds, else 0. Predict, for new designs, the probability that the outcome is 1."
                f"\n\nExact generative model: threshold ~ Categorical over ({prior}). "
                f"P(outcome = 1 | [dose]) = {_g(hi)} if dose >= threshold, else {_g(lo)}.")
        example = "[3]"
    system = ("You are a scientist running experiments on an unknown system.\n\n" + desc + "\n\n"
              f"You may run at most {MAX_EXPS} experiments. Choose each one to learn as much as possible; you will then be asked "
              "to predict outcomes for new designs you have not seen. Your predictions are scored by how much probability they "
              "assign to what the system actually does, so be calibrated: confident where the evidence supports it, uncertain "
              "where it does not.\n\n"
              f"To run an experiment, reply with your reasoning followed by exactly one tag, e.g. <observe>{example}</observe>. "
              "To stop experimenting early, reply <done/>.\n"
              "In the prediction phase you must answer with a JSON list of probabilities that the outcome is 1, one per design, "
              "and nothing after it.")
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": "Begin. Run your first experiment."}]
    for k, h in enumerate(t["history"]):
        msgs.append({"role": "assistant", "content": f"<observe>{json.dumps(cands[h['e']])}</observe>"})
        msgs.append({"role": "user", "content": f"Result: {int(h['y'])}. Experiments remaining: {max(1, MAX_EXPS - k - 1)}."})
    menu = "\n".join(f"{i + 1}: {json.dumps(c)}" for i, c in enumerate(cands))
    msgs[-1]["content"] += ("\nChoose your next experiment from these candidate designs, picking the one you expect to be most "
                            f"informative:\n{menu}\nReply with exactly one tag, <observe>[design]</observe>.")
    return msgs, cands


OBS_RE = re.compile(r"<observe>\s*(\[.*?\])\s*</observe>", re.S)


def gemma_choice(completion: str, cands: list[list]) -> int | None:
    """Same rule as bayesenv.curve.design_choice: the LAST <observe>[...]</observe> must equal a candidate."""
    m = OBS_RE.findall(re.sub(r"<think>.*?</think>", "", completion, flags=re.S))
    if not m:
        return None
    try:
        x = [float(v) for v in json.loads(m[-1])]
    except (ValueError, TypeError):
        return None
    for i, c in enumerate(cands):
        if len(c) == len(x) and all(math.isclose(a, float(b), rel_tol=1e-6, abs_tol=1e-12) for a, b in zip(x, c)):
            return i
    return None


# ------------------------------------------------- rule for Gemma's partner
PUBLISH_MAP = 0.85
EXPIRE_SOON = 15.0


def gemma_rule(s: dict) -> dict | None:
    """Publish / target-grant rule wrapped around Gemma (it was trained only to pick experiments).
    Returns a publish/wait decision, or {"action": "run", "ticket": id} with the experiment left to Gemma."""
    best = None
    for t in s["tickets"]:
        c = t["post"][argmax(t["post"])]
        if c >= PUBLISH_MAP or (t["timeLeft"] < EXPIRE_SOON and t["nExp"] > 0):
            if best is None or c > best[1]:
                best = (t, c)
    if best:
        t, c = best
        why = (f"rule: MAP {c:.2f} >= {PUBLISH_MAP}" if c >= PUBLISH_MAP
               else f"rule: {ceil(t['timeLeft'])} s left, publish MAP {c:.2f} before it expires")
        return {"action": "publish", "ticket": t["id"], "why": why}
    if not s["canRun"]:
        return {"action": "wait", "why": "rule: no free incubator or clean plate"}
    live = [t for t in s["tickets"] if t["timeLeft"] >= EXPIRE_SOON] or s["tickets"]
    t = min(live, key=lambda t: (len(t["pending"]) >= 2, t["timeLeft"]))
    return {"action": "run", "ticket": t["id"], "why": f"rule: most urgent grant ({ceil(t['timeLeft'])} s left)"}
