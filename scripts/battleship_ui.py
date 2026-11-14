"""Local web UI for Rulebound Battleship: play it, watch the reference, replay agent runs.

    python scripts/battleship_ui.py            # then open http://localhost:8050
    python scripts/battleship_ui.py --port 9000

Play: click a cell to fire, the arrows to scan a row or column; toggle the exact posterior
(the heat map and the rule bars) on and off; let the reference make moves; submit a belief and
see the hidden board, the score and its design / inference split.
Human benchmark: a person plays the benchmark boards (configs/battleship_benchmark.json) with
no posterior and no reference, then submits rule and cell probabilities; the grade is appended to
results/battleship_bench/<tag>/runs.jsonl as model "human:<name>", next to the models.
Replay: any Harbor trial of a battleship task (jobs/**/verifier/details.json) or any episode of
experiments/battleship_llm.py (results/battleship_llm/<model>/seed-<n>.json) step by step,
next to the reference on the same hidden board, or an offline demo (reference vs a
noise-ignoring coder) that needs no Harbor run.

Break it: the strategies a judge would try to game the score with (do nothing, stop early,
bet everything, act certain, ignore noise, ignore "none of the above", peek at the answer),
each scored on the same 24 hidden boards, next to honest play; a confidence slider that shows
the score peaks at honest beliefs; and a box to grade any fixed submission of your own.

    python scripts/battleship_ui.py --world open   # the open-world game (7th rule "other")

Standard library + numpy only. Single user, for local demos; it binds to 127.0.0.1.
"""

from __future__ import annotations

import argparse
import json
import math
import threading
import secrets
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import numpy as np  # noqa: E402

from bayesenv import battleship as B  # noqa: E402

STATE: dict = {"lab": None, "human": None}
BENCH_CFG = ROOT / "configs" / "battleship_benchmark.json"


def set_world(world: str) -> None:
    """Switch the whole UI to the closed (six rules) or open (six + "other") game."""
    global B, BENCH_CFG
    if world == "open":
        from bayesenv import battleship_open as BO
        B = BO
        BENCH_CFG = ROOT / "configs" / "battleship_benchmark_open.json"


# ---- break it ---------------------------------------------------------------------------
BREAK_N, BREAK_SALT = 24, "break-it"
STRATEGIES = [  # key, design, inference, label, what it tries
    ("honest", "reference", "exact", "Honest play",
     "best experiments, exact beliefs (the reference)"),
    ("do_nothing", "none", "prior", "Do nothing", "no experiments, submit the prior"),
    ("stop_early", "one", "exact", "Stop after one shot", "one experiment, then honest beliefs"),
    ("gamble", "none", "gamble", "Bet everything", "no experiments, 100% on one rule"),
    ("certain", "reference", "map", "Act certain",
     "honest experiments, then claim the single most likely board"),
    ("overconfident", "reference", "overconfident", "Overconfident",
     "honest experiments, beliefs pushed towards 0 and 1"),
    ("hedge", "reference", "hedge", "Hedge", "honest experiments, beliefs pulled towards 50/50"),
    ("ignore_noise", "reference", "noiseless", "Ignore the noise",
     "treat every report as exact (the usual coding bug)"),
    ("random", "random", "exact", "Random experiments", "random shots, exact beliefs"),
    ("closed_world", "reference", "closed_world", "Never say 'none of the above'",
     "exact beliefs over the six listed rules only"),
    ("peek", "reference", "cheat_blend", "Peek at the answer (cheat)",
     "10% of the hidden truth mixed into honest beliefs"),
    ("hidden_shots", "reference", "cheat_extra", "Five secret shots (cheat)",
     "beliefs use 5 extra shots the grader never saw"),
]
_LABS: dict = {}
_LABS_LOCK = threading.Lock()


def _lab(design: str, seed: int):
    with _LABS_LOCK:
        if (design, seed) not in _LABS:
            _LABS[(design, seed)] = B.play(design, seed, BREAK_SALT)
        return _LABS[(design, seed)]


def _grade(lab, q, occ) -> dict:
    s = B.score(q, occ, lab.hidden_rule, lab.hidden_layout)
    u = float(np.random.default_rng(B.salted_key(lab.seed, BREAK_SALT, 0xB5A3)).random())
    p = B.ppc_pvalue(q, occ, lab.belief, lab.hidden_rule, lab.hidden_layout, u)
    return {"seed": lab.seed, "score": s["score_raw"], "rule": B.NAMES[lab.hidden_rule],
            "p": p, "flagged": p < 0.05}


def _summary(rows: list[dict], key: str, label: str, what: str) -> dict:
    x = np.array([r["score"] for r in rows])
    ref = np.array([r["score"] for r in break_strategy("honest", raw=True)]) \
        if key != "honest" else x
    # Batch leak test: honest p-values are uniform, so their mean is 0.5 +- sqrt(1/12n);
    # a side channel pushes them down. One-sided z test, flagged at p < 0.01.
    pv = np.array([r["p"] for r in rows])
    z = (0.5 - pv.mean()) / math.sqrt(1 / 12 / len(pv))
    batch_p = 0.5 * math.erfc(z / math.sqrt(2))
    return {"key": key, "label": label, "what": what, "n": len(x), "mean": float(x.mean()),
            "batch_p": float(batch_p), "caught": bool(batch_p < 0.01),
            "harbor": float(np.clip(x, 0, 1).mean()), "vs_honest": float((x - ref).mean()),
            "worst": float(x.min()), "flagged": float(np.mean([r["flagged"] for r in rows])),
            "boards": rows}


