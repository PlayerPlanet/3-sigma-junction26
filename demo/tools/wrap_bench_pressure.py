"""Wraps the Bench Pressure page (../bench-pressure/index.html) in the 3σ look.

    python demo/tools/wrap_bench_pressure.py      # writes demo/bench-pressure.html (3D lab)
                                                  # and demo/bench-pressure-2d.html (flat view)

The game's script is copied byte for byte: rules, RNG, bot and recorded model runs are the
published ones. Only the presentation changes:
  - colours: the page's own theme tokens are overridden with the 3σ palette (the canvas reads
    them through getComputedStyle, so the lab repaints itself);
  - type: the three font families the page asks for are pointed at the bundled Inter file, so
    DOM and canvas text both change and nothing is fetched from the network;
  - chrome: the 3σ mark and a link back, sentence-case labels, no pills.
Run it again whenever the upstream page changes. It stops with an error if a hook is missing.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
SRC = HERE.parent / "bench-pressure" / "index.html"
DST = HERE / "bench-pressure.html"          # the 3D lab view
DST_FLAT = HERE / "bench-pressure-2d.html"  # the original flat view, restyled

FONT_LINK_START = '<link rel="stylesheet" href="https://fonts.googleapis.com/'
BRAND = '<div class="brand"><h1>Bench Pressure</h1><span>A Bayesian lab rush</span></div>'

OVERRIDES = """
<style id="three-sigma-skin">
/* 3σ skin for Bench Pressure. Written by demo/tools/wrap_bench_pressure.py; edit it there. */
@font-face { font-family: "IBM Plex Sans"; src: url("assets/inter.woff2") format("woff2"); font-weight: 100 900; font-display: block; }
@font-face { font-family: "Bricolage Grotesque"; src: url("assets/inter.woff2") format("woff2"); font-weight: 100 900; font-display: block; }
@font-face { font-family: "JetBrains Mono"; src: url("assets/inter.woff2") format("woff2"); font-weight: 100 900; font-display: block; }
@font-face { font-family: "TeXMain"; src: url("assets/tex-main.woff2") format("woff2"); font-display: block; }
@font-face { font-family: "TeXMath"; src: url("assets/tex-math.woff2") format("woff2"); font-style: italic; font-display: block; }
:root, :root[data-theme="light"] {
  --bg: #f4f2ed; --paper: #ffffff; --ink: #0b0c0e; --muted: #6a6b6c; --line: #dcd9d2;
  --floor: #ebe8e1; --floor-line: #dedad1;
  --bench: #1b1d21; --bench-top: #2a2d32; --bench-edge: #0b0c0e;
  --steel: #a9a69d; --steel-hi: #dedbd3; --steel-ink: #1b1d21;
  --coat: #ffffff; --hair: #2b2622;
  --hazard: #f0591c; --hazard-ink: #ffffff;
  --good: #2f6b4f; --bad: #b3261e;
  --s1: #0d5c75; --s2: #b8860b; --s3: #9c4a55; --s4: #46618c;
  --p1: #0b0c0e; --p2: #f0591c;
  --agar: #efe3b4; --contam: #5d6630; --dirty: #b3aa98;
  color-scheme: light;
}
body { font-size: 15px; padding-block: 18px 28px; -webkit-font-smoothing: antialiased; font-feature-settings: "tnum", "ss01", "cv11"; }
.top { align-items: center; margin-bottom: 6px; }
.brand { align-items: center; gap: 18px; }
.brand .mark { font-family: "TeXMain", "Times New Roman", serif; font-size: 30px; line-height: 1; color: var(--ink); text-decoration: none; }
.brand .mark i { font-family: "TeXMath", "Times New Roman", serif; font-style: italic; margin-left: 0.04em; }
.brand h1 { font-weight: 400; font-size: 26px; letter-spacing: -0.03em; }
.brand .back { color: var(--muted); font-size: 14px; text-decoration: none; }
.brand .back:hover { color: var(--ink); }
.score { font-size: 14px; gap: 22px; }
.score b { font-weight: 400; font-size: 22px; letter-spacing: -0.02em; }
.score .lbl, .stat .k, .sheet h3 { text-transform: none; letter-spacing: 0; font-size: 13px; }
.pill, .seg button { border-radius: 6px; border-width: 1px; padding: 3px 10px; font-size: 13px; background: transparent; }
.pill.on { background: var(--ink); color: #fff; border-color: var(--ink); }
.stage, .card, .stat, .touchnote { border-radius: 6px; }
.card { border-color: var(--line); padding: 10px 12px 8px; }
.card h4 { font-weight: 500; font-size: 14px; }
.card .hl { font-weight: 400; font-size: 18px; letter-spacing: -0.02em; }
.card .lg { font-size: 12px; }
.overlay { background: color-mix(in srgb, var(--bg) 92%, transparent); }
.sheet h2 { font-weight: 400; font-size: clamp(28px, 3.2vw, 44px); letter-spacing: -0.03em; line-height: 1.06; }
.sheet h3 { font-weight: 500; font-size: 16px; color: var(--ink); }
.sheet p, .sheet li { font-size: 15px; }
.note { font-size: 13.5px; }
button.big { font-weight: 500; font-size: 15px; padding: 12px 24px; border-radius: 99px; border-width: 1px; }
button.big.alt { background: transparent; color: var(--ink); }
button.big.gem { background: var(--p2); border-color: var(--p2); color: #fff; }
kbd { border-radius: 4px; font-size: 12px; }
.stars { color: var(--ink); font-size: 30px; }
.stat .v { font-weight: 300; font-size: 30px; letter-spacing: -0.03em; }
table.cmp, .legend { font-size: 13px; }
.credit { max-width: 1640px; margin: 22px auto 0; color: var(--muted); font-size: 13px; display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.credit a { color: inherit; }
</style>
"""

LAB_CSS = """
<style id="three-sigma-lab">
/* The 3D lab view: the game's own page is kept running out of sight, the lab is drawn over it. */
html, body.lab3d { height: 100%; margin: 0; padding: 0; overflow: hidden; background: #e9e7e2; }
#lab { position: fixed; inset: 0; }
#lab canvas { width: 100%; height: 100%; display: block; touch-action: none; }
#legacy .wrap { display: block; max-width: none; margin: 0; }
#legacy .top, #legacy .col { position: absolute; left: -9999px; top: 0; width: 960px; visibility: hidden; pointer-events: none; }
#legacy .charts { position: fixed; z-index: 8; right: 0; top: 0; bottom: 0; width: min(420px, 100vw); display: flex; flex-direction: column; gap: 10px; padding: 0 16px 16px; box-sizing: border-box; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; background: var(--bg); box-shadow: -18px 0 48px rgba(11, 12, 14, 0.18); visibility: hidden; transform: translateX(100%); transition: transform 0.3s ease, visibility 0s 0.3s; }
#legacy .charts .card { flex: 0 0 auto; min-width: 0; overflow: hidden; box-shadow: none; border-radius: 0; }
#legacy .charts .plot { flex: none; height: 160px; position: relative; }
#legacy .charts .plot canvas { display: block; width: 100%; height: 100%; }
body.charts-open #legacy .charts { visibility: visible; transform: none; transition: transform 0.3s ease; }
.drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; margin: 0 -16px; padding: 14px 16px; background: var(--bg); border-bottom: 1px solid var(--line); }
.drawer-head h3 { margin: 0; font: 600 18px var(--f-body); letter-spacing: -0.01em; color: var(--ink); }
.drawer-head button { height: 40px; padding: 0 20px; border-radius: 99px; border: 1px solid var(--ink); background: var(--ink); color: #fff; font: 500 14px var(--f-body); cursor: pointer; }
.drawer-head button:hover { background: var(--accent, #f0591c); border-color: var(--accent, #f0591c); }
#scrim { position: fixed; inset: 0; z-index: 7; background: rgba(11, 12, 14, 0.22); display: none; cursor: pointer; }
body.charts-open #scrim { display: block; }
body.charts-open .cam { visibility: hidden; }
.credit { display: none; }

.topbar { position: fixed; z-index: 7; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 22px; padding: 16px 26px; pointer-events: none; }
.topbar > * { pointer-events: auto; }
.topbar .back { display: inline-flex; align-items: center; height: 40px; padding: 0 18px; border-radius: 99px; border: 1px solid var(--ink); background: var(--ink); color: #fff; font: 500 14px var(--f-body); text-decoration: none; }
.topbar .back:hover { background: #f0591c; border-color: #f0591c; }
.topbar .mark { font-family: "TeXMain", serif; font-size: 30px; line-height: 1; color: var(--ink); text-decoration: none; }
.topbar .mark i { font-family: "TeXMath", serif; font-style: italic; margin-left: 0.04em; }
.topbar h1 { margin: 0; font-weight: 400; font-size: 24px; letter-spacing: -0.03em; white-space: nowrap; }
.topbar .what { margin: 0 auto 0 6px; font-size: 16px; color: var(--muted); max-width: 62ch; line-height: 1.35; }
.topbar .num { text-align: right; line-height: 1; }
.topbar .num b { display: block; font-weight: 300; font-size: 34px; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.topbar .num span { font-size: 13px; color: var(--muted); }
body:not(.playing) .topbar .num, body:not(.playing) #cards, body:not(.playing) .now { display: none; }

#cards { position: fixed; z-index: 4; left: 26px; top: 86px; display: grid; gap: 10px; width: 290px; pointer-events: none; }
.q { background: rgba(244, 242, 237, 0.58); -webkit-backdrop-filter: blur(16px) saturate(1.2); backdrop-filter: blur(16px) saturate(1.2); border-radius: 0; padding: 14px 16px 12px; border: 1px solid rgba(11, 12, 14, 0.12); border-left: 4px solid var(--c); }
.q header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.q header i { display: none; }
.q h3 { margin: 0; font-weight: 500; font-size: 17px; letter-spacing: -0.01em; }
.q time { font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.q.late time { color: var(--bad); font-weight: 600; }
.q .bars { display: flex; align-items: flex-end; gap: 4px; height: 54px; margin: 12px 0 20px; }
.q .bars > div { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; position: relative; min-width: 0; }
.q .bars u { display: block; background: color-mix(in srgb, var(--c) 34%, #fff); border-radius: 0; transition: height 0.4s ease; }
.q .bars .lead u { background: var(--c); }
.q .bars span { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 3px; font-size: 10.5px; color: var(--muted); white-space: nowrap; }
.q .bars .lead span { color: var(--ink); font-weight: 600; }
.q .guess { margin: 0; font-size: 14px; color: var(--ink); }

.now { position: fixed; z-index: 4; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(760px, calc(100vw - 52px)); background: rgba(11, 12, 14, 0.72); color: #fff; border-radius: 0; padding: 14px 20px; -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
.now p { margin: 0; }
#say { font-size: 19px; letter-spacing: -0.01em; border-left: 4px solid var(--c, transparent); padding-left: 12px; margin-left: -4px; }
#why { margin-top: 6px; font-size: 14px; line-height: 1.4; color: rgba(255, 255, 255, 0.68); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
#why:empty { display: none; }

.cam { position: fixed; z-index: 5; right: 22px; bottom: 22px; display: grid; gap: 8px; justify-items: end; }
.cam div { display: flex; gap: 6px; }
.cam button { height: 40px; min-width: 40px; padding: 0 16px; border-radius: 99px; border: 1px solid rgba(11, 12, 14, 0.14); background: rgba(244, 242, 237, 0.7); color: var(--ink); font: 500 14px var(--f-body); cursor: pointer; backdrop-filter: blur(8px); }
.cam button:hover, .cam button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
.cam .zoom button { font-size: 20px; padding: 0; }

body.human .now { display: none; }
#act { position: fixed; z-index: 4; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(820px, calc(100vw - 52px)); box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 6px 26px; align-items: start; background: rgba(11, 12, 14, 0.72); color: #fff; padding: 16px 20px; -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
#act[hidden] { display: none; }
#act h3 { margin: 0 0 4px; font: 500 20px var(--f-body); letter-spacing: -0.01em; }
#act .where p { margin: 0; font-size: 14px; line-height: 1.4; color: rgba(255, 255, 255, 0.66); }
#actList { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
#actList li { display: flex; gap: 10px; align-items: baseline; font-size: 16px; line-height: 1.3; border-left: 3px solid var(--c, transparent); padding-left: 8px; margin-left: -11px; }
#actList kbd { flex: none; min-width: 58px; text-align: center; font: 600 12px var(--f-body); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink); background: #f4f2ed; padding: 4px 8px; }
#actList:empty { display: none; }
#actGuide { grid-column: 1 / -1; margin: 6px 0 0; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.16); display: flex; gap: 12px; align-items: baseline; font-size: 16px; }
#actGuide[hidden] { display: none; }
#actGuide b { flex: none; font: 600 12px var(--f-body); letter-spacing: 0.08em; text-transform: uppercase; color: #f0591c; }
#actGuide span { border-left: 3px solid var(--c); padding-left: 10px; }
.eig { display: flex; gap: 4px; align-items: flex-end; height: 64px; margin-top: 4px; }
.eig span { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; }
.eig u { display: block; min-height: 2px; background: rgba(255, 255, 255, 0.3); }
.eig b { font: 500 10px var(--f-body); color: rgba(255, 255, 255, 0.6); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: clip; margin-top: 3px; }
.eig .best u { background: #f0591c; }
.eig .cur b { color: #fff; font-weight: 700; }
.eig .cur { outline: 1px solid #fff; outline-offset: 2px; }
body.human .cam { bottom: auto; top: 86px; }
.sheet3d .backlink { font-size: 15px; color: var(--ink); }
.sheet3d .by { margin: 22px 0 0; font-size: 13px; }
.sheet3d .by a { color: inherit; }
#toasts { position: fixed; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
.toast { position: absolute; left: 0; top: 0; background: #fff; color: var(--ink); border-bottom: 3px solid var(--c); border-radius: 0; padding: 6px 12px; font-size: 14px; font-weight: 500; white-space: nowrap; box-shadow: 0 6px 20px rgba(11, 12, 14, 0.16); }

.sheet3d { position: fixed; z-index: 6; inset: 0; display: grid; place-items: center; background: rgba(233, 231, 226, 0.5); backdrop-filter: blur(6px); padding: 20px; }
.sheet3d[hidden] { display: none; }
.sheet3d > div { width: min(620px, 100%); background: rgba(244, 242, 237, 0.9); border-radius: 0; padding: 38px 40px 34px; box-shadow: 0 20px 70px rgba(11, 12, 14, 0.18); }
.sheet3d h2 { margin: 0 0 16px; font-weight: 400; font-size: clamp(28px, 3.4vw, 42px); letter-spacing: -0.03em; line-height: 1.06; }
.sheet3d p { margin: 0 0 12px; font-size: 17px; line-height: 1.5; color: var(--muted); }
.sheet3d .go { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 24px; }
.sheet3d button { height: 48px; padding: 0 24px; border-radius: 99px; border: 1px solid var(--ink); background: var(--ink); color: #fff; font: 500 15px var(--f-body); cursor: pointer; }
.sheet3d button.alt { background: transparent; color: var(--ink); }
.sheet3d select { height: 40px; border-radius: 8px; border: 1px solid var(--line); background: #fff; font: 400 14px var(--f-body); padding: 0 8px; }
#paused { position: fixed; z-index: 7; left: 50%; top: 50%; transform: translate(-50%, -50%); background: var(--ink); color: #fff; padding: 16px 26px; border-radius: 0; font-size: 18px; }
#paused[hidden] { display: none; }

@media (max-width: 900px) {
  #act { grid-template-columns: 1fr; width: calc(100vw - 20px); bottom: 10px; padding: 12px 14px; }
  #act .where p { display: none; }
  .topbar { padding: 12px 14px; gap: 12px; }
  .topbar .what { display: none; }
  .topbar h1 { font-size: 20px; margin-right: auto; }
  .topbar .num b { font-size: 26px; }
  #cards { left: 10px; right: 10px; top: 62px; width: auto; grid-auto-flow: column; grid-auto-columns: minmax(200px, 1fr); overflow-x: auto; pointer-events: auto; }
  .q { padding: 10px 12px; }
  .q .guess { font-size: 13px; }
  .now { bottom: 70px; padding: 10px 14px; width: calc(100vw - 20px); }
  #say { font-size: 16px; }
  .cam { right: 10px; bottom: 12px; left: 10px; grid-auto-flow: column; justify-content: space-between; }
  .sheet3d > div { padding: 26px 22px; }
}
</style>
"""

LAB_HUD = """
<div id="lab" aria-label="The lab, in 3D"></div>
<header class="topbar">
  <a class="back" href="index.html#lab">Back</a>
  <a class="mark" href="index.html" aria-label="3 sigma, back to the main page">3<i>&sigma;</i></a>
  <h1>Bench Pressure</h1>
  <p class="what">A robot gets questions with deadlines. It chooses experiments, reads the plates, and publishes its best answer.</p>
  <div class="num"><b id="hTime">3:00</b><span>time left</span></div>
  <div class="num"><b id="hScore">0</b><span>points</span></div>
</header>
<section id="cards" aria-label="Open questions"></section>
<div id="toasts"></div>
<footer class="now" aria-live="polite"><p id="say"></p><p id="why"></p></footer>
<aside id="act" aria-live="polite" hidden>
  <div class="where"><h3 id="actName"></h3><p id="actInfo"></p></div>
  <ul id="actList"></ul>
  <p id="actGuide" hidden></p>
</aside>
<div class="cam">
  <div><button type="button" id="btnGoggles" aria-pressed="false" hidden>Bayes goggles (G)</button><button type="button" id="speed" hidden></button><button type="button" id="btnCharts" aria-pressed="false">Charts</button></div>
  <div><button type="button" id="camFollow" aria-pressed="false">Follow the duck</button><button type="button" id="camAll">Whole lab</button></div>
  <div class="zoom"><button type="button" id="camOut" aria-label="Zoom out">&minus;</button><button type="button" id="camIn" aria-label="Zoom in">+</button></div>
</div>
<div class="sheet3d" id="start"><div>
  <h2>A robot runs the lab. Watch what it chooses to test.</h2>
  <p>Each card is a question with a deadline. The bars show what the robot believes so far, and every plate it reads should sharpen them.</p>
  <p>Right answer published: points. Wrong answer: a retraction. Too slow: the question expires.</p>
  <div class="go" id="watchBox"><button type="button" id="btnWatch3d">Watch the model run the lab</button><select id="run3d" aria-label="Recorded run"></select></div>
  <div class="go"><button type="button" class="alt" id="btnPlay3d">Drive the robot yourself</button></div>
  <div class="go"><a class="backlink" href="index.html#lab">Back to the main page</a></div>
  <p class="by">Robot model: &ldquo;<a href="https://sketchfab.com/3d-models/microduck-1579de821da94e1e819619869cb0093c" target="_blank" rel="noopener">Microduck</a>&rdquo; by william.rodrigo, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Compressed and re-timed for this page.</p>
</div></div>
<div class="sheet3d" id="endCard" hidden><div>
  <h2>Round over.</h2>
  <p id="endLine"></p>
  <div class="go"><button type="button" id="btnAgain3d">Again</button><button type="button" class="alt" id="btnMenu3d">Back to start</button></div>
</div></div>
<div id="paused" hidden>Paused. Press Esc to continue.</div>
"""

# Read-only window onto the game's state for the 3D view. A separate script, so the game's own
# script stays byte-identical; top-level let/const of a classic script are visible here.
ACCESSOR = """
<script>
SPEEDS.push(10); // the replay speed button now cycles 1, 2, 4, 10 (same array object, game script untouched)
window.__bp = {
  get G() { return G; }, get state() { return state; }, get auto() { return auto; }, get GEM() { return GEM; },
  get goggles() { return goggles; },
  activeTickets, ticketById, plateTicket, targetKey, accepts, REFUSE, NAMES, Bayes, GROW, T, FY, COLS, ROWS, MAP, TYPES,
  start: (n) => start(n), startReplay: (tr) => startReplay(tr),
  menu: () => document.getElementById("btnMenu").click(),
};
</script>
<script src="duck-data.js"></script>
<script src="lab3d.js"></script>
"""

HEAD = """<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A robot runs a simulated lab against deadlines. Watch a model choose experiments, or drive it yourself.">
<meta property="og:type" content="website">
<meta property="og:title" content="Bench Pressure · 3σ">
<meta property="og:description" content="A robot runs a simulated lab against deadlines. Watch a model choose experiments, or drive it yourself.">
<meta name="theme-color" content="#0b0c0e">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230b0c0e'/%3E%3Ctext x='32' y='44' font-family='Georgia,serif' font-size='34' fill='%23f4f2ed' text-anchor='middle'%3E3%26%23963%3B%3C/text%3E%3C/svg%3E">
"""


def main() -> None:
    src = SRC.read_text(encoding="utf-8")

    a = src.find(FONT_LINK_START)
    if a < 0:
        raise SystemExit("hook missing: the Google Fonts link")
    b = src.index(">", a) + 1
    src = src[:a] + src[b:]

    if src.count("</style>") < 1:
        raise SystemExit("hook missing: </style>")
    cut = src.index("</style>") + len("</style>")
    head, body = src[:cut], src[cut:]

    if BRAND not in body:
        raise SystemExit("hook missing: the brand header")
    body = body.replace(BRAND, '<div class="brand"><a class="mark" href="index.html" aria-label="3 sigma, back to the '
                               'main page">3<i>&sigma;</i></a><h1>Bench Pressure</h1>'
                               '<a class="back" href="index.html#lab">Back</a></div>')
    if "<title>Bench Pressure</title>" not in head:
        raise SystemExit("hook missing: the title")
    head = head.replace("<title>Bench Pressure</title>", "<title>3σ · Bench Pressure</title>")

    credit = ('\n<p class="credit"><span>Bench Pressure: game, rules and recorded model runs unchanged from '
              '<code>bench-pressure/index.html</code>.</span><a href="index.html">Back to 3σ</a></p>\n')
    flat = HEAD + head + OVERRIDES + "</head>\n<body>" + body + credit + "</body>\n</html>\n"
    DST_FLAT.write_text(flat, encoding="utf-8")
    cut2 = body.rindex("</script>") + len("</script>")
    lab = (HEAD + head + OVERRIDES + LAB_CSS + '</head>\n<body class="lab3d">' + LAB_HUD
           + '<div id="legacy">' + body[:cut2] + ACCESSOR + body[cut2:] + "</div></body>\n</html>\n")
    DST.write_text(lab, encoding="utf-8")
    for d in (DST, DST_FLAT):
        print(f"wrote {d} ({d.stat().st_size / 1e3:.0f} kB) from {SRC}")


if __name__ == "__main__":
    main()
