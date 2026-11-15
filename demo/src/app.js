// Page logic for the 3-Sigma demo: intro cards, the playable sea, recorded agents, wet lab.
// Build: see demo/README.md. All numbers come from window.DEMO_DATA (scripts/build_demo_data.py).
import * as E from './engine.js';
import { Sea } from './sea.js';
import { loadShipModels } from './ships.js';

const D = window.DEMO_DATA;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v, d = 2) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const signed = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);

const RULE_LABEL = {
  any: 'Any layout', no_touch: 'No touching', parallel: 'All parallel',
  border: 'On the border', center_clear: 'Centre clear', clustered: 'Clustered',
};
const RULE_SHORT = {
  any: 'No constraint at all.',
  no_touch: 'No two ships touch, not even at a corner.',
  parallel: 'All three ships point the same way.',
  border: 'Every ship has a cell on the outer edge.',
  center_clear: 'No ship covers the four centre cells.',
  clustered: 'Every ship touches another ship.',
};
const cap = (t) => {
  const c = (t.includes(': ') ? t.split(': ').pop() : t.split('. ').pop()).replace(/\.$/, '');
  return c[0].toUpperCase() + c.slice(1) + '.';
};
const cellName = (a) => String.fromCharCode(65 + (a % 6)) + (Math.floor(a / 6) + 1);
const describe = (a, y) => {
  if (a < 36) return `Shot ${cellName(a)}: <b>${y ? 'hit' : 'miss'}</b>`;
  const l = a - 36;
  return `Scan ${l < 6 ? 'row ' + (l + 1) : 'column ' + String.fromCharCode(65 + l - 6)}: <b>${y}</b>`;
};

// ---------------------------------------------------------------- intro
const INTRO_LEAD = 1000; // ms of music before the first card; LEAD in tools/make_intro_sound.py

function intro() {
  const root = $('#intro');
  const cards = $$('.card', root);
  const bar = $('#intro-progress');
  const gate = $('#intro-gate');
  const audio = $('#intro-audio');
  const startAt = cards.map((_, i) => cards.slice(0, i).reduce((s, c) => s + +c.dataset.ms, 0));
  const total = cards.reduce((s, c) => s + +c.dataset.ms, 0);
  let ix = -1, timer = null, raf = null, fade = null;
  const fadeOut = () => {
    clearInterval(fade);
    fade = setInterval(() => {
      audio.volume = Math.max(0, audio.volume - 0.08);
      if (audio.volume <= 0) {
        clearInterval(fade);
        audio.pause();
      }
    }, 30);
  };
  // natural end: the score's last hit lands as the page appears and rings out on its own
  const finish = (natural = false) => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    root.classList.add('done');
    document.body.classList.remove('intro-on');
    $$('video', root).forEach((v) => v.pause());
    if (!natural) fadeOut();
    if (ix >= 0) askBack();
  };
  const show = (i, seek = false) => {
    clearTimeout(timer);
    if (i >= cards.length) return finish(!seek);
    ix = i;
    cards.forEach((c, j) => c.classList.toggle('on', j === i));
    const v = $('video', cards[i]);
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    if (seek) audio.currentTime = (INTRO_LEAD + startAt[i]) / 1000; // keep the score on the cuts
    const t0 = performance.now(), ms = +cards[i].dataset.ms;
    const tick = () => {
      bar.style.width = `${Math.min(100, ((startAt[i] + performance.now() - t0) / total) * 100)}%`;
      raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf);
    tick();
    timer = setTimeout(() => show(i + 1), ms);
  };
  // phones: ask for landscape for the cards, then for upright again once the page shows
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  const portrait = () => window.innerHeight > window.innerWidth;
  const back = $('#rotate-back');
  let upright = false, backTimer = null;
  const askRotate = () => gate.classList.toggle('rotate', phone && portrait() && !upright && !gate.classList.contains('off'));
  const askBack = () => {
    if (!phone || portrait()) return;
    back.classList.add('on');
    clearTimeout(backTimer);
    backTimer = setTimeout(() => back.classList.remove('on'), 8000);
  };
  window.addEventListener('resize', () => {
    askRotate();
    if (portrait()) back.classList.remove('on');
  });
  $('#intro-upright').addEventListener('click', (e) => {
    e.stopPropagation();
    upright = true;
    askRotate();
  });
  const begin = () => {
    gate.classList.add('off');
    gate.classList.remove('rotate');
    clearInterval(fade);
    audio.volume = 1;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    clearTimeout(timer);
    timer = setTimeout(() => show(0), INTRO_LEAD); // the music leads, then the first picture
  };
  const open = (withGate) => {
    root.classList.remove('done');
    document.body.classList.add('intro-on');
    window.scrollTo(0, 0);
    cards.forEach((c) => c.classList.remove('on'));
    bar.style.width = '0';
    ix = -1;
    if (withGate) {
      gate.classList.remove('off');
      askRotate();
    } else begin();
  };
  $('#intro-start').addEventListener('click', (e) => {
    e.stopPropagation();
    begin();
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('button') || !gate.classList.contains('off') || ix < 0) return;
    show(ix + 1, true);
  });
  $('#intro-skip').addEventListener('click', () => finish());
  $('#intro-mute').addEventListener('click', (e) => {
    audio.muted = !audio.muted;
    e.target.textContent = audio.muted ? 'Sound off' : 'Sound on';
    e.target.setAttribute('aria-pressed', audio.muted);
  });
  document.addEventListener('keydown', (e) => {
    if (root.classList.contains('done')) return;
    if (e.key === 'Escape') return finish();
    if (e.key !== ' ' && e.key !== 'ArrowRight' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!gate.classList.contains('off')) {
      if (!gate.classList.contains('rotate')) begin();
    } else if (ix >= 0) show(ix + 1, true);
  });
  $('#replay-intro').addEventListener('click', () => open(false));
  if (location.hash && location.hash !== '#top') {
    gate.classList.add('off');
    finish();
  } else open(true);
}