def break_strategy(key: str, raw: bool = False):
    k, design, inference, label, what = next(t for t in STRATEGIES if t[0] == key)
    if inference == "closed_world" and not B.OPEN_WORLD:
        raise ValueError("this strategy needs the open world: run with --world open")
    rows = []
    for seed in range(BREAK_N):
        lab = _lab(design, seed)
        rng = np.random.default_rng(B.salted_key(seed, BREAK_SALT, 0xB5A5))
        q, occ = B.submission(lab, inference, rng)
        rows.append(_grade(lab, q, occ))
    return rows if raw else _summary(rows, key, label, what)


def _expected(lab, q, occ) -> float:
    """Exact expected score of (q, occ) under the posterior of the lab's own data."""
    b = lab.belief
    return 0.5 * (float(b.rules() @ B._rule_part_vec(q))
                  + float(b.layout_weights() @ B._cell_part_vec(occ)))


def break_curve() -> list[dict]:
    """Honest experiments, beliefs flattened (power < 1) or sharpened (power > 1). "expected" is
    the exact expected score given the evidence, which a proper score maximises at power 1 on
    every board; "mean" is the realised average over the boards (noisier)."""
    out = []
    for power in (0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0):
        xs, es = [], []
        for seed in range(BREAK_N):
            lab = _lab("reference", seed)
            q = B._sharpen(lab.belief.rules(), power)
            occ = B._sharpen_cells(lab.belief.occupancy(), power)
            xs.append(B.score(q, occ, lab.hidden_rule, lab.hidden_layout)["score_raw"])
            es.append(_expected(lab, q, occ))
        out.append({"power": power, "mean": float(np.mean(xs)), "expected": float(np.mean(es))})
    return out


def break_custom(body: dict) -> dict:
    """Any fixed submission (no experiments), graded on the same boards."""
    q, occ = B.parse_submission(body.get("rules", {}), body.get("occupancy"))
    rows = [_grade(_lab("none", seed), q, occ) for seed in range(BREAK_N)]
    return _summary(rows, "custom", "Your submission", "your fixed beliefs, no experiments")


def break_meta() -> dict:
    return {"n": BREAK_N, "open": bool(B.OPEN_WORLD),
            "strategies": [{"key": k, "label": lab, "what": w} for k, _, inf, lab, w in STRATEGIES
                           if B.OPEN_WORLD or inf != "closed_world"]}


def _warm() -> None:
    for seed in range(BREAK_N):
        for design in ("reference", "none", "one"):
            _lab(design, seed)


def bench_cfg() -> dict:
    return json.loads(BENCH_CFG.read_text()) if BENCH_CFG.exists() else \
        {"tag": "bench-v1", "salt": "battleship-llm-v1", "seeds": "0:10"}


def bench_dir() -> Path:
    return ROOT / "results" / "battleship_bench" / bench_cfg()["tag"]


def human_done(name: str) -> list[int]:
    f = bench_dir() / "runs.jsonl"
    if not f.exists() or not name:
        return []
    return sorted({r["seed"] for r in map(json.loads, f.read_text().splitlines())
                   if r["model"] == f"human:{name}"})


def human_state() -> dict:
    """What a human player may see: the board as played, never the posterior or the truth
    (until the beliefs are submitted)."""
    h, cfg = STATE["human"], bench_cfg()
    base = {"cfg": {"tag": cfg["tag"], "salt": cfg["salt"], "seeds": cfg["seeds"]},
            "prior": B.geometry().p0.tolist()}
    if h is None:
        return {**base, "game": None}
    lab = h["lab"]
    return {**base, "game": True, "name": h["name"], "seed": lab.seed, "budget": lab.budget,
            "remaining": lab.remaining, "history": lab.history, "result": lab.result,
            "done": human_done(h["name"])}


def human_new(name: str, seed: int) -> dict:
    cfg = bench_cfg()
    lo, hi = map(int, cfg["seeds"].split(":"))
    name = "".join(ch for ch in name if ch.isalnum() or ch in "-_")[:32]
    if not name:
        raise ValueError("enter a player name (letters, digits, - or _)")
    if not lo <= seed < hi:
        raise ValueError(f"benchmark boards are {lo} to {hi - 1}")
    if seed in human_done(name):
        raise ValueError(f"{name} has already played board {seed}")
    lab = B.BattleshipLab()
    lab.reset(seed, cfg["salt"])
    STATE["human"] = {"lab": lab, "name": name, "t0": time.time()}
    return human_state()


def human_submit(rules: dict, occupancy: list) -> dict:
    h = STATE["human"]
    lab, name = h["lab"], h["name"]
    res = lab.submit(rules, occupancy, reference=True)
    keys = ("score", "score_raw", "rule_part", "cell_part", "design", "inference", "accuracy",
            "ppc_p", "n_actions", "n_fires", "n_scans", "budget_used", "reference_score_raw",
            "gap_to_reference", "hidden_rule")
    row = {"model": f"human:{name}", "provider": "human", "seed": lab.seed, "salt": lab.salt,
           "parsed": True, "invalid_actions": 0, "calls": 0, "in": 0, "out": 0,
           **{k: res[k] for k in keys}, "seconds": round(time.time() - h["t0"], 1),
           "history": lab.history, "transcript": [],
           "submitted_rules": res["submitted_rules"], "submitted_occupancy": res["submitted_occupancy"]}
    d = bench_dir()
    (d / f"human_{name}").mkdir(parents=True, exist_ok=True)
    with open(d / "runs.jsonl", "a") as f:
        f.write(json.dumps(row) + "\n")
    replay = {"label": f"human {name}, board {lab.seed}",
              "trajectory": {"history": lab.history, "snapshots": lab.snapshots, "result": res},
              "reference": B.reference_trajectory(lab.seed, lab.salt)}
    (d / f"human_{name}" / f"seed-{lab.seed}.json").write_text(json.dumps(replay))
    return human_state()


