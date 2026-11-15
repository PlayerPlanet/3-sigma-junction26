// Live Gemma panel: the GRPO-trained Gemma 4 E2B plays the selected board, one move per GPU call.
// Plain script (not bundled). The page's own engine (./engine.js) holds the hidden board and the noise;
// the server (deploy_modal/app.py) only sees the move history and returns the model's next action.
(function () {
  const host = document.getElementById('live-gemma');
  if (!host) return;
  const ENGINE = new URL('engine.js', document.currentScript.src).href;
  const API = '/api/gemma/act';
  const HOSTED = 'https://playerplanet-3-sigma-submission--battleship-live-web.us-east.modal.run/';
  const RULE_LABEL = {
    any: 'Any layout', no_touch: 'No touching', parallel: 'All parallel',
    border: 'On the border', center_clear: 'Centre clear', clustered: 'Clustered',
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cellName = (a) => String.fromCharCode(65 + (a % 6)) + (Math.floor(a / 6) + 1);
  const moveText = (a) => {
    if (a < 36) return `fire ${Math.floor(a / 6)} ${a % 6} (cell ${cellName(a)})`;
    const l = a - 36;
    return l < 6 ? `scan row ${l} (row ${l + 1})` : `scan col ${l - 6} (column ${String.fromCharCode(65 + l - 6)})`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const css = document.createElement('style');
  css.textContent = `
  #live-gemma { margin-top: 40px; }
  #live-gemma [hidden] { display: none !important; }
  #live-gemma .lg { border: 1px solid var(--line, rgba(0,0,0,.12)); border-radius: 18px; padding: 24px; background: var(--paper, #f4f2ed); }
  #live-gemma .lg-head { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; justify-content: space-between; }
  #live-gemma h3 { margin: 0; font-size: 22px; }
  #live-gemma .lg-note { margin: 8px 0 0; font-size: 14px; line-height: 1.5; color: var(--mute, #666); max-width: 70ch; }
  #live-gemma .lg-ctl { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  #live-gemma .lg-ctl label { font-size: 13px; color: var(--mute, #666); display: flex; gap: 6px; align-items: center; }
  #live-gemma .lg-ctl select { font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line, #ccc); background: transparent; color: inherit; }
  #live-gemma .lg-body { display: grid; grid-template-columns: minmax(220px, 320px) 1fr; gap: 28px; margin-top: 22px; }
  #live-gemma .lg-grid { display: grid; grid-template-columns: 18px repeat(6, 1fr); gap: 3px; font-size: 11px; }
  #live-gemma .lg-grid > span { display: flex; align-items: center; justify-content: center; color: var(--mute, #666); }
  #live-gemma .lg-c { aspect-ratio: 1; border-radius: 5px; position: relative; display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-variant-numeric: tabular-nums; color: #fff; background: rgb(13 58 77 / calc(0.12 + 0.88 * var(--p, 0))); transition: background .4s; }
  #live-gemma .lg-c.lo { color: var(--ink, #0b0c0e); }
  #live-gemma .lg-c.hit::after, #live-gemma .lg-c.miss::after { content: ''; position: absolute; width: 38%; height: 38%; border-radius: 50%; }
  #live-gemma .lg-c.hit::after { background: var(--accent, #f0591c); }
  #live-gemma .lg-c.miss::after { border: 2px solid currentColor; opacity: .7; }
  #live-gemma .lg-c.ship { outline: 2px solid var(--accent, #f0591c); outline-offset: -2px; }
  #live-gemma .lg-c.scan { box-shadow: inset 0 0 0 2px #fff; }
  #live-gemma .lg-rules { margin-top: 14px; display: grid; gap: 4px; font-size: 12px; }
  #live-gemma .lg-rules div { display: grid; grid-template-columns: 96px 1fr 36px; gap: 8px; align-items: center; }
  #live-gemma .lg-rules u { height: 6px; border-radius: 3px; background: var(--line, #ddd); position: relative; overflow: hidden; text-decoration: none; }
  #live-gemma .lg-rules u::after { content: ''; position: absolute; inset: 0; width: calc(var(--p) * 100%); background: var(--ink, #0b0c0e); }
  #live-gemma .lg-rules .true span:first-child { color: var(--accent, #f0591c); font-weight: 600; }
  #live-gemma .lg-status { font-size: 15px; margin: 0 0 10px; min-height: 1.5em; }
  #live-gemma .lg-status.warn { color: var(--accent, #f0591c); }
  #live-gemma .lg-log { font-size: 13px; line-height: 1.5; max-height: 300px; overflow: auto; border-top: 1px solid var(--line, #ddd); }
  #live-gemma .lg-log div { padding: 6px 0; border-bottom: 1px solid var(--line, #ddd); display: grid; grid-template-columns: 28px 1fr auto; gap: 8px; }
  #live-gemma .lg-log code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--mute, #666); }
  #live-gemma .lg-score { margin-top: 12px; font-size: 15px; }
  @media (max-width: 700px) { #live-gemma .lg-body { grid-template-columns: 1fr; } #live-gemma .lg { padding: 16px; } }`;
  document.head.appendChild(css);

  host.innerHTML = `
    <div class="lg">
      <div class="lg-head">
        <div>
          <h3>Watch live Gemma play this board</h3>
          <p class="lg-note">Gemma 4 E2B, GRPO-trained on our credit desk only; measured on Battleship: 0.39 vs reference 0.53 (60 games).
          Beliefs shown are the exact posterior of its moves. Each move is one greedy call to the model on a Modal GPU, with the
          same prompt as in our evaluation; the hidden board and the noisy reports stay in your browser.</p>
        </div>
        <div class="lg-ctl">
          <label>Model <select id="lg-variant"><option value="grpo">GRPO-trained</option><option value="base">Base (adapter off)</option></select></label>
          <button class="btn solid" id="lg-go" type="button">Watch live Gemma (GRPO) play this board</button>
          <button class="btn ghost" id="lg-stop" type="button" hidden>Stop</button>
        </div>
      </div>
      <div class="lg-body">
        <div><div class="lg-grid" id="lg-grid"></div><div class="lg-rules" id="lg-rules"></div></div>
        <div><p class="lg-status" id="lg-status">Board follows the board picker above. Budget 20: a shot costs 1, a scan 2.</p>
          <div class="lg-log" id="lg-log"></div><div class="lg-score" id="lg-score"></div></div>
      </div>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const go = $('lg-go'), stopBtn = $('lg-stop'), status = $('lg-status'), log = $('lg-log'), scoreEl = $('lg-score');
  $('lg-variant').addEventListener('change', (e) => {
    go.textContent = `Watch live Gemma (${e.target.value === 'base' ? 'base' : 'GRPO'}) play this board`;
  });

  let E = null, run = 0, warmed = false;
  const say = (t, warn = false) => { status.innerHTML = t; status.classList.toggle('warn', warn); };

  function draw(occ, rules, marks, ships, trueRule) {
    const shipCells = new Set((ships || []).flatMap((s) => s.cells.map(([r, c]) => r * 6 + c)));
    let h = '<span></span>' + 'ABCDEF'.split('').map((l) => `<span>${l}</span>`).join('');
    for (let r = 0; r < 6; r++) {
      h += `<span>${r + 1}</span>`;
      for (let c = 0; c < 6; c++) {
        const a = r * 6 + c, p = occ[a], m = marks[a] || '';
        h += `<div class="lg-c ${p < 0.4 ? 'lo' : ''} ${m} ${shipCells.has(a) ? 'ship' : ''}" style="--p:${p.toFixed(3)}" title="${cellName(a)}: ${Math.round(p * 100)}%">${m === 'hit' || m === 'miss' ? '' : Math.round(p * 100)}</div>`;
      }
    }
    $('lg-grid').innerHTML = h;
    $('lg-rules').innerHTML = E.NAMES.map((n, k) => `<div class="${trueRule === k ? 'true' : ''}"><span>${RULE_LABEL[n]}</span><u style="--p:${rules[k]}"></u><span>${Math.round(rules[k] * 100)}%</span></div>`).join('');
  }

  function board() {
    const D = window.DEMO_DATA;
    const btns = [...document.querySelectorAll('#boards button')];
    const i = Math.max(0, btns.findIndex((b) => b.classList.contains('on')));
    return { bd: D.boards[i], ix: i };
  }

  async function ask(history, variant, my) {
    // first call may hit a cold GPU: keep retrying for about 3 minutes
    const deadline = Date.now() + (warmed ? 75000 : 180000);
    let tries = 0;
    while (my === run) {
      tries++;
      if (!warmed) say(tries === 1 ? 'Asking Gemma… warming up the GPU (≈30–60 s on the first move).' : `Still warming up the GPU (attempt ${tries})…`, true);
      let res = null, body = null;
      try {
        res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history, variant }) });
        body = await res.json().catch(() => null);
      } catch (e) { res = null; }
      if (res && res.ok && body && 'action' in body) { warmed = true; return body; }
      if (res && (res.status === 400 || res.status === 413)) throw new Error(body?.error || 'request rejected');
      if (res && res.status === 429) { say('Rate limit reached (30 moves a minute); waiting…', true); await sleep(10000); }
      else if (Date.now() > deadline) throw new Error(body?.error || (res ? `HTTP ${res.status}` : 'endpoint unreachable'));
      else await sleep(res ? 2000 : 4000);
    }
    return null;
  }

  async function play() {
    const my = ++run;
    const variant = $('lg-variant').value;
    const name = variant === 'base' ? 'Gemma 4 E2B (base)' : 'Gemma 4 E2B (GRPO)';
    go.disabled = true;
    stopBtn.hidden = false;
    log.innerHTML = '';
    scoreEl.innerHTML = '';
    try {
      if (!E) { say('Loading the game engine…'); E = await import(ENGINE); E.geometry(); }
    } catch (e) {
      say(`The live player needs the hosted page. <a href="${HOSTED}">Open it here</a>.`, true);
      go.disabled = false; stopBtn.hidden = true; return;
    }
    const { bd, ix } = board();
    const belief = new E.Belief();
    const marks = {};
    const history = [];
    let spent = 0, ended = 'budget spent';
    draw(belief.occupancy(), belief.rules(), marks, null, null);
    try {
      while (spent < E.BUDGET && my === run) {
        const t0 = performance.now();
        const r = await ask(history, variant, my);
        if (!r || my !== run) return;
        const ms = Math.round(performance.now() - t0);
        const raw = r.texts && r.texts.length > 1 ? `${r.texts.join(' → retry: ')}` : r.text;
        if (r.action === 'stop') {
          log.insertAdjacentHTML('beforeend', `<div><b>${history.length + 1}</b><span>stop${r.fallback ? ' (no valid action after one retry)' : ''} <code>“${esc(raw)}”</code></span><code>${ms} ms</code></div>`);
          ended = r.fallback ? 'no valid action, stopped' : 'model chose stop';
          break;
        }
        const a = r.action, y = E.outcome(bd.layout, a, history.length, bd.u);
        belief.update(a, y);
        history.push([a, y]);
        spent += E.actionCost(a);
        if (a < 36) marks[a] = y ? 'hit' : 'miss';
        else for (let k = 0; k < 6; k++) { const c = a < 42 ? (a - 36) * 6 + k : k * 6 + (a - 42); if (!marks[c]) marks[c] = 'scan'; }
        draw(belief.occupancy(), belief.rules(), marks, null, null);
        const res = a < 36 ? (y ? 'hit' : 'miss') : `${y} ship cells`;
        log.insertAdjacentHTML('beforeend', `<div><b>${history.length}</b><span>${moveText(a)} → <b>${res}</b> <code>“${esc(raw)}”</code></span><code>${ms} ms</code></div>`);
        log.scrollTop = log.scrollHeight;
        say(`${name} on board ${ix + 1}: ${E.BUDGET - spent} of ${E.BUDGET} budget left. Last move ${ms} ms.`);
      }
    } catch (e) {
      say(`The live model is unavailable right now (${esc(e.message)}). The recorded games above still work.`, true);
      go.disabled = false; stopBtn.hidden = true; return;
    }
    if (my !== run) return;
    const rules = belief.rules(), occ = belief.occupancy();
    draw(occ, rules, marks, E.layoutShips(bd.layout), bd.rule);
    const s = E.score(rules, occ, bd.rule, bd.layout).score_raw;
    const ref = bd.runs?.reference?.score?.score_raw;
    const nScan = history.filter(([a]) => a >= 36).length;
    say(`Game over (${ended}): ${history.length} moves, ${nScan} scans, ${history.length - nScan} shots.`);
    scoreEl.innerHTML = `Score of the exact posterior after its moves: <b>${s.toFixed(2)}</b>` +
      (ref !== undefined ? ` · exact-Bayes reference on this board: <b>${ref.toFixed(2)}</b>` : '') +
      `. The rule was <b>${RULE_LABEL[E.NAMES[bd.rule]]}</b>; orange outlines are the ships.`;
    go.disabled = false;
    stopBtn.hidden = true;
  }

  go.addEventListener('click', play);
  stopBtn.addEventListener('click', () => { run++; go.disabled = false; stopBtn.hidden = true; say('Stopped.'); });
})();
