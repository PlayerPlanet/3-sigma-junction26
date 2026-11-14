/* Planning lab: replay logic, cameras and the controls overlay. Needs three.min.js,
   traces.js (window.LAB_TRACES) and scene.js (window.LabScene) loaded first. */
(function () {
  'use strict';
  const T = window.THREE, S = window.LabScene, DATA = window.LAB_TRACES;
  const $ = (id) => document.getElementById(id);
  if (!T || !S || !DATA) {
    $('fatal').hidden = false;
    $('fatal').textContent = 'The page could not load ' + (!T ? 'three.min.js' : !DATA ? 'traces.js' : 'scene.js') +
      '. Keep index.html in the same folder as its script files.';
    return;
  }
  const PAL = S.PAL, ROOM = S.ROOM;
  const WALK = 0.62;            // share of each step spent walking; the rest is the test itself
  const STEP_SECONDS = 2.8;
  const WHO = {
    agent: { label: DATA.agent_name, blurb: 'a language model with a code shell' },
    greedy: { label: 'Greedy', blurb: 'always buys the test that looks best one step ahead' },
    optimal: { label: 'Optimal', blurb: 'plans the whole budget in advance' }
  };
  const ORDER = ['agent', 'greedy', 'optimal'];

  // ---- renderer and scene -----------------------------------------------------------------
  const canvas = $('scene');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    $('fatal').hidden = false;
    $('fatal').textContent = 'This browser could not start WebGL, so the 3D lab cannot be drawn.';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const world = S.build(DATA);
  const camera = new T.PerspectiveCamera(40, 1, 0.1, 200);
  const causeIndex = {}; DATA.causes.forEach((c, i) => { causeIndex[c.name] = i; });
  const prior = DATA.causes.map((c) => c.prior);

  // path ribbon on the floor
  const MAXQ = 96;
  const ribbonGeo = new T.BufferGeometry();
  const ribbonPos = new Float32Array(MAXQ * 18);
  ribbonGeo.setAttribute('position', new T.BufferAttribute(ribbonPos, 3));
  const ribbon = new T.Mesh(ribbonGeo, new T.MeshBasicMaterial({ color: PAL.COBALT, side: T.DoubleSide }));
  ribbon.frustumCulled = false; world.scene.add(ribbon);

  // ---- state ------------------------------------------------------------------------------
  const q = new URLSearchParams(location.search);
  const st = {
    caseIdx: Math.max(0, Math.min(DATA.cases.length - 1, parseInt(q.get('case') || '0', 10) || 0)),
    who: q.get('who') || 'agent',
    t: parseFloat(q.get('t') || '0') || 0,
    playing: q.get('play') !== '0',
    speed: 1,
    reveal: q.get('reveal') === '1',
    roles: q.get('roles') === '1',
    cam: ['overview', 'walk', 'follow'].indexOf(q.get('cam')) >= 0 ? q.get('cam') : 'overview'
  };
  let track = null, legs = [], shown = prior.slice(), drawnKey = '', drawn = [], snap = true;

  const START = new T.Vector3(0, 0, 4.1), REPORT = new T.Vector3(0, 0, -4.2);
  function legPoints(a, b) {
    // straight line, with one detour point if it would cut through the reactor
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return [a, b];
    const u = Math.max(0, Math.min(1, -(a.x * dx + a.z * dz) / len2));
    let cx = a.x + dx * u, cz = a.z + dz * u;
    const d = Math.hypot(cx, cz);
    if (d >= 3.3 || u <= 0 || u >= 1) return [a, b];
    if (d < 0.05) { cx = -dz; cz = dx; }
    const k = 3.9 / Math.hypot(cx, cz);
    return [a, new T.Vector3(cx * k, 0, cz * k), b];
  }
  function alongLeg(pts, f, out) {
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); seg.push(l); total += l; }
    let d = f * total;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) {
        const k = seg[i] > 0 ? Math.min(1, d / seg[i]) : 1;
        out.pos.lerpVectors(pts[i], pts[i + 1], k);
        out.dir.subVectors(pts[i + 1], pts[i]);
        out.seg = i; return out;
      }
      d -= seg[i];
    }
    return out;
  }

  function currentCase() { return DATA.cases[st.caseIdx]; }
  function setTrack(reset) {
    const c = currentCase();
    if (!c.tracks[st.who]) st.who = c.tracks.agent ? 'agent' : 'optimal';
    track = c.tracks[st.who];
    const pts = [START].concat(track.steps.map((s) => world.stations[s.test].stand), [REPORT]);
    legs = [];
    for (let i = 1; i < pts.length; i++) legs.push(legPoints(pts[i - 1], pts[i]));
    if (reset) { st.t = 0; }
    snap = true;
    st.t = Math.min(st.t, track.steps.length + 1);
    drawnKey = '';
    $('scrub').max = String(track.steps.length + 1);
    buildTicks(); renderCompare(); syncControls();
  }

  function phase(t) {
    const N = track.steps.length;
    t = Math.max(0, t || 0);
    const end = t >= N + 1 - 1e-6;
    const seg = end ? N : Math.min(Math.floor(t), N);
    const f = end ? 1 : t - seg;
    const arrived = f >= WALK;
    return {
      N, seg, f, arrived, end,
      done: seg < N ? seg + (arrived ? 1 : 0) : N,
      answered: seg === N && arrived,
      walkF: Math.min(1, f / WALK)
    };
  }
  const pct = (p) => { const v = p * 100; return (v >= 99.5 ? Math.round(v) : v < 10 ? v.toFixed(1) : Math.round(v)) + '%'; };
  const num = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1));
  const lower = (s) => S.plain(s).toLowerCase();

  // ---- overlay: comparison, caption, controls ---------------------------------------------
  function renderCompare() {
    const c = currentCase(), rows = $('rows');
    const revealed = st.reveal || phase(st.t).end;
    rows.innerHTML = '';
    ORDER.forEach((w) => {
      const tr = c.tracks[w]; if (!tr) return;
      const row = document.createElement('tr');
      if (w === st.who) row.className = 'on';
      const kind = tr.source === 'recorded' ? 'recorded run' : (tr.same_case ? 'simulated, same case' : 'simulated, other case');
      row.innerHTML = '<th scope="row"><button type="button" title="' + WHO[w].blurb + '">' + WHO[w].label +
        '</button><small>' + kind + '</small></th><td>' + tr.n_tests + '</td><td>' + num(tr.budget_spent) +
        ' of ' + num(tr.budget) + '</td><td>' + (revealed ? pct(tr.p_true) : '<span class="hid">hidden</span>') + '</td>';
      row.querySelector('button').addEventListener('click', () => { st.who = w; setTrack(true); st.playing = true; syncControls(); });
      rows.appendChild(row);
    });
    $('note').textContent = track.note;
    compareKey = st.caseIdx + st.who + revealed;
  }
  let compareKey = '';

  function buildTicks() {
    const N = track.steps.length, box = $('ticks');
    box.innerHTML = '';
    for (let k = 1; k <= N + 1; k++) {
      const i = document.createElement('i');
      i.style.left = (k / (N + 1) * 100) + '%';
      i.textContent = k <= N ? String(k) : 'end';
      box.appendChild(i);
    }
  }
  function syncControls() {
    $('play').textContent = st.playing ? 'Pause' : (phase(st.t).end ? 'Replay' : 'Play');
    $('reveal').checked = st.reveal; $('roles').checked = st.roles;
    $('case').value = String(st.caseIdx);
    ['overview', 'walk', 'follow'].forEach((m) => { $('cam-' + m).setAttribute('aria-pressed', String(st.cam === m)); });
    document.body.dataset.cam = st.cam;
  }
  let captionKey = '';
  function renderCaption(ph) {
    const key = [st.caseIdx, st.who, ph.seg, ph.arrived, ph.end, st.reveal].join('|');
    if (key === captionKey) return; captionKey = key;
    let head, sub = '';
    const who = WHO[st.who].label;
    if (ph.seg < ph.N) {
      const s = track.steps[ph.seg], name = S.testName(s.test);
      if (ph.arrived) {
        head = 'Test ' + s.step + ' of ' + ph.N + ': ' + name + '. Reading: ' + lower(s.reading) + '.';
        sub = 'Cost ' + num(s.cost) + '. Looked worth ' + s.gain_bits.toFixed(2) + ' bits one step ahead.';
      } else {
        head = who + ' heads to ' + name + '.';
        sub = 'Cost ' + num(s.cost) + ', leaving ' + num(s.budget_left) + ' of ' + num(track.budget) + '.';
      }
    } else if (!ph.answered) {
      head = who + ' stops testing and reports its answer.';
      sub = num(track.budget - track.budget_spent) + ' of the budget is left, too little for anything useful.';
      if (track.budget - track.budget_spent < 1e-9) sub = 'The budget is spent.';
    } else {
      head = 'Final answer: ' + pct(track.p_true) + ' on the true cause' +
        ((st.reveal || ph.end) ? ', ' + lower(S.causeName(track.hidden_cause)) + '.' : '.');
      sub = 'Score ' + track.score.toFixed(2) + ' out of 1 after ' + ph.N + ' tests.';
    }
    $('cap-head').textContent = head; $('cap-sub').textContent = sub;
  }
  let pipsKey = '';
  function renderPips(left) {
    const key = left + '/' + track.budget; if (key === pipsKey) return; pipsKey = key;
    const box = $('pips'); box.innerHTML = '';
    for (let i = 0; i < track.budget; i++) {
      const b = document.createElement('b'); if (i >= Math.round(left)) b.className = 'spent'; box.appendChild(b);
    }
    $('left').textContent = num(left) + ' of ' + num(track.budget);
  }

  // ---- per-frame scene update -------------------------------------------------------------
  const tmp = { pos: new T.Vector3(), dir: new T.Vector3(), seg: 0 };
  const agentPos = new T.Vector3().copy(START);
  let agentYaw = Math.PI;
  function updateScene(dt, time) {
    const ph = phase(st.t), revealed = st.reveal || ph.end;
    // agent
    const leg = legs[ph.seg];
    const e = ph.walkF * ph.walkF * (3 - 2 * ph.walkF);
    alongLeg(leg, e, tmp);
    agentPos.copy(tmp.pos);
    let yaw = Math.atan2(tmp.dir.x, tmp.dir.z);
    if (ph.arrived) {
      if (ph.seg < ph.N) {
        const sp = world.stations[track.steps[ph.seg].test].pos;
        yaw = Math.atan2(sp.x - agentPos.x, sp.z - agentPos.z);
      } else yaw = Math.PI;
    } else if (st.t < 1e-6) yaw = Math.PI;
    let dy = yaw - agentYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    agentYaw += dy * Math.min(1, dt * 9);
    const moving = !ph.arrived && ph.walkF > 0 && ph.walkF < 1;
    world.agent.group.position.set(agentPos.x, 0, agentPos.z);
    world.agent.group.rotation.y = agentYaw;
    world.agent.body.position.y = moving ? Math.abs(Math.sin(time * 9)) * 0.07 : 0;
    world.agent.marker.position.y = 2.75 + Math.sin(time * 3) * 0.08;
    world.agent.marker.rotation.y = time * 1.5;

    // route ribbon
    let n = 0;
    const quad = (a, b) => {
      if (n >= MAXQ) return;
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz); if (l < 1e-4) return;
      const px = -dz / l * 0.09, pz = dx / l * 0.09, y = 0.03, o = n * 18;
      const v = [a.x + px, y, a.z + pz, a.x - px, y, a.z - pz, b.x + px, y, b.z + pz,
        b.x + px, y, b.z + pz, a.x - px, y, a.z - pz, b.x - px, y, b.z - pz];
      for (let i = 0; i < 18; i++) ribbonPos[o + i] = v[i];
      n++;
    };
    for (let i = 0; i < ph.seg; i++) for (let j = 1; j < legs[i].length; j++) quad(legs[i][j - 1], legs[i][j]);
    for (let j = 1; j <= tmp.seg; j++) quad(leg[j - 1], leg[j]);
    quad(leg[tmp.seg], agentPos);
    ribbonGeo.setDrawRange(0, n * 6); ribbonGeo.attributes.position.needsUpdate = true;

    // stations
    const stepOf = {}; track.steps.forEach((s) => { stepOf[s.test] = s; });
    Object.keys(world.stations).forEach((name) => {
      const sn = world.stations[name], s = stepOf[name];
      let p = 'idle', step = 0, reading = '';
      if (s && s.step <= ph.done) {
        p = (s.step === ph.done && ph.seg < ph.N && ph.arrived) ? 'active' : 'done';
        step = s.step; reading = lower(s.reading);
      }
      const key = p + step + st.roles;
      if (key !== sn.key) {
        sn.key = key;
        S.drawPlacard(sn, { phase: p, step, reading, roles: st.roles });
        sn.pad.material.color.set(p === 'idle' ? '#aab7ae' : p === 'active' ? PAL.TAPE : PAL.COBALT);
        const tinted = st.roles && (sn.role === 'control' || sn.role === 'misleading');
        sn.ring.visible = tinted;
        if (tinted) sn.ring.material.color.set(sn.role === 'control' ? PAL.TEAL : PAL.LURE);
      }
      const sc = p === 'active' ? 1.25 + Math.sin(time * 7) * 0.12 : 1;
      sn.pad.scale.set(sc, sc, 1);
      sn.sprite.position.y = sn.labelY + (p === 'active' ? 0.25 : 0);
      // placards shrink when the camera is close, so they never fill the view
      const near = Math.max(0.4, Math.min(1, camera.position.distanceTo(sn.sprite.position) / 26));
      sn.sprite.scale.set(4.2 * near, 4.2 * near * 190 / 640, 1);
      if (sn.top.userData.spin) sn.top.userData.spin.rotation.y += dt * (p === 'active' ? 14 : 2);
    });

    const sgn = world.reactor.sign, sk = Math.max(0.45, Math.min(1, camera.position.distanceTo(sgn.position) / 26));
    sgn.scale.set(4.4 * sk, 4.4 * sk * 160 / 768, 1);

    // wall display
    const target = ph.answered && track.submitted ? track.submitted
      : ph.done === 0 ? prior : track.steps[ph.done - 1].probs;
    const k = snap ? 1 : 1 - Math.exp(-dt * 6); snap = false;
    let dirty = false;
    for (let i = 0; i < shown.length; i++) {
      shown[i] += (target[i] - shown[i]) * k;
      if (Math.abs(shown[i] - target[i]) < 5e-4) shown[i] = target[i];
      if (Math.abs(shown[i] - (drawn[i] === undefined ? -1 : drawn[i])) > 0.0015) dirty = true;
    }
    const left = ph.done === 0 ? track.budget : track.steps[ph.done - 1].budget_left;
    const truth = causeIndex[track.hidden_cause];
    const whoLine = WHO[st.who].label + (track.source === 'recorded' ? ', recorded run' : ', simulated');
    let footer = 'The true cause stays hidden until the final answer.';
    if (revealed) {
      footer = 'True cause: ' + lower(S.causeName(track.hidden_cause)) + '. ' + (ph.answered
        ? 'The final answer gave it ' + pct(track.p_true) + '. Score ' + track.score.toFixed(2) + ' out of 1.'
        : 'It stands at ' + pct(target[truth]) + ' right now.');
    } else if (ph.answered) footer = 'Final answer is in. Reveal the true cause to see how it did.';
    const key = [st.caseIdx, st.who, ph.done, ph.answered, revealed].join('|');
    if (dirty || key !== drawnKey) {
      drawnKey = key; drawn = shown.slice();
      world.display.draw({
        probs: shown, truth, revealed, budgetLeft: left, testsRun: ph.done, who: whoLine, footer,
        status: ph.answered ? (track.submitted ? 'Final answer as reported' : 'Final answer')
          : ph.done === 0 ? 'Before any test' : 'After ' + ph.done + (ph.done === 1 ? ' test' : ' tests')
      });
    }
    renderCaption(ph); renderPips(left);
    if (compareKey !== st.caseIdx + st.who + revealed) renderCompare();
    return ph;
  }

  // ---- cameras ----------------------------------------------------------------------------
  const orbit = { theta: 0, phi: 0.96, r: 36.5, target: new T.Vector3(0, 3.9, 1.6) };
  const walk = { pos: new T.Vector3(-4.7, 1.7, 6.5), yaw: -0.14, pitch: 0.1 };
  const FOV = { overview: 40, walk: 62, follow: 48 };
  const follow = { pos: new T.Vector3(0, 8, 14), look: new T.Vector3(0, 2, 0), fresh: true };
  const keys = {};
  let locked = false;
  function fitOrbit() {
    const a = camera.aspect;
    orbit.rFit = Math.max(1, 1.6 / a);
  }
  function updateCamera(dt) {
    if (camera.fov !== FOV[st.cam]) { camera.fov = FOV[st.cam]; camera.updateProjectionMatrix(); }
    if (st.cam === 'overview') {
      const r = orbit.r * orbit.rFit;
      camera.position.set(
        orbit.target.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        orbit.target.y + r * Math.cos(orbit.phi),
        orbit.target.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
      camera.lookAt(orbit.target);
    } else if (st.cam === 'walk') {
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 9 : 4.2) * dt;
      const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), side = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      walk.yaw += ((keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0)) * dt * 1.8;
      if (fwd || side) {
        const l = Math.hypot(fwd, side), sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw);
        walk.pos.x += (-sy * fwd + cy * side) / l * sp;
        walk.pos.z += (-cy * fwd - sy * side) / l * sp;
        collide(walk.pos);
      }
      camera.position.copy(walk.pos);
      camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
    } else {
      const want = new T.Vector3(agentPos.x * 0.72, 9.5, agentPos.z + 12.5);
      const look = new T.Vector3(agentPos.x * 0.8, 2.4, agentPos.z - 2.5);
      const k = follow.fresh ? 1 : 1 - Math.exp(-dt * 2.2); follow.fresh = false;
      follow.pos.lerp(want, k); follow.look.lerp(look, k);
      camera.position.copy(follow.pos); camera.lookAt(follow.look);
    }
  }
  function collide(p) {
    const m = 0.7;
    p.x = Math.max(-ROOM.hx + m, Math.min(ROOM.hx - m, p.x));
    p.z = Math.max(-ROOM.hz + m, Math.min(ROOM.hz - m, p.z));
    const push = (cx, cz, r) => {
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d < r && d > 1e-5) { p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
    };
    push(0, 0, 3.0);
    Object.keys(world.stations).forEach((n) => { const s = world.stations[n].pos; push(s.x, s.z, 1.55); });
    p.x = Math.max(-ROOM.hx + m, Math.min(ROOM.hx - m, p.x));
    p.z = Math.max(-ROOM.hz + m, Math.min(ROOM.hz - m, p.z));
  }
  function setCam(m) {
    if (st.cam === 'walk' && m !== 'walk' && document.pointerLockElement) document.exitPointerLock();
    st.cam = m; follow.fresh = true; syncControls();
  }

  // pointer: drag to look (walk) or to turn the room (overview); a plain click in walk mode
  // locks the mouse, Esc releases it
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (locked || !drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    look(dx, dy, 0.005);
  });
  canvas.addEventListener('pointerup', () => {
    if (drag && drag.moved < 5 && st.cam === 'walk' && !locked && canvas.requestPointerLock) {
      const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {});
    }
    drag = null;
  });
  function look(dx, dy, k) {
    if (st.cam === 'overview') {
      orbit.theta -= dx * k * 1.2;
      orbit.phi = Math.max(0.25, Math.min(1.45, orbit.phi - dy * k));
    } else if (st.cam === 'walk') {
      walk.yaw -= dx * k * 0.6; walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch - dy * k * 0.6));
    }
  }
  document.addEventListener('mousemove', (e) => { if (locked) look(e.movementX, e.movementY, 0.0042); });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    document.body.classList.toggle('locked', locked);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (st.cam === 'overview') orbit.r = Math.max(14, Math.min(60, orbit.r * Math.exp(e.deltaY * 0.0012)));
  }, { passive: false });

  // ---- controls ---------------------------------------------------------------------------
  function stepBy(d) {
    const N = track.steps.length;
    st.t = d > 0 ? Math.min(N + 1, Math.floor(st.t + 1e-6) + 1) : Math.max(0, Math.ceil(st.t - 1e-6) - 1);
    st.playing = false; syncControls();
  }
  function togglePlay() {
    if (!st.playing && phase(st.t).end) st.t = 0;
    st.playing = !st.playing; syncControls();
  }
  $('play').addEventListener('click', togglePlay);
  $('back').addEventListener('click', () => stepBy(-1));
  $('next').addEventListener('click', () => stepBy(1));
  $('scrub').addEventListener('input', (e) => { st.t = parseFloat(e.target.value); st.playing = false; syncControls(); });
  $('speed').addEventListener('change', (e) => { st.speed = parseFloat(e.target.value); e.target.blur(); });
  $('reveal').addEventListener('change', (e) => { st.reveal = e.target.checked; e.target.blur(); });
  $('roles').addEventListener('change', (e) => { st.roles = e.target.checked; e.target.blur(); });
  ['overview', 'walk', 'follow'].forEach((m) => $('cam-' + m).addEventListener('click', (e) => { setCam(m); e.target.blur(); }));
  DATA.cases.forEach((c, i) => {
    const o = document.createElement('option'); o.value = String(i);
    o.textContent = c.label + ' (' + (c.kind === 'agent' ? 'recorded' : 'recorded, no ' + DATA.agent_name) + ')';
    $('case').appendChild(o);
  });
  $('case').addEventListener('change', (e) => {
    st.caseIdx = parseInt(e.target.value, 10); setTrack(true); st.playing = true; syncControls(); e.target.blur();
  });
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); stepBy(1); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); stepBy(-1); }
    else if (e.code === 'KeyO') setCam(st.cam === 'overview' ? 'walk' : 'overview');
    else if (e.code === 'KeyF') setCam(st.cam === 'follow' ? 'overview' : 'follow');
    else if (e.code === 'KeyR') { st.reveal = !st.reveal; syncControls(); }
    else if (st.cam !== 'walk' && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].indexOf(e.code) >= 0) setCam('walk');
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { Object.keys(keys).forEach((k) => { keys[k] = false; }); });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fitOrbit();
  }
  window.addEventListener('resize', resize);

  // ---- go ---------------------------------------------------------------------------------
  setTrack(false); resize();
  function redrawText() {
    Object.keys(world.stations).forEach((n) => { world.stations[n].key = ''; });
    world.reactor.redraw(); world.zones.forEach((z) => z.draw && z.draw()); drawnKey = '';
  }
  if (document.fonts && document.fonts.load) {
    Promise.all(['500', '600', '700', '800'].map((w) => document.fonts.load(w + ' 30px "Sofia Sans Semi Condensed"')))
      .then(redrawText, () => {});
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    if (st.playing) {
      st.t += dt * st.speed / STEP_SECONDS;
      const end = track.steps.length + 1;
      if (st.t >= end) { st.t = end; st.playing = false; syncControls(); }
    }
    $('scrub').value = String(st.t);
    updateScene(dt, now / 1000);
    updateCamera(dt);
    renderer.render(world.scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__lab = { st, world, phase: () => phase(st.t) };
})();