def lab_state() -> dict:
    lab = STATE["lab"]
    if lab is None:
        return {"lab": None}
    return {"lab": True, "seed": lab.seed, "budget": lab.budget, "remaining": lab.remaining,
            "history": lab.history, "snapshot": lab.snapshots[-1], "result": lab.result}


def new_game(seed: int | None) -> dict:
    lab = B.BattleshipLab()
    lab.reset(seed if seed is not None else secrets.randbelow(10**6), secrets.token_hex(8))
    STATE["lab"] = lab
    return lab_state()


def submit(mode: str) -> dict:
    lab = STATE["lab"]
    rng = __import__("numpy").random.default_rng(0)
    q, occ = B.submission(lab, {"exact": "exact", "noiseless": "noiseless",
                                "overconfident": "overconfident", "prior": "prior"}[mode], rng)
    lab.submit(q, occ, reference=True)
    return lab_state()


def demo_runs(seed: int) -> dict:
    """Reference and a noise-ignoring 'coder' (same shots, wrong inference) on one board."""
    salt = f"demo-{seed}"
    out = {}
    for key, (design, inference) in {"trajectory": ("hunter", "noiseless"),
                                     "reference": ("reference", "exact")}.items():
        lab = B.run_policy(design, inference, seed, salt)
        out[key] = {"history": lab.history, "snapshots": lab.snapshots, "result": lab.result}
    out["label"] = f"demo seed {seed}: human-style shots + noise-ignoring inference vs reference"
    return out


def list_runs() -> list[str]:
    runs = []
    files = [f for base in ("jobs", "results") for f in sorted((ROOT / base).glob("**/verifier/details.json"))]
    files += sorted((ROOT / "results" / "battleship_llm").glob("*/seed-*.json"))
    files += sorted((ROOT / "results" / "battleship_bench").glob("*/*/seed-*.json"))
    if files:
        for f in files:
            try:
                if "trajectory" in json.loads(f.read_text()):
                    runs.append(str(f.relative_to(ROOT)))
            except (OSError, json.JSONDecodeError):
                pass
    return runs


def load_run(rel: str) -> dict:
    f = (ROOT / rel).resolve()
    if ROOT not in f.parents or not (f.name == "details.json" or
                                     (f.name.startswith("seed-") and f.suffix == ".json")):
        raise ValueError("not a run file")
    d = json.loads(f.read_text())
    d["label"] = f"{d['label']} ({rel})" if d.get("label") else rel
    return d


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200) -> None:
        self._send(code, json.dumps(obj).encode())

    def do_GET(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path == "/":
                self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            elif u.path == "/api/meta":
                g = B.geometry()
                self._json({"names": B.NAMES, "definitions": dict(B.RULES), "budget": B.BUDGET,
                            "cost": B.COST, "prior": g.p0.tolist(),
                            "n_rule": g.n_rule.tolist(), "open": bool(B.OPEN_WORLD)})
            elif u.path == "/api/state":
                self._json(lab_state())
            elif u.path == "/api/human/state":
                self._json(human_state())
            elif u.path == "/api/runs":
                self._json(list_runs())
            elif u.path == "/api/run":
                self._json(load_run(q["path"][0]))
            elif u.path == "/api/break/meta":
                self._json(break_meta())
            elif u.path == "/api/break/run":
                self._json(break_strategy(q["key"][0]))
            elif u.path == "/api/break/curve":
                self._json(break_curve())
            elif u.path == "/api/demo":
                self._json(demo_runs(int(q.get("seed", ["0"])[0])))
            else:
                self._send(404, b"{}")
        except Exception as e:  # noqa: BLE001
            self._json({"error": str(e)}, 400)

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n) or b"{}")
        try:
            if self.path == "/api/new":
                seed = body.get("seed")
                self._json(new_game(int(seed) if seed not in (None, "") else None))
            elif self.path == "/api/act":
                STATE["lab"].step(body)
                self._json(lab_state())
            elif self.path == "/api/ref_step":
                lab = STATE["lab"]
                if lab.remaining > 0 and lab.result is None:
                    lab.step_id(B.greedy_action(lab.belief, lab.remaining))
                self._json(lab_state())
            elif self.path == "/api/submit":
                self._json(submit(body.get("mode", "exact")))
            elif self.path == "/api/human/new":
                self._json(human_new(str(body.get("name", "")), int(body.get("seed"))))
            elif self.path == "/api/human/act":
                h = STATE["human"]
                if h is None or h["lab"].result is not None:
                    raise ValueError("start a board first")
                h["lab"].step(body)
                self._json(human_state())
            elif self.path == "/api/human/submit":
                self._json(human_submit(body.get("rules", {}), body.get("occupancy")))
            elif self.path == "/api/break/custom":
                self._json(break_custom(body))
            elif self.path == "/api/human/quit":
                STATE["human"] = None
                self._json(human_state())
            else:
                self._send(404, b"{}")
        except Exception as e:  # noqa: BLE001
            self._json({"error": str(e)}, 400)

    def log_message(self, *a) -> None:
        pass