// ---------------------------------------------------------------- static sections
function facts() {
  const cal = D.calibration.policies;
  const loss = cal.noise_ignoring_coder.inference;
  const items = [
    ...D.headline,
    {
      value: fmt(loss), versus: null,
      text: 'Lost by an agent that takes noisy reports as exact.',
      source: `results/battleship_calibration.json, ${D.calibration.seeds} paired boards`,
    },
  ];
  $('#facts').innerHTML = items.map((f) =>
    `<div class="fact reveal" title="Source: ${f.source}"><b>${f.value}${f.versus !== null && f.versus !== undefined ? `<small>vs ${f.versus}</small>` : ''}</b><p>${f.short || f.text}</p></div>`).join('');
}

function wetlab() {
  const rows = [
    ['Wet lab', 'Rulebound Battleship'],
    ['Hidden reaction mechanism', 'Hidden placement rule (6, uniform prior)'],
    ['Rate constants', `Exact ship positions (${D.constants.L.toLocaleString('en-US')} layouts)`],
    ['Running an assay', 'A shot (cost 1) or a scan (cost 2)'],
    ['Assay noise', 'Flipped reports and off-by-one counts'],
    ['Limited stock of reagents', `Budget of ${D.constants.budget}`],
    ['Posterior over mechanisms', 'Probability per rule and per cell'],
  ];
  $('#map').innerHTML = rows.map((r, i) => r.map((c) => `<div class="${i ? '' : 'h'}">${c}</div>`).join('')).join('');
  const W = D.wetlab;
  const a = W.action;
  $('#wet-caption').textContent = `Product over ${W.mechanisms[0].t.at(-1)} minutes, 14 simulated vessels each, same run design.`;
  const ymax = Math.max(...W.mechanisms.flatMap((m) => m.P.flat()));
  const w = 200, h = 130;
  $('#curves').innerHTML = W.mechanisms.map((m) => {
    const tmax = m.t.at(-1);
    const lines = m.P.map((row) =>
      `<polyline fill="none" stroke="#0b0c0e" stroke-opacity="0.38" stroke-width="1" points="${row.map((v, i) => `${((m.t[i] / tmax) * w).toFixed(1)},${(h - (v / ymax) * (h - 6)).toFixed(1)}`).join(' ')}"/>`).join('');
    return `<div class="curve"><h4>${m.name.replace('_', ' ')}</h4><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Product over time, ${m.name}"><line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#0b0c0e" stroke-opacity="0.3"/>${lines}</svg></div>`;
  }).join('');

  const T = D.llm.transfer;
  const arms = T ? T.arms : [{ name: 'Base model' }, { name: 'Control' }, { name: 'RL on Battleship' }];
  const top = T ? Math.max(...arms.map((x) => x.hi ?? x.mean)) : 1;
  $('#transfer').innerHTML = arms.map((x, i) => T
    ? `<div class="bar real ${i === arms.length - 1 ? 'hi' : ''}"><em>${x.mean.toFixed(2)}</em><i style="height:${(x.mean / top) * 82}%"></i><span>${x.name}</span></div>`
    : `<div class="bar"><em>not yet measured</em><i style="height:46%"></i><span>${x.name}</span></div>`).join('');
  $('#transfer-note').innerHTML = T ? `Mean design reward on ${T.rows} wet-lab rows.` : '<b>Not yet run.</b> The bars stay empty until it is.';
  $('#foot-note').textContent = D.llm.base ? '' : 'The agent shown is a labelled proxy until model runs land.';
}

