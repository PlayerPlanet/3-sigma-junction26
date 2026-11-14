"""Local web UI for Rulebound Battleship: play it, watch the reference, replay agent runs.

    python scripts/battleship_ui.py            # then open http://localhost:8050
    python scripts/battleship_ui.py --port 9000

Play: click a cell to fire, the arrows to scan a row or column; toggle the exact posterior
(the heat map and the rule bars) on and off; let the reference make moves; submit a belief and
see the hidden board, the score and its design / inference split.
Replay: any Harbor trial of a battleship task (jobs/**/verifier/details.json) or any episode of
experiments/battleship_llm.py (results/battleship_llm/<model>/seed-<n>.json) step by step,
next to the reference on the same hidden board, or an offline demo (reference vs a
noise-ignoring coder) that needs no Harbor run.

Standard library + numpy only. Single user, for local demos; it binds to 127.0.0.1.
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from bayesenv import battleship as B  # noqa: E402

STATE: dict = {"lab": None}


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
                            "n_rule": g.n_rule.tolist()})
            elif u.path == "/api/state":
                self._json(lab_state())
            elif u.path == "/api/runs":
                self._json(list_runs())
            elif u.path == "/api/run":
                self._json(load_run(q["path"][0]))
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
<span class="tabs"><button id="tPlay" class="on">Play</button><button id="tReplay">Replay</button></span></header>
<div id="play"></div><div id="replay" style="display:none"></div>
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
 const rules=$('<div class="panel small" style="margin-top:14px"><b>The six rules</b> (one was drawn uniformly; the layout is uniform among layouts that satisfy it)</div>');right.appendChild(rules);
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
document.getElementById('tPlay').onclick=()=>{tab('play')};document.getElementById('tReplay').onclick=()=>{tab('replay')};
function tab(t){document.getElementById('play').style.display=t==='play'?'':'none';document.getElementById('replay').style.display=t==='replay'?'':'none';
 document.getElementById('tPlay').classList.toggle('on',t==='play');document.getElementById('tReplay').classList.toggle('on',t==='replay');t==='play'?renderPlay():renderReplay()}
(async()=>{META=await api('/api/meta');S=await api('/api/state');renderPlay()})();
</script></body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8050)
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    B.geometry()
    print(f"Rulebound Battleship UI on http://{a.host}:{a.port}")
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