PAGE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Rulebound Battleship</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#f6f4ef;--ink:#1d2430;--mute:#6b7280;--line:#d9d4c7;--accent:#1f5f8b;--hit:#b4232c;--ok:#2f7d4f}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink)}
header{padding:14px 22px;border-bottom:1px solid var(--line);display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}
h1{font-size:18px;margin:0}header .sub{color:var(--mute)}
.tabs button{border:0;background:none;padding:6px 10px;font:inherit;color:var(--mute);cursor:pointer;border-bottom:2px solid transparent}
.tabs button.on{color:var(--ink);border-color:var(--accent)}
main{padding:18px 22px;display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:start}
.panel{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
button.b{font:inherit;padding:6px 11px;border:1px solid var(--line);background:#fff;border-radius:6px;cursor:pointer}
button.b:hover{border-color:var(--accent)}button.b.p{background:var(--accent);color:#fff;border-color:var(--accent)}
button.b:disabled{opacity:.45;cursor:default}
input,select{font:inherit;padding:5px 7px;border:1px solid var(--line);border-radius:6px;background:#fff}
.grid{display:grid;grid-template-columns:repeat(6,46px) 34px;gap:3px}
.cell{width:46px;height:46px;border-radius:5px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;
 font-weight:600;font-size:13px;position:relative;cursor:default;user-select:none}
.cell.click{cursor:crosshair}.cell.click:hover{outline:2px solid var(--accent)}
.cell .pp{position:absolute;bottom:1px;right:3px;font-size:9px;font-weight:400;opacity:.75}
.cell.truth{box-shadow:inset 0 0 0 3px #1d2430}
.scanb{width:34px;height:46px;font-size:11px;padding:0}.scanc{width:46px;height:30px;font-size:11px;padding:0}
.bars .bar{display:grid;grid-template-columns:110px 1fr 48px;gap:8px;align-items:center;margin:3px 0}
.bars .track{height:12px;background:#eee9df;border-radius:6px;overflow:hidden}.bars .fill{height:100%;background:var(--accent)}
.bars .bar.true .lab{font-weight:700;color:var(--ok)}
.mute{color:var(--mute)}.small{font-size:12px}
table.sc{border-collapse:collapse;margin-top:6px}table.sc td{padding:2px 10px 2px 0}table.sc td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.log{max-height:220px;overflow:auto;font-family:ui-monospace,Menlo,monospace;font-size:12px}
.minis{display:flex;gap:16px;flex-wrap:wrap}.mini .grid{grid-template-columns:repeat(6,26px)}.mini .cell{width:26px;height:26px;font-size:10px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.legend{display:flex;gap:10px;align-items:center;font-size:12px;color:var(--mute)}.sw{width:60px;height:10px;border-radius:5px;background:linear-gradient(90deg,#f7f5f0,#1f5f8b)}
</style></head><body>
<header><h1>Rulebound Battleship</h1><span class="sub">find the ships and the rule that placed them, from noisy shots</span>
<span class="tabs"><button id="tPlay" class="on">Play</button><button id="tHuman">Human benchmark</button><button id="tReplay">Replay</button><button id="tBreak">Break it</button></span></header>
<div id="play"></div><div id="human" style="display:none"></div><div id="replay" style="display:none"></div><div id="break" style="display:none"></div>
<script>
let META=null, S=null, R=null, step=0, showPost=true;
const $=(h)=>{const t=document.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const api=async(p,b)=>{const r=await fetch(p,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{});const j=await r.json();if(j.error)alert(j.error);return j};
function heat(p){const a=[247,245,240],b=[31,95,139];const c=a.map((v,i)=>Math.round(v+(b[i]-v)*p));return `rgb(${c})`}
function marks(history,upto){const m=Array(36).fill('').map(()=>[]);const sc={row:Array(6).fill(null),col:Array(6).fill(null)};
 history.slice(0,upto).forEach(h=>{if(h.type==='fire')m[h.row*6+h.col].push(h.result?'X':'o');else sc[h.axis][h.index]=h.result});return {m,sc}}
function board(o){ // o: {heat, history, upto, truth, click, scan, mini, showP}
 const g=$('<div class="grid"></div>');const {m,sc}=marks(o.history||[],o.upto??(o.history||[]).length);
 for(let r=0;r<6;r++){for(let c=0;c<6;c++){const i=r*6+c,p=o.heat?o.heat[i]:0;
  const d=$(`<div class="cell"></div>`);d.style.background=o.heat?heat(p):'#fff';d.style.color=p>.55?'#fff':'var(--ink)';
  const mk=m[i];if(mk.length){d.textContent=mk.join('');if(mk.includes('X'))d.style.color=p>.55?'#ffd6d6':'var(--hit)'}
  if(o.heat&&!o.mini&&o.showP!==false)d.appendChild($(`<span class="pp">${Math.round(p*100)}</span>`));
  if(o.truth&&o.truth[i])d.classList.add('truth');
  if(o.click){d.classList.add('click');d.onclick=()=>o.click(r,c)}g.appendChild(d)}
  if(!o.mini){const b=$(`<button class="b scanb" title="scan row ${r} (cost 2)">${sc.row[r]??'&#9664;'}</button>`);
   if(o.scan)b.onclick=()=>o.scan('row',r);else b.disabled=sc.row[r]==null;g.appendChild(b)}}
 if(!o.mini){for(let c=0;c<6;c++){const b=$(`<button class="b scanc" title="scan column ${c} (cost 2)">${sc.col[c]??'&#9650;'}</button>`);
  if(o.scan)b.onclick=()=>o.scan('col',c);else b.disabled=sc.col[c]==null;g.appendChild(b)}}
 return g}
function bars(probs,truth){const w=$('<div class="bars"></div>');META.names.forEach((n,i)=>{const p=Array.isArray(probs)?probs[i]:probs[n];
 const e=$(`<div class="bar ${truth===n?'true':''}" title="${META.definitions[n]}"><span class="lab">${n}</span><div class="track"><div class="fill" style="width:${(p*100).toFixed(1)}%"></div></div><span>${(p*100).toFixed(1)}%</span></div>`);w.appendChild(e)});return w}
function scoreTable(r){const f=(x)=>x==null?'':(+x).toFixed(3);const rows=[['score (Harbor, clipped)',r.score],['score, unclipped',r.score_raw],['rule part',r.rule_part],['cell part',r.cell_part],
 ['design (exact posterior on these shots)',r.design],['inference (score minus design)',r.inference],['reference on the same board',r.reference_score_raw],['gap to reference',r.gap_to_reference],['leak test p',r.ppc_p]];
 return $(`<table class="sc">${rows.filter(x=>x[1]!=null).map(x=>`<tr><td>${x[0]}</td><td>${f(x[1])}</td></tr>`).join('')}</table>`)}
function truthArr(r){return r?r.hidden_occupancy.flat():null}
// ---------------- play
async function renderPlay(){const P=document.getElementById('play');P.innerHTML='';const m=$('<main></main>');P.appendChild(m);
 const left=$('<div class="panel"></div>');m.appendChild(left);
 left.appendChild($(`<div class="row"><input id="seed" placeholder="seed (blank = random)" size="16"><button class="b p" id="new">New board</button></div>`));
 left.querySelector('#new').onclick=async()=>{S=await api('/api/new',{seed:document.getElementById('seed').value});renderPlay()};
 if(!S||!S.lab){left.appendChild($('<p class="mute">Start a new board.</p>'));return}
 const done=!!S.result;
 left.appendChild($(`<div class="row"><b>Budget</b> ${S.remaining} / ${S.budget}<span class="mute small">fire 1, scan 2</span>
  <label class="small"><input type="checkbox" id="sp" ${showPost?'checked':''}> show exact posterior</label></div>`));
 left.querySelector('#sp').onchange=(e)=>{showPost=e.target.checked;renderPlay()};
 const act=async(b)=>{S=await api('/api/act',b);renderPlay()};
 left.appendChild(board({heat:(showPost||done)?S.snapshot.occupancy:null,history:S.history,truth:done?truthArr(S.result):null,
  click:(!done&&S.remaining>=1)?(r,c)=>act({type:'fire',row:r,col:c}):null,
  scan:(!done&&S.remaining>=2)?(ax,i)=>act({type:'scan',axis:ax,index:i}):null,showP:showPost||done}));
 left.appendChild($(`<div class="legend" style="margin-top:8px">X hit, o miss (reports are wrong 10% of the time); arrows scan a row or column <span class="sw"></span> P(ship)</div>`));
 const ctl=$('<div class="row"></div>');left.appendChild(ctl);
 const rb=$('<button class="b">Reference move</button>');rb.disabled=done||S.remaining<1;rb.onclick=async()=>{S=await api('/api/ref_step',{});renderPlay()};ctl.appendChild(rb);
 const ab=$('<button class="b">Auto-play reference</button>');ab.disabled=done||S.remaining<1;ab.onclick=async()=>{while(S.remaining>0&&!S.result){S=await api('/api/ref_step',{});renderPlay();await new Promise(r=>setTimeout(r,250))}};ctl.appendChild(ab);
 const sub=$('<div class="row"></div>');left.appendChild(sub);
 [['exact','Submit exact posterior'],['noiseless','Submit noise-ignoring belief'],['overconfident','Submit overconfident'],['prior','Submit prior']].forEach(([k,t])=>{
  const b=$(`<button class="b ${k==='exact'?'p':''}">${t}</button>`);b.disabled=done;b.onclick=async()=>{S=await api('/api/submit',{mode:k});renderPlay()};sub.appendChild(b)});
 const right=$('<div></div>');m.appendChild(right);
 const rp=$('<div class="panel"><b>Which rule placed the ships?</b></div>');right.appendChild(rp);
 if(showPost||done)rp.appendChild(bars(S.snapshot.rules,done?S.result.hidden_rule:null));else rp.appendChild($('<p class="mute">Posterior hidden. Tick "show exact posterior".</p>'));
 if(done){const res=$('<div class="panel" style="margin-top:14px"><b>Result</b></div>');right.appendChild(res);
  res.appendChild($(`<div class="small">Hidden rule: <b>${S.result.hidden_rule}</b>. Ship cells are outlined.</div>`));res.appendChild(scoreTable(S.result));
  const mi=$('<div class="minis" style="margin-top:10px"></div>');res.appendChild(mi);
  [['submitted',S.result.submitted_occupancy.flat()],['exact posterior',S.result.exact_occupancy.flat()]].forEach(([t,h])=>{const d=$(`<div class="mini"><div class="small mute">${t}</div></div>`);d.appendChild(board({heat:h,truth:truthArr(S.result),mini:true}));mi.appendChild(d)})}
 const lg=$('<div class="panel" style="margin-top:14px"><b>Log</b><div class="log"></div></div>');right.appendChild(lg);
 lg.querySelector('.log').innerHTML=S.history.map((h,i)=>`${i+1}. ${h.type==='fire'?`fire (${h.row},${h.col}) -> ${h.result?'hit':'miss'}`:`scan ${h.axis} ${h.index} -> ${h.result}`}  [${h.budget_remaining} left]`).join('<br>')||'<span class="mute">no actions yet</span>';
 const rules=$(`<div class="panel small" style="margin-top:14px"><b>The ${META.names.length} rules</b> (one was drawn uniformly; the layout is uniform among layouts that satisfy it)</div>`);right.appendChild(rules);
 META.names.forEach((n,i)=>rules.appendChild($(`<div><b>${n}</b> (${META.n_rule[i]} layouts): ${META.definitions[n]}</div>`)))}
// ---------------- replay
async function renderReplay(){const P=document.getElementById('replay');P.innerHTML='';const m=$('<main style="grid-template-columns:1fr"></main>');P.appendChild(m);
 const top=$('<div class="panel"><div class="row"><b>Run</b><select id="runs"><option value="">choose a run (Harbor trial or LLM episode)...</option></select><span class="mute">or</span><input id="dseed" size="6" value="39"><button class="b" id="demo">Offline demo</button></div></div>');m.appendChild(top);
 const runs=await api('/api/runs');const sel=top.querySelector('#runs');runs.forEach(r=>sel.appendChild($(`<option>${r}</option>`)));
 if(!runs.length)sel.appendChild($('<option disabled>no runs yet (jobs/ or results/battleship_llm/)</option>'));
 sel.onchange=async()=>{if(sel.value){R=await api('/api/run?path='+encodeURIComponent(sel.value));step=0;renderReplay()}};
 top.querySelector('#demo').onclick=async()=>{R=await api('/api/demo?seed='+top.querySelector('#dseed').value);step=0;renderReplay()};
 if(!R)return;top.appendChild($(`<div class="small mute">${R.label||''}</div>`));
 const A=R.trajectory,F=R.reference,n=A.history.length;step=Math.min(step,n);
 const sl=$(`<div class="row"><b>Step</b><input type="range" min="0" max="${n}" value="${step}" style="width:320px"><span>${step} / ${n}</span><button class="b" id="pl">Play</button></div>`);top.appendChild(sl);
 sl.querySelector('input').oninput=(e)=>{step=+e.target.value;renderReplay()};
 sl.querySelector('#pl').onclick=async()=>{for(step=0;step<=n;step++){renderReplay();await new Promise(r=>setTimeout(r,350))}step=n};
 const two=$('<div class="two"></div>');m.appendChild(two);const end=step===n;
 [[ 'Agent', A, step],['Reference on the same board',F,end?F.history.length:Math.min(step,F.history.length)]].forEach(([t,T,k])=>{
  const p=$(`<div class="panel"><b>${t}</b> <span class="mute small">${k} actions, exact posterior after them</span></div>`);two.appendChild(p);
  p.appendChild(board({heat:T.snapshots[k].occupancy,history:T.history,upto:k,truth:end?truthArr(T.result):null}));
  p.appendChild(bars(T.snapshots[k].rules,end?T.result.hidden_rule:null));
  if(end){p.appendChild($('<div style="margin-top:8px"><b>What it submitted</b></div>'));p.appendChild(bars(T.result.submitted_rules,T.result.hidden_rule));
   const mi=$('<div class="minis" style="margin-top:8px"></div>');p.appendChild(mi);
   [['submitted map',T.result.submitted_occupancy.flat()],['exact posterior',T.result.exact_occupancy.flat()]].forEach(([s,h])=>{const d=$(`<div class="mini"><div class="small mute">${s}</div></div>`);d.appendChild(board({heat:h,truth:truthArr(T.result),mini:true}));mi.appendChild(d)});
   p.appendChild(scoreTable(T.result))}})}
document.getElementById('tPlay').onclick=()=>{tab('play')};document.getElementById('tReplay').onclick=()=>{tab('replay')};document.getElementById('tHuman').onclick=()=>{tab('human')};document.getElementById('tBreak').onclick=()=>{tab('break')};
function tab(t){for(const k of ['play','human','replay','break']){document.getElementById(k).style.display=t===k?'':'none';document.getElementById('t'+k[0].toUpperCase()+k.slice(1)).classList.toggle('on',t===k)}
 ({play:renderPlay,human:renderHuman,replay:renderReplay,break:renderBreak})[t]()}
// ---------------- break it
let BK=null, BRES=[], BCURVE=null;
const f2=x=>(x<0?'\u2212':'+')+Math.abs(x).toFixed(2);
async function renderBreak(){const P=document.getElementById('break');P.innerHTML='';if(!BK)BK=await api('/api/break/meta');
 const m=$('<main style="grid-template-columns:minmax(300px,380px) 1fr"></main>');P.appendChild(m);
 const left=$(`<div class="panel"><b>Try to break the score</b><div class="small mute" style="margin:4px 0 10px">Every strategy plays the same ${BK.n} hidden boards. Find one that beats honest play without better experiments.</div></div>`);m.appendChild(left);
 BK.strategies.forEach(st=>{const b=$(`<button class="b" style="display:block;width:100%;text-align:left;margin:4px 0"><b>${st.label}</b><br><span class="small mute">${st.what}</span></button>`);
  b.onclick=async()=>{b.disabled=true;b.innerHTML+='<span class="small"> ... grading</span>';const r=await api('/api/break/run?key='+st.key);BRES=BRES.filter(x=>x.key!==r.key);BRES.push(r);renderBreak()};left.appendChild(b)});
 const cu=$(`<div style="margin-top:12px"><b>Your own fixed answer</b> <span class="small mute">(no experiments; rules sum is normalised; occupancy optional)</span><textarea id="bk" rows="5" style="width:100%;font:12px monospace;margin-top:4px">{"rules": {"${META.names[1]}": 1.0}, "occupancy": null}</textarea><button class="b p" id="bkgo">Grade it</button></div>`);left.appendChild(cu);
 cu.querySelector('#bkgo').onclick=async()=>{let body;try{body=JSON.parse(document.getElementById('bk').value)}catch(e){alert('not valid JSON');return}
  const r=await api('/api/break/custom',body);if(r.error)return;BRES=BRES.filter(x=>x.key!=='custom');BRES.push(r);renderBreak()};
 const right=$('<div></div>');m.appendChild(right);
 const t=$('<div class="panel"><b>Results</b> <span class="small mute">mean unclipped score over the boards; honest play is the bar to beat</span></div>');right.appendChild(t);
 if(!BRES.length)t.appendChild($('<div class="small mute" style="margin-top:8px">Click a strategy.</div>'));
 else{const rows=[...BRES].sort((a,b)=>b.mean-a.mean);const tb=$(`<table class="sc" style="width:100%"><tr><td><b>Strategy</b></td><td><b>Score</b></td><td><b>vs honest</b></td><td><b>Worst board</b></td><td><b>Leak test, per board</b></td><td><b>Leak test, all boards</b></td></tr></table>`);
  rows.forEach(r=>{const cheat=r.key==='peek'||r.key==='hidden_shots';const win=r.key!=='honest'&&r.vs_honest>0.005;
   tb.appendChild($(`<tr><td>${r.label}</td><td>${f2(r.mean)}</td><td style="color:${win?'var(--hit)':'inherit'}">${r.key==='honest'?'':f2(r.vs_honest)}</td><td>${f2(r.worst)}</td><td style="color:${r.flagged>0.2?'var(--hit)':'inherit'}">${Math.round(100*r.flagged)}%</td><td style="color:${r.caught?'var(--hit)':'inherit'}">${r.caught?'caught':'passes'} <span class="small mute">(p ${r.batch_p<0.001?'< 0.001':r.batch_p.toFixed(3)})</span></td></tr>`))});
  t.appendChild(tb);
  const scale=Math.max(1.6,...rows.map(r=>Math.abs(r.mean)));const ch=$('<div style="margin-top:12px"></div>');
  rows.forEach(r=>{const w=Math.abs(r.mean)/scale*45;const neg=r.mean<0;
   ch.appendChild($(`<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><div style="width:190px" class="small">${r.label}</div><div style="position:relative;flex:1;height:14px;border-left:1px solid var(--line)"><div style="position:absolute;left:50%;top:-2px;bottom:-2px;border-left:1px solid var(--ink)"></div><div style="position:absolute;top:0;height:14px;${neg?`right:50%`:`left:50%`};width:${w}%;background:${r.key==='honest'?'var(--accent)':(neg?'var(--hit)':'var(--ink)')}"></div></div><div class="small" style="width:52px;text-align:right">${f2(r.mean)}</div></div>`))});
  t.appendChild(ch);t.appendChild($('<div class="small mute" style="margin-top:6px">Centre line = 0, the score for doing nothing. Cheats can score above honest play, but only by using information the experiments did not give, and the exact leak test catches them. About 5% of honest boards are flagged by chance; the all-boards test pools them.</div>'))}
 const cv=$('<div class="panel" style="margin-top:14px"><b>How confident should you be?</b> <span class="small mute">honest experiments, beliefs flattened (left) or sharpened (right); exact expected score given the evidence, averaged over the boards</span><div id="curve" class="small mute">computing...</div></div>');right.appendChild(cv);
 if(!BCURVE)BCURVE=await api('/api/break/curve');const C=BCURVE,W=520,Hh=150,lo=Math.min(...C.map(c=>c.expected)),hi=Math.max(...C.map(c=>c.expected));
 const X=i=>30+i*(W-60)/(C.length-1),Y=v=>Hh-20-(v-lo)/(hi-lo||1)*(Hh-40);
 let svg=`<svg width="${W}" height="${Hh}"><polyline fill="none" stroke="var(--ink)" stroke-width="2" points="${C.map((c,i)=>X(i)+','+Y(c.expected)).join(' ')}"/>`;
 C.forEach((c,i)=>{const h=c.power===1;svg+=`<circle cx="${X(i)}" cy="${Y(c.expected)}" r="${h?6:3}" fill="${h?'var(--accent)':'var(--ink)'}"/><text x="${X(i)}" y="${Hh-4}" text-anchor="middle" font-size="11">${h?'honest':'x'+c.power}</text><text x="${X(i)}" y="${Y(c.expected)-9}" text-anchor="middle" font-size="11">${c.expected.toFixed(2)}</text>`});
 svg+='</svg>';document.getElementById('curve').innerHTML=svg}
// ---------------- human benchmark
let H=null, hRules=null, hOcc=null, hMode='shoot', hName=localStorage.getItem('bsName')||'';
const LEVELS=[null,0.95,0.75,0.25,0.05];
function hReset(){hRules=Object.fromEntries(META.names.map(n=>[n,50]));hOcc=Array(36).fill(null);hMode='shoot'}
async function renderHuman(){const P=document.getElementById('human');P.innerHTML='';if(!H)H=await api('/api/human/state');
 const m=$('<main style="grid-template-columns:auto 420px"></main>');P.appendChild(m);const left=$('<div class="panel"></div>');m.appendChild(left);const right=$('<div></div>');m.appendChild(right);
 const [lo,hi]=H.cfg.seeds.split(':').map(Number);
 if(!H.game||H.result){const st=$(`<div><div class="row"><b>Player</b><input id="hn" value="${hName}" placeholder="your name" size="14">
   <b>Board</b><select id="hs"></select><button class="b p" id="hgo">Start board</button></div>
   <p class="small mute">You play the same boards as the models (salt ${H.cfg.salt}). No posterior, no reference: shoot and scan, then report what you believe. Each board can be played once per name.</p></div>`);
  left.appendChild(st);const sel=st.querySelector('#hs');for(let k=lo;k<hi;k++)sel.appendChild($(`<option value="${k}">${k}${(H.done||[]).includes(k)?' (played)':''}</option>`));
  if(H.done){const nxt=[...Array(hi-lo).keys()].map(i=>i+lo).find(k=>!H.done.includes(k));if(nxt!==undefined)sel.value=nxt}
  st.querySelector('#hgo').onclick=async()=>{hName=st.querySelector('#hn').value.trim();localStorage.setItem('bsName',hName);
   const r=await api('/api/human/new',{name:hName,seed:+sel.value});if(!r.error){H=r;hReset();renderHuman()}};
  if(!H.result){right.appendChild(rulesPanel());return}}
 if(H.game&&!H.result){
  if(!hRules)hReset();
  left.appendChild($(`<div class="row"><b>${H.name}</b>, board ${H.seed}. <b>Budget</b> ${H.remaining} / ${H.budget} <span class="mute small">fire 1, scan 2</span></div>`));
  const modes=$(`<div class="row"><button class="b ${hMode==='shoot'?'p':''}" id="ms">Shoot</button><button class="b ${hMode==='mark'?'p':''}" id="mm">Mark my beliefs</button>
   <span class="small mute">${hMode==='mark'?'click a cell to cycle: prior, 95%, 75%, 25%, 5% ship':'click a cell to fire, arrows to scan'}</span></div>`);left.appendChild(modes);
  modes.querySelector('#ms').onclick=()=>{hMode='shoot';renderHuman()};modes.querySelector('#mm').onclick=()=>{hMode='mark';renderHuman()};
  const heatArr=hOcc.map((v,i)=>v==null?H.prior[i]:v);
  const act=async(b)=>{const r=await api('/api/human/act',b);if(!r.error){H=r;renderHuman()}};
  left.appendChild(board({heat:hMode==='mark'?heatArr:null,history:H.history,showP:hMode==='mark',
   click:hMode==='mark'?(r,c)=>{const i=r*6+c;const k=LEVELS.indexOf(hOcc[i]);hOcc[i]=LEVELS[(k+1)%LEVELS.length];renderHuman()}:(H.remaining>=1?(r,c)=>act({type:'fire',row:r,col:c}):null),
   scan:hMode==='shoot'&&H.remaining>=2?(ax,i)=>act({type:'scan',axis:ax,index:i}):null}));
  left.appendChild($('<div class="legend" style="margin-top:8px">X hit, o miss (each report is wrong 10% of the time); scans count ship cells in a row or column, off by one 30% of the time</div>'));
  const rp=$('<div class="panel"><b>Your probability for each rule</b> <span class="small mute">(sliders are normalised to sum to 100%)</span></div>');right.appendChild(rp);
  const tot=()=>Object.values(hRules).reduce((a,b)=>a+b,0)||1;
  META.names.forEach(n=>{const row=$(`<div class="bar"><span class="lab" title="${META.definitions[n]}">${n}</span><input type="range" min="0" max="100" value="${hRules[n]}"><span>${(100*hRules[n]/tot()).toFixed(0)}%</span></div>`);
   row.style.display='grid';row.style.gridTemplateColumns='110px 1fr 48px';row.style.gap='8px';
   row.querySelector('input').oninput=(e)=>{hRules[n]=+e.target.value;rp.querySelectorAll('.bar span:last-child').forEach((sp,j)=>sp.textContent=(100*hRules[META.names[j]]/tot()).toFixed(0)+'%')};rp.appendChild(row)});
  const sb=$('<div class="row" style="margin-top:10px"><button class="b p">Submit my beliefs (ends the board)</button></div>');rp.appendChild(sb);
  sb.querySelector('button').onclick=async()=>{if(!confirm('Submit? Cells you did not mark keep the prior probability.'))return;
   const occ=[];for(let r=0;r<6;r++)occ.push(heatArr.slice(r*6,r*6+6));const r=await api('/api/human/submit',{rules:hRules,occupancy:occ});if(!r.error){H=r;renderHuman()}};
  const lg=$('<div class="panel" style="margin-top:14px"><b>Log</b><div class="log"></div></div>');right.appendChild(lg);
  lg.querySelector('.log').innerHTML=H.history.map((h,i)=>`${i+1}. ${h.type==='fire'?`fire (${h.row},${h.col}) -> ${h.result?'hit':'miss'}`:`scan ${h.axis} ${h.index} -> ${h.result}`}  [${h.budget_remaining} left]`).join('<br>')||'<span class="mute">no actions yet</span>';
  right.appendChild(rulesPanel());return}
 // finished board: your map with the ships outlined on the left, score and beliefs on the right
 const R0=H.result;
 const done=$(`<div style="margin-top:16px"><b>Board ${H.seed} done.</b> Hidden rule: <b>${R0.hidden_rule}</b>. Your map, ships outlined:</div>`);left.appendChild(done);
 left.appendChild(board({heat:R0.submitted_occupancy.flat(),history:H.history,truth:truthArr(R0)}));
 const res=$('<div class="panel"><b>Your score</b></div>');right.appendChild(res);res.appendChild(scoreTable(R0));
 res.appendChild($('<div style="margin-top:8px"><b>Your rule probabilities</b></div>'));res.appendChild(bars(R0.submitted_rules,R0.hidden_rule));
 const ex=$('<div class="panel" style="margin-top:14px"><b>Exact posterior of your own shots</b> <span class="small mute">(what perfect reasoning would have reported)</span></div>');right.appendChild(ex);
 const mi=$('<div class="mini" style="margin-top:6px"></div>');mi.appendChild(board({heat:R0.exact_occupancy.flat(),truth:truthArr(R0),mini:true}));ex.appendChild(mi);
 ex.appendChild(bars(R0.exact_rules,R0.hidden_rule))}
function rulesPanel(){const p=$(`<div class="panel small" style="margin-top:14px"><b>The ${META.names.length} rules</b> (one drawn uniformly; the layout is uniform among layouts that satisfy it)</div>`);
 META.names.forEach((n,i)=>p.appendChild($(`<div><b>${n}</b> (${META.n_rule[i]} layouts): ${META.definitions[n]}</div>`)));return p}
(async()=>{META=await api('/api/meta');S=await api('/api/state');renderPlay()})();
</script></body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8050)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--world", choices=("closed", "open"), default="closed",
                    help='open = the six rules plus "other" (none of the above)')
    a = ap.parse_args()
    set_world(a.world)
    B.geometry()
    threading.Thread(target=_warm, daemon=True).start()   # precompute the Break it boards
    print(f"{a.world} world.", end=" ")
    print(f"Rulebound Battleship UI on http://{a.host}:{a.port}")
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