// ---------------------------------------------------------------- the stage
class Panel {
  constructor(el, interactive) {
    this.el = el;
    this.sea = new Sea($('.sea-host', el), { interactive });
    this.foot = $('.panel-foot', el);
    this.log = [];
  }

  header(who, tag = '', pending = false) {
    $('.who', this.el).textContent = who;
    const t = $('.tag', this.el);
    t.textContent = tag;
    t.classList.toggle('pending', pending);
  }

  budget(left) {
    $('.budget i', this.el).style.setProperty('--left', left / E.BUDGET);
    $('.budget b', this.el).textContent = `${left} left`;
  }

  reset() {
    this.sea.reset();
    this.sea.setBelief(D.constants.p0, true);
    this.log = [];
    this.rules = null;
    this.trueRule = null;
    this.note = '';
    this.budget(E.BUDGET);
    this.draw();
  }

  apply(a, y, occ, rules) {
    if (a < 36) this.sea.showFire(a, y);
    else this.sea.showScan(a - 36, y);
    this.sea.setBelief(occ);
    this.log.push(describe(a, y));
    if (rules) this.rules = rules;
    this.draw();
  }

  draw() {
    const log = this.log.length
      ? this.log.slice(-1).map((l, i, arr) => `<div style="opacity:${0.5 + (0.5 * (i + 1)) / arr.length}">${l}</div>`).join('')
      : '';
    const bars = this.rules
      ? `<div class="rulebars">${E.NAMES.map((n, k) => `<div class="${this.trueRule === k ? 'true' : ''}"><span>${RULE_LABEL[n]}</span><u style="--p:${this.rules[k]}"></u><span>${Math.round(this.rules[k] * 100)}%</span></div>`).join('')}</div>`
      : '';
    this.foot.innerHTML = `<div class="log">${log}</div>${bars}`;
  }
}

function stage() {
  const A = new Panel($('#panelA'), true);
  const B = new Panel($('#panelB'), false);
  const controls = $('#controls');
  const results = $('#results');
  let mode = 'play', boardIx = 0, token = 0;
  const arena = $('#arena');
  const sw = $$('#viewswitch button');
  const view = (which) => {
    arena.dataset.show = which;
    sw.forEach((b) => b.classList.toggle('on', b.dataset.show === which));
  };
  const viewLabels = (a, b) => {
    sw[0].textContent = a;
    sw[1].textContent = b;
  };
  sw.forEach((b) => b.addEventListener('click', () => view(b.dataset.show)));
  let human, agentK, agentSpent, busy, replay;

  const board = () => D.boards[boardIx];
  const agentRun = () => D.llm.base?.games?.[board().seed] ?? board().runs.coder;
  const agentName = () => D.llm.base?.label ?? 'Agent';
  const tunedRun = () => D.llm.tuned?.games?.[board().seed] ?? null;

  $('#boards').innerHTML = 'Board ' + D.boards.map((b, i) => `<button type="button" data-i="${i}">${i + 1}</button>`).join('');
  $$('#boards button').forEach((b) => b.addEventListener('click', () => {
    boardIx = +b.dataset.i;
    start();
  }));
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    mode = t.dataset.mode;
    start();
  }));
  $('a[href="#rl"]').addEventListener('click', (e) => {
    e.preventDefault();
    mode = 'rl';
    start();
    $('#play').scrollIntoView({ behavior: 'smooth' });
  });

  function start() {
    token++;
    busy = false;
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.mode === mode));
    $$('#boards button').forEach((b, i) => b.classList.toggle('on', i === boardIx));
    results.hidden = true;
    results.innerHTML = '';
    A.reset();
    B.reset();
    view('a');
    if (mode === 'play') startPlay();
    else startReplay();
  }

  // ---- recorded player on a panel
  function stepRecorded(panel, run, k) {
    const a = run.actions[k], y = run.results[k], b = run.beliefs[k + 1];
    panel.apply(a, y, b.occ, b.rules);
    return E.actionCost(a);
  }
  const spentAfter = (run, k) => run.actions.slice(0, k).reduce((s, a) => s + E.actionCost(a), 0);

  // ---- mode 1: you vs the agent
  function startPlay() {
    human = { belief: new E.Belief(), spent: 0, i: 0 };
    agentK = 0;
    agentSpent = 0;
    A.sea.interactive = true;
    A.sea.locked = false;
    A.header('You');
    A.draw();
    B.header(agentName(), D.llm.base ? '' : 'proxy');
    B.rules = agentRun().beliefs[0].rules;
    B.note = 'Plays the same hidden board, shot for shot with your budget.';
    B.draw();
    A.sea.onAction = humanAction;
    viewLabels('Your board', `Watch the ${D.llm.base ? 'model' : 'agent'}`);
    playControls();
  }

  function playControls() {
    const left = E.BUDGET - human.spent;
    controls.innerHTML = `
      <p class="hint">${left > 0 ? 'Pick a cell to fire (1). Arrows scan a line (2).' : 'Budget spent.'}</p>
      <button class="btn ghost" id="bayes" type="button" ${left > 0 ? '' : 'disabled'}>Play the Bayes move</button>
      <button class="btn solid" id="tosubmit" type="button">${left > 0 ? 'Stop and submit' : 'Submit beliefs'}</button>`;
    $('#bayes').addEventListener('click', () => {
      const left2 = E.BUDGET - human.spent;
      if (left2 > 0 && !busy) humanAction(E.greedyAction(human.belief, left2));
    });
    $('#tosubmit').addEventListener('click', guessForm);
  }

  async function humanAction(a) {
    const left = E.BUDGET - human.spent, cost = E.actionCost(a);
    if (busy || cost > left) return;
    const my = token;
    busy = true;
    const y = E.outcome(board().layout, a, human.i, board().u);
    human.belief.update(a, y);
    human.spent += cost;
    human.i++;
    A.apply(a, y, human.belief.occupancy(), null);
    A.budget(E.BUDGET - human.spent);
    await agentCatchUp(human.spent, my);
    if (my !== token) return;
    busy = false;
    playControls();
    if (human.spent >= E.BUDGET) guessForm();
  }

  async function agentCatchUp(upTo, my) {
    const run = agentRun();
    while (agentK < run.actions.length && agentSpent < upTo) {
      await sleep(380);
      if (my !== token) return;
      agentSpent += stepRecorded(B, run, agentK++);
      B.budget(E.BUDGET - agentSpent);
    }
  }

  function guessForm() {
    A.sea.locked = true;
    let pick = null, conf = 0.5;
    controls.innerHTML = `
      <div class="guess">
        <div>
          <h3>Which rule placed the ships?</h3>
          
          <div class="chips">${E.NAMES.map((n, k) => `<button class="chip" type="button" data-k="${k}">${RULE_LABEL[n]}<small>${RULE_SHORT[n]}</small></button>`).join('')}</div>
        </div>
        <div class="conf">
          <label><span>Confidence</span><b id="confv">50%</b></label>
          <input id="conf" type="range" min="17" max="99" value="50" aria-label="Confidence in your rule">
          <button class="btn solid" id="reveal" type="button" disabled>Reveal the board</button>
          ${human.spent < E.BUDGET ? '<button class="btn ghost" id="back" type="button">Keep playing</button>' : ''}
        </div>
      </div>`;
    $$('.chip').forEach((c) => c.addEventListener('click', () => {
      pick = +c.dataset.k;
      $$('.chip').forEach((x) => x.classList.toggle('on', x === c));
      $('#reveal').disabled = false;
    }));
    $('#conf').addEventListener('input', (e) => {
      conf = +e.target.value / 100;
      $('#confv').textContent = `${e.target.value}%`;
    });
    $('#back')?.addEventListener('click', () => {
      A.sea.locked = false;
      playControls();
    });
    $('#reveal').addEventListener('click', () => finishPlay(pick, conf));
  }

  async function finishPlay(pick, conf) {
    const my = token, bd = board(), run = agentRun();
    controls.innerHTML = '';
    busy = true;
    await agentCatchUp(E.BUDGET, my);
    if (my !== token) return;
    const occ = human.belief.occupancy(), exactRules = human.belief.rules();
    const mine = E.score(E.guessToRules(pick, conf), occ, bd.rule, bd.layout);
    const design = E.score(exactRules, occ, bd.rule, bd.layout).score_raw;
    const you = { ...mine, design, inference: mine.score_raw - design };
    const ships = E.layoutShips(bd.layout);
    A.rules = exactRules;
    A.trueRule = B.trueRule = bd.rule;
    A.log.push(`You said <b>${RULE_LABEL[E.NAMES[pick]]}</b> at ${Math.round(conf * 100)}%`);
    A.draw();
    B.draw();
    A.sea.reveal(ships);
    B.sea.reveal(ships);
    const ag = run.score, ref = bd.runs.reference.score;
    const truth = RULE_LABEL[E.NAMES[bd.rule]];
    const why = ag.inference < -0.15 ? `The agent lost ${fmt(Math.abs(ag.inference))} by trusting noisy reports.` : 'Here the noise did not mislead the agent.';
    const lead = you.score_raw > ag.score_raw ? `You beat the agent, ${fmt(you.score_raw)} to ${fmt(ag.score_raw)}.` : `The agent beat you, ${fmt(ag.score_raw)} to ${fmt(you.score_raw)}.`;
    results.hidden = false;
    results.innerHTML = `
      <div class="scores">
        ${scoreCard('You', you, true, 'Your shots, scored with exact inference on the cells, plus your rule call.')}
        ${scoreCard(agentName() + (D.llm.base ? '' : ' (proxy)'), ag, false)}
        ${scoreCard('Exact-Bayes reference', ref, false)}
      </div>
      <div class="verdict">
        <p><b>${lead}</b> The rule was <b>${truth}</b>. ${why}</p>
        <div class="player">
          <button class="btn ghost" id="next" type="button">Next board</button>
          <button class="btn solid" id="torl" type="button">See the RL-tuned agent</button>
        </div>
      </div>`;
    controls.innerHTML = '';
    $('#next').addEventListener('click', () => {
      boardIx = (boardIx + 1) % D.boards.length;
      start();
    });
    $('#torl').addEventListener('click', () => {
      mode = 'rl';
      start();
    });
  }

  function scoreCard(label, s, lead, extra = '') {
    return `<div class="score ${lead ? 'lead' : ''}"><span class="lbl">${label}</span><b>${fmt(s.score_raw)}</b>
      <p class="parts">Experiments ${signed(s.design)} · beliefs ${Math.abs(s.inference) < 0.005 ? '±0.00' : `<em>${signed(s.inference)}</em>`}</p></div>`;
  }

  // ---- mode 2: agent vs RL-tuned agent, both recorded
  function startReplay() {
    const bd = board();
    const base = agentRun(), tuned = tunedRun();
    const right = tuned ?? bd.runs.reference;
    replay = { k: 0, playing: false, runs: [base, right], done: false };
    A.sea.interactive = false;
    A.sea.onAction = null;
    A.header(`${agentName()}, out of the box`, D.llm.base ? '' : 'proxy');
    A.rules = base.beliefs[0].rules;
    A.note = 'The same agent you just played against.';
    A.draw();
    B.header(tuned ? D.llm.tuned.label : 'After RL on this reward', tuned ? '' : 'not yet measured', !tuned);
    B.rules = right.beliefs[0].rules;
    B.note = tuned ? 'Same model after RL on the exact reward.' : 'Showing the exact-Bayes reference: the play this reward trains toward. No tuned model has been run yet.';
    B.draw();
    viewLabels('Out of the box', tuned ? 'RL-tuned' : 'Reference');
    replayControls();
  }

  function replayControls() {
    controls.innerHTML = `
      <p class="hint">Same board, same noise, same budget.</p>
      <button class="btn ghost" id="step" type="button">Step</button>
      <button class="btn solid" id="playpause" type="button">${replay.playing ? 'Pause' : 'Play'}</button>`;
    $('#step').addEventListener('click', () => {
      replay.playing = false;
      replayStep();
      replayControls();
    });
    $('#playpause').addEventListener('click', async () => {
      replay.playing = !replay.playing;
      replayControls();
      const my = token;
      while (replay.playing && !replay.done && my === token) {
        replayStep();
        await sleep(950);
      }
    });
  }

  function replayStep() {
    if (replay.done) return;
    const [ra, rb] = replay.runs;
    const k = replay.k++;
    // advance by budget, so both sides have spent the same when their step sizes differ
    const target = Math.min(E.BUDGET, Math.max(spentAfter(ra, replay.ka || 0), spentAfter(rb, replay.kb || 0)) + 1);
    replay.ka = replay.ka || 0;
    replay.kb = replay.kb || 0;
    while (replay.ka < ra.actions.length && spentAfter(ra, replay.ka) < target) stepRecorded(A, ra, replay.ka++);
    while (replay.kb < rb.actions.length && spentAfter(rb, replay.kb) < target) stepRecorded(B, rb, replay.kb++);
    A.budget(E.BUDGET - spentAfter(ra, replay.ka));
    B.budget(E.BUDGET - spentAfter(rb, replay.kb));
    if (replay.ka >= ra.actions.length && replay.kb >= rb.actions.length) finishReplay(k);
  }

  function finishReplay() {
    replay.done = true;
    replay.playing = false;
    const bd = board(), [ra, rb] = replay.runs, tuned = tunedRun();
    const ships = E.layoutShips(bd.layout);
    A.trueRule = B.trueRule = bd.rule;
    A.draw();
    B.draw();
    A.sea.reveal(ships);
    B.sea.reveal(ships);
    const gain = rb.score.score_raw - ra.score.score_raw;
    results.hidden = false;
    results.innerHTML = `
      <div class="scores">
        ${scoreCard(agentName() + (D.llm.base ? ', base' : ' (proxy)'), ra.score, false)}
        ${scoreCard(tuned ? D.llm.tuned.label : 'Exact-Bayes reference', rb.score, true)}
        <div class="score"><span class="lbl">${tuned ? 'Gain from RL' : 'Headroom for RL'}</span><b>${signed(gain)}</b>
          <p class="parts">${tuned ? 'Same board, same noise.' : 'Gap to exact play on this board.'}</p></div>
      </div>
      <div class="verdict">
        <p>${tuned ? '' : '<b>Right side is the reference, not a trained model yet.</b> '}The rule was <b>${RULE_LABEL[E.NAMES[bd.rule]]}</b>.</p>
        <div class="player">
          <button class="btn ghost" id="again" type="button">Next board</button>
          <a class="btn solid" href="#wetlab">Does it transfer?</a>
        </div>
      </div>`;
    controls.innerHTML = '';
    $('#again').addEventListener('click', () => {
      boardIx = (boardIx + 1) % D.boards.length;
      start();
    });
  }

  start();
  window.__demo = { A, B, humanAction, get mode() { return mode; }, setMode(m) { mode = m; start(); } };
}

// ---------------------------------------------------------------- boot
function reveals() {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }), { threshold: 0.12 });
  $$('.reveal').forEach((el) => io.observe(el));
}

facts();
wetlab();
intro();
reveals();
// the geometry enumeration takes a moment; do it after first paint
requestAnimationFrame(() => setTimeout(async () => {
  E.geometry();
  await loadShipModels();
  stage();
}, 30));
