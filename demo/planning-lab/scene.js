/* Planning lab: the room, the 15 test stations, the reactor, the agent and the wall display.
   Everything is built from primitives; no models or image files. Exposes window.LabScene. */
(function () {
  'use strict';
  const T = window.THREE;

  const INK = '#1d2a30', PAPER = '#f1f3ec', COBALT = '#2447d6', TAPE = '#f2b705';
  const TEAL = '#0e9c8a', LURE = '#e2562c';
  const FONT = '"Sofia Sans Semi Condensed", "Arial Narrow", "Segoe UI", sans-serif';
  const PAL = { INK, PAPER, COBALT, TAPE, TEAL, LURE, FONT };

  const TEST_NAMES = {
    hplc_reference_standard: 'HPLC reference standard',
    hplc_crude: 'HPLC: crude product',
    hplc_mother_liquor: 'HPLC: mother liquor',
    hplc_in_process: 'HPLC: in-process sample',
    hplc_aqueous_layer: 'HPLC: aqueous layer',
    catalyst_metals_assay: 'Catalyst metals assay',
    solvent_water_external_lab: 'Solvent water, external lab',
    thermocouple_audit: 'Thermocouple audit',
    lot_certificate_review: 'Lot certificate review',
    colour_check: 'Colour check',
    batch_record_review: 'Batch record review',
    stirrer_torque_log: 'Stirrer torque log',
    repeat_yield_assay: 'Repeat yield assay',
    operator_interview: 'Operator interview',
    equipment_inspection: 'Equipment inspection'
  };
  const CAUSE_NAMES = {
    catalyst_poisoned: 'Catalyst poisoned', wet_solvent: 'Wet solvent',
    temperature_excursion: 'Temperature excursion',
    degraded_starting_material: 'Degraded starting material',
    wrong_stoichiometry: 'Wrong stoichiometry', air_leak: 'Air leak',
    poor_mixing: 'Poor mixing', workup_loss: 'Lost in workup',
    premature_quench: 'Quenched too early'
  };
  function plain(s) { s = String(s).replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }
  const testName = (n) => TEST_NAMES[n] || plain(n);
  const causeName = (n) => CAUSE_NAMES[n] || plain(n);

  // ---- where the stations stand -----------------------------------------------------------
  const ROOM = { hx: 14, hz: 10, h: 11.3 };
  const LAYOUT = {
    hplc_reference_standard: [-11.7, -6, 1, 0], hplc_crude: [-11.7, -3, 1, 0],
    hplc_mother_liquor: [-11.7, 0, 1, 0], hplc_in_process: [-11.7, 3, 1, 0],
    hplc_aqueous_layer: [-11.7, 6, 1, 0],
    catalyst_metals_assay: [11.7, -5, -1, 0], solvent_water_external_lab: [11.7, 0, -1, 0],
    thermocouple_audit: [11.7, 5, -1, 0],
    batch_record_review: [-6.5, -7.8, 0, 1], lot_certificate_review: [0, -7.8, 0, 1],
    operator_interview: [6.5, -7.8, 0, 1],
    colour_check: [-7, 7.9, 0, -1], stirrer_torque_log: [-2.4, 7.9, 0, -1],
    repeat_yield_assay: [2.4, 7.9, 0, -1], equipment_inspection: [7, 7.9, 0, -1]
  };
  const ZONES = [
    { name: 'Analytical bench', x0: -13.6, x1: -8.9, z0: -8.2, z1: 8.2, lx: -11.25, lz: 8.85 },
    { name: 'Specialist tests', x0: 8.9, x1: 13.6, z0: -7.4, z1: 7.4, lx: 11.25, lz: 8.05 },
    { name: 'Records desk', x0: -8.4, x1: 8.4, z0: -9.6, z1: -5.2, lx: 3.25, lz: -4.6 },
    { name: 'Quick checks', x0: -8.6, x1: 8.6, z0: 5.3, z1: 9.75, lx: 0, lz: 9.22 }
  ];

  // ---- small helpers ----------------------------------------------------------------------
  const mats = {};
  function mat(color, opt) {
    const key = color + JSON.stringify(opt || {});
    if (!mats[key]) {
      mats[key] = new T.MeshPhongMaterial(Object.assign(
        { color: new T.Color(color), flatShading: true, shininess: 8, specular: 0x111111 }, opt || {}));
    }
    return mats[key];
  }
  function put(g, mesh, x, y, z) { mesh.position.set(x || 0, y || 0, z || 0); g.add(mesh); return mesh; }
  function box(g, w, h, d, color, x, y, z, opt) {
    return put(g, new T.Mesh(new T.BoxGeometry(w, h, d), mat(color, opt)), x, y, z);
  }
  function cyl(g, rt, rb, h, color, x, y, z, opt, seg) {
    return put(g, new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 14), mat(color, opt)), x, y, z);
  }
  function ball(g, r, color, x, y, z, opt) {
    return put(g, new T.Mesh(new T.SphereGeometry(r, 14, 10), mat(color, opt)), x, y, z);
  }
  const GLASS = { transparent: true, opacity: 0.32, flatShading: false, shininess: 60 };

  function canvasTex(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new T.CanvasTexture(c);
    tex.minFilter = T.LinearFilter; tex.generateMipmaps = false;
    return { c, ctx: c.getContext('2d'), tex };
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitText(ctx, text, maxW, size, weight) {
    do { ctx.font = weight + ' ' + size + 'px ' + FONT; size -= 2; }
    while (ctx.measureText(text).width > maxW && size > 14);
  }

  // ---- props, one per test. Built facing +z, standing on a bench top at y = 0 --------------
  function hplcStack(g, vial) {
    for (let i = 0; i < 3; i++) {
      box(g, 0.78, 0.24, 0.62, '#e7e9e2', -0.35, 0.13 + i * 0.27, 0);
      box(g, 0.16, 0.05, 0.02, i === 1 ? COBALT : '#7c8a8c', -0.55, 0.13 + i * 0.27, 0.32);
    }
    box(g, 0.78, 0.04, 0.62, '#56656a', -0.35, 0.83, 0);
    cyl(g, 0.11, 0.13, 0.34, '#b9722b', -0.52, 1.02, 0, { transparent: true, opacity: 0.85 });
    cyl(g, 0.11, 0.13, 0.34, '#cfe3ea', -0.2, 1.02, 0, GLASS);
    box(g, 0.62, 0.08, 0.34, '#56656a', 0.55, 0.04, 0.1);
    for (let i = 0; i < 4; i++) cyl(g, 0.055, 0.055, 0.26, vial, 0.34 + i * 0.14, 0.2, 0.1, null, 8);
  }
  const PROPS = {
    hplc_reference_standard(g) {
      box(g, 0.9, 0.12, 0.6, '#56656a', 0, 0.06, 0);
      cyl(g, 0.26, 0.26, 0.62, '#9a5a1c', -0.12, 0.43, 0);
      cyl(g, 0.265, 0.265, 0.26, PAPER, -0.12, 0.42, 0, { flatShading: false });
      cyl(g, 0.1, 0.2, 0.16, '#9a5a1c', -0.12, 0.82, 0);
      cyl(g, 0.12, 0.12, 0.1, INK, -0.12, 0.94, 0);
      cyl(g, 0.11, 0.11, 0.02, TAPE, -0.12, 0.44, 0.27).rotation.x = Math.PI / 2;
      for (let i = 0; i < 2; i++) cyl(g, 0.055, 0.055, 0.26, '#e9c46a', 0.3 + i * 0.14, 0.25, 0.12, null, 8);
    },
    hplc_crude(g) { hplcStack(g, '#7a4a21'); },
    hplc_mother_liquor(g) { hplcStack(g, '#e3c94f'); },
    hplc_in_process(g) { hplcStack(g, '#c0562f'); },
    hplc_aqueous_layer(g) { hplcStack(g, '#6fb7d6'); },
    catalyst_metals_assay(g) {
      box(g, 1.5, 0.78, 0.74, '#3d5059', 0.1, 0.39, 0);
      box(g, 0.44, 0.44, 0.04, '#ff9d3c', -0.3, 0.42, 0.37, { emissive: new T.Color('#ff7a1a') });
      box(g, 0.5, 0.12, 0.04, PAPER, 0.42, 0.56, 0.37);
      cyl(g, 0.12, 0.12, 0.5, '#8d9a9c', -0.3, 1.02, 0);
      cyl(g, 0.2, 0.2, 1.7, '#9aa7a4', -1.45, -0.1, 0.1);
      ball(g, 0.2, '#9aa7a4', -1.45, 0.75, 0.1);
      cyl(g, 0.07, 0.07, 0.16, TAPE, -1.45, 1.0, 0.1);
    },
    solvent_water_external_lab(g) {
      box(g, 0.95, 0.6, 0.7, '#c49a5a', -0.25, 0.3, 0);
      box(g, 0.97, 0.08, 0.72, '#8a6a3a', -0.25, 0.32, 0);
      box(g, 0.14, 0.62, 0.72, PAPER, -0.25, 0.3, 0);
      box(g, 0.56, 0.36, 0.46, '#2f7fb8', -0.2, 0.78, 0);
      box(g, 0.6, 0.06, 0.5, PAPER, -0.2, 0.99, 0);
      cyl(g, 0.12, 0.12, 0.4, '#cfe3ea', 0.6, 0.2, 0.12, GLASS);
      cyl(g, 0.06, 0.06, 0.1, INK, 0.6, 0.45, 0.12);
      box(g, 0.3, 0.02, 0.22, PAPER, 0.6, 0.011, -0.2);
    },
    thermocouple_audit(g) {
      box(g, 1.1, 1.1, 0.1, '#56656a', -0.2, 0.6, -0.3);
      const dial = cyl(g, 0.36, 0.36, 0.06, PAPER, -0.2, 0.68, -0.22, null, 20); dial.rotation.x = Math.PI / 2;
      const rim = put(g, new T.Mesh(new T.TorusGeometry(0.37, 0.04, 6, 20), mat(INK)), -0.2, 0.68, -0.2);
      rim.rotation.x = 0;
      const needle = box(g, 0.04, 0.3, 0.02, LURE, -0.12, 0.78, -0.17); needle.rotation.z = -0.6;
      box(g, 0.46, 0.3, 0.4, '#8d9a9c', 0.62, 0.15, 0.1);
      cyl(g, 0.02, 0.02, 0.9, INK, 0.62, 0.6, 0.1, null, 6);
      ball(g, 0.06, LURE, 0.62, 1.07, 0.1);
    },
    lot_certificate_review(g) {
      cyl(g, 0.42, 0.42, 1.1, '#2f6fa8', -1.5, -0.4, 0.2, null, 16);
      cyl(g, 0.44, 0.44, 0.06, '#1f4f7c', -1.5, -0.1, 0.2, null, 16);
      cyl(g, 0.44, 0.44, 0.06, '#1f4f7c', -1.5, -0.7, 0.2, null, 16);
      const sheet = box(g, 0.62, 0.02, 0.8, PAPER, 0, 0.16, 0); sheet.rotation.x = 0.35;
      box(g, 0.66, 0.04, 0.84, '#8a6a3a', 0, 0.13, -0.01).rotation.x = 0.35;
      const seal = cyl(g, 0.1, 0.1, 0.02, TAPE, 0.16, 0.12, 0.26, null, 12); seal.rotation.x = 0.35;
      box(g, 0.2, 0.06, 0.06, '#8d9a9c', 0, 0.31, -0.37);
    },
    colour_check(g) {
      box(g, 1.3, 0.9, 0.04, PAPER, 0, 0.47, -0.3);
      ['#f0dc8a', '#c9832c', '#4a2b14'].forEach((c, i) => {
        const x = -0.42 + i * 0.42;
        cyl(g, 0.05, 0.19, 0.34, c, x, 0.19, 0, { transparent: true, opacity: 0.9 }, 12);
        cyl(g, 0.05, 0.05, 0.16, '#cfe3ea', x, 0.44, 0, GLASS, 8);
      });
    },
    batch_record_review(g) {
      ['#2f6fa8', '#b23a48', '#3d5059', '#c49a5a'].forEach((c, i) => {
        box(g, 0.12, 0.56, 0.42, c, -0.7 + i * 0.14, 0.28, -0.12);
        box(g, 0.08, 0.14, 0.01, PAPER, -0.7 + i * 0.14, 0.36, 0.095);
      });
      box(g, 0.44, 0.03, 0.6, PAPER, 0.18, 0.04, 0.08).rotation.z = 0.12;
      box(g, 0.44, 0.03, 0.6, PAPER, 0.62, 0.04, 0.08).rotation.z = -0.12;
      box(g, 0.03, 0.05, 0.6, '#3d5059', 0.4, 0.03, 0.08);
      cyl(g, 0.02, 0.02, 0.4, COBALT, 0.62, 0.09, 0.1, null, 6).rotation.x = 1.3;
    },
    stirrer_torque_log(g) {
      cyl(g, 0.035, 0.035, 1.5, '#56656a', -0.5, 0.75, -0.2, null, 8);
      box(g, 0.6, 0.06, 0.5, '#56656a', -0.3, 0.03, -0.05);
      box(g, 0.6, 0.3, 0.3, '#3d5059', -0.15, 1.3, -0.05);
      cyl(g, 0.02, 0.02, 0.95, '#c7d0cf', 0, 0.7, 0, null, 6);
      const imp = new T.Group(); imp.position.set(0, 0.24, 0); g.add(imp);
      box(imp, 0.42, 0.05, 0.08, '#c7d0cf', 0, 0, 0);
      box(imp, 0.08, 0.05, 0.42, '#c7d0cf', 0, 0, 0);
      cyl(g, 0.32, 0.32, 0.56, '#cfe3ea', 0, 0.29, 0, GLASS, 16);
      cyl(g, 0.3, 0.3, 0.3, '#d9a441', 0, 0.16, 0, { transparent: true, opacity: 0.6 }, 16);
      box(g, 0.34, 0.24, 0.04, PAPER, 0.62, 0.2, 0.1).rotation.x = -0.3;
      g.userData.spin = imp;
    },
    repeat_yield_assay(g) {
      box(g, 0.8, 0.14, 0.7, '#e7e9e2', 0, 0.07, 0);
      box(g, 0.3, 0.06, 0.02, INK, 0, 0.08, 0.36);
      cyl(g, 0.2, 0.2, 0.03, '#c7d0cf', 0, 0.17, 0, null, 16);
      const pile = ball(g, 0.12, PAPER, 0, 0.2, 0); pile.scale.y = 0.5;
      box(g, 0.74, 0.6, 0.64, '#cfe3ea', 0, 0.46, 0, GLASS);
      box(g, 0.78, 0.04, 0.68, '#56656a', 0, 0.78, 0);
    },
    operator_interview(g) {
      cyl(g, 0.5, 0.5, 0.06, '#c49a5a', 0, 0.75, 0, null, 18);
      cyl(g, 0.06, 0.06, 0.75, '#56656a', 0, 0.37, 0, null, 8);
      cyl(g, 0.3, 0.3, 0.04, '#56656a', 0, 0.02, 0, null, 12);
      [-1, 1].forEach((s) => {
        cyl(g, 0.24, 0.24, 0.08, s < 0 ? COBALT : '#3d5059', s * 0.95, 0.52, 0.1, null, 14);
        cyl(g, 0.04, 0.04, 0.5, '#8d9a9c', s * 0.95, 0.25, 0.1, null, 6);
        cyl(g, 0.2, 0.2, 0.03, '#8d9a9c', s * 0.95, 0.015, 0.1, null, 10);
      });
      const hat = put(g, new T.Mesh(new T.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(TAPE)), -0.14, 0.78, 0.05);
      hat.scale.y = 0.85;
      cyl(g, 0.24, 0.24, 0.02, TAPE, -0.14, 0.79, 0.09, null, 12);
      cyl(g, 0.07, 0.06, 0.14, PAPER, 0.24, 0.85, -0.05, null, 10);
    },
    equipment_inspection(g) {
      const pipe = cyl(g, 0.16, 0.16, 1.5, '#8d9a9c', -0.1, 0.5, -0.1, null, 12); pipe.rotation.z = Math.PI / 2;
      [-0.85, -0.1, 0.65].forEach((x) => {
        const f = cyl(g, 0.27, 0.27, 0.08, '#56656a', x, 0.5, -0.1, null, 12); f.rotation.z = Math.PI / 2;
      });
      box(g, 0.08, 0.34, 0.3, '#56656a', -0.6, 0.17, -0.1);
      box(g, 0.08, 0.34, 0.3, '#56656a', 0.4, 0.17, -0.1);
      box(g, 0.5, 0.22, 0.26, '#b23a48', 0.62, 0.11, 0.3);
      box(g, 0.2, 0.05, 0.05, INK, 0.62, 0.26, 0.3);
      const lens = put(g, new T.Mesh(new T.TorusGeometry(0.13, 0.025, 6, 16), mat(INK)), -0.4, 0.05, 0.34);
      lens.rotation.x = Math.PI / 2;
      box(g, 0.24, 0.03, 0.04, INK, -0.16, 0.05, 0.44).rotation.y = -0.5;
    }
  };
  const BENCH_TINT = { analytical: '#5d7f8c', specialist: '#77688f', floor: '#6f8f6a', records: '#a8834f' };

  // ---- station placard: name, cost, and after the test its reading ------------------------
  function drawPlacard(st, state) {
    const { c, ctx, tex } = st.label;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const tint = state.roles && st.role === 'control' ? TEAL
      : state.roles && st.role === 'misleading' ? LURE : null;
    const edge = state.phase === 'idle' ? (tint || INK) : COBALT;
    rr(ctx, 6, 6, W - 12, H - 12, 22);
    ctx.fillStyle = state.phase === 'active' ? '#fff8d8' : PAPER; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = edge; ctx.stroke();
    let x = 30;
    if (state.step) {
      ctx.fillStyle = COBALT; ctx.beginPath(); ctx.arc(62, 58, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 56px ' + FONT; ctx.textAlign = 'center';
      ctx.textBaseline = 'middle'; ctx.fillText(String(state.step), 62, 61);
      x = 116;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
    fitText(ctx, st.title, W - x - 26, 60, '700');
    ctx.fillText(st.title, x, 60);
    // second line: cost pips, or the reading once the test has been run
    const y2 = 136;
    if (state.reading) {
      ctx.fillStyle = COBALT;
      fitText(ctx, 'Reading: ' + state.reading, W - 56, 50, '700');
      ctx.fillText('Reading: ' + state.reading, 30, y2);
    } else {
      ctx.fillStyle = INK; ctx.font = '600 46px ' + FONT;
      ctx.fillText('Cost', 30, y2);
      for (let i = 0; i < st.cost; i++) { ctx.fillStyle = INK; ctx.fillRect(126 + i * 42, y2 - 19, 32, 36); }
      if (tint) {
        const tag = st.role === 'control' ? 'Control test' : 'Costly lure';
        ctx.font = '700 40px ' + FONT;
        const tw = ctx.measureText(tag).width;
        rr(ctx, W - tw - 62, y2 - 27, tw + 36, 54, 27); ctx.fillStyle = tint; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(tag, W - tw - 44, y2 + 2);
      }
    }
    tex.needsUpdate = true;
  }

  function buildStation(scene, test) {
    const L = LAYOUT[test.name];
    const g = new T.Group();
    g.position.set(L[0], 0, L[1]);
    g.rotation.y = Math.atan2(L[2], L[3]);
    scene.add(g);
    const top = new T.Group(); g.add(top);
    if (test.name !== 'operator_interview') {
      box(g, 2.5, 0.84, 1.1, BENCH_TINT[test.group] || '#5d7f8c', 0, 0.42, 0);
      box(g, 2.64, 0.08, 1.22, '#d7dcd6', 0, 0.88, 0);
      box(g, 2.3, 0.1, 0.9, '#2c3a40', 0, 0.05, 0.14);
      top.position.y = 0.92;
    }
    (PROPS[test.name] || function () {})(top);

    const stand = new T.Vector3(L[0] + L[2] * 1.75, 0, L[1] + L[3] * 1.75);
    const pad = new T.Mesh(new T.CircleGeometry(0.62, 24), new T.MeshBasicMaterial({ color: '#aab7ae' }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(stand.x, 0.02, stand.z); scene.add(pad);
    const ring = new T.Mesh(new T.RingGeometry(0.72, 0.9, 28), new T.MeshBasicMaterial({ color: TEAL }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(stand.x, 0.025, stand.z); ring.visible = false;
    scene.add(ring);

    const label = canvasTex(640, 190);
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: label.tex, transparent: true }));
    const labelY = test.group === 'records' ? 2.75 : 3.3;
    sprite.scale.set(4.2, 4.2 * 190 / 640, 1);
    sprite.position.set(L[0], labelY, L[1]);
    scene.add(sprite);

    const st = {
      name: test.name, title: testName(test.name), cost: test.cost, role: test.role,
      group: g, top, stand, pad, ring, label, sprite, labelY, key: '',
      pos: new T.Vector3(L[0], 0, L[1])
    };
    return st;
  }

  // ---- the batch vessel in the middle of the room ------------------------------------------
  function buildReactor(scene) {
    const g = new T.Group(); scene.add(g);
    cyl(g, 2.5, 2.5, 0.12, '#b9c4bb', 0, 0.06, 0, null, 28);
    const tape = new T.Mesh(new T.RingGeometry(2.5, 2.68, 40), new T.MeshBasicMaterial({ color: TAPE }));
    tape.rotation.x = -Math.PI / 2; tape.position.y = 0.03; g.add(tape);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      cyl(g, 0.1, 0.1, 1.5, '#56656a', Math.cos(a) * 1.25, 0.75, Math.sin(a) * 1.25, null, 8);
    }
    const steel = { flatShading: false, shininess: 50, specular: 0x666666 };
    cyl(g, 1.45, 1.45, 2.5, '#cdd6d4', 0, 2.5, 0, steel, 24);
    cyl(g, 1.52, 1.52, 1.3, '#9fb0b0', 0, 2.2, 0, steel, 24);
    const dome = put(g, new T.Mesh(new T.SphereGeometry(1.45, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      mat('#cdd6d4', steel)), 0, 3.75, 0);
    dome.scale.y = 0.5;
    const dish = put(g, new T.Mesh(new T.SphereGeometry(1.45, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      mat('#cdd6d4', steel)), 0, 1.25, 0);
    dish.scale.y = 0.5;
    cyl(g, 0.12, 0.12, 0.7, '#56656a', 0, 0.45, 0, null, 8);
    box(g, 0.6, 0.7, 0.6, '#3d5059', 0, 4.95, 0);
    cyl(g, 0.16, 0.16, 0.5, '#8d9a9c', 0, 4.5, 0, null, 10);
    cyl(g, 0.1, 0.1, 1.2, '#8d9a9c', 0.95, 4.6, 0.3, null, 8);
    const elbow = cyl(g, 0.1, 0.1, 1.4, '#8d9a9c', 1.6, 5.15, 0.3, null, 8); elbow.rotation.z = Math.PI / 2;
    cyl(g, 0.1, 0.1, 0.9, '#8d9a9c', -0.9, 4.45, -0.4, null, 8);
    // sight glass on the south face: the batch came out at a third of the expected level
    box(g, 0.34, 1.9, 0.1, '#2c3a40', 0, 2.55, 1.5);
    box(g, 0.22, 1.74, 0.06, '#e9eeea', 0, 2.55, 1.54);
    box(g, 0.22, 0.58, 0.07, '#d9892b', 0, 1.97, 1.55, { emissive: new T.Color('#7a3d00') });
    box(g, 0.34, 0.03, 0.08, LURE, 0, 3.42, 1.56);

    const sign = canvasTex(768, 160);
    const ctx = sign.ctx;
    function draw() {
      ctx.clearRect(0, 0, 768, 160);
      rr(ctx, 5, 5, 758, 150, 20); ctx.fillStyle = INK; ctx.fill();
      ctx.fillStyle = TAPE; ctx.fillRect(5, 30, 16, 100);
      ctx.fillStyle = PAPER; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = '800 54px ' + FONT; ctx.fillText('The failed batch', 44, 56);
      ctx.font = '500 38px ' + FONT; ctx.fillText('One third of the expected yield', 44, 112);
      sign.tex.needsUpdate = true;
    }
    draw();
    const sp = new T.Sprite(new T.SpriteMaterial({ map: sign.tex, transparent: true }));
    sp.scale.set(4.4, 4.4 * 160 / 768, 1); sp.position.set(0, 6.3, 0); g.add(sp);
    return { group: g, redraw: draw, sign: sp };
  }

  // ---- room --------------------------------------------------------------------------------
  function buildRoom(scene) {
    const { hx, hz, h } = ROOM;
    const floor = new T.Mesh(new T.PlaneGeometry(hx * 2, hz * 2), mat('#c3cec5', { flatShading: false, shininess: 2 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const plinth = box(scene, hx * 2 + 0.6, 0.6, hz * 2 + 0.6, '#2c3a40', 0, -0.31, 0);
    plinth.material = mat('#2c3a40');
    const wallM = new T.MeshPhongMaterial({ color: '#e9ece4', shininess: 2 });
    const dadoM = new T.MeshBasicMaterial({ color: '#8fa39a' });
    [[0, -hz, 0, hx * 2], [0, hz, Math.PI, hx * 2], [-hx, 0, Math.PI / 2, hz * 2], [hx, 0, -Math.PI / 2, hz * 2]]
      .forEach(([x, z, ry, w]) => {
        const wall = new T.Mesh(new T.PlaneGeometry(w, h), wallM);
        wall.position.set(x, h / 2, z); wall.rotation.y = ry; scene.add(wall);
        const dado = new T.Mesh(new T.PlaneGeometry(w, 0.5), dadoM);
        dado.position.set(x - Math.sin(ry) * -0.01, 1.25, z + Math.cos(ry) * 0.01); dado.rotation.y = ry;
        scene.add(dado);
      });
    // floor joints, very light
    const jointM = new T.MeshBasicMaterial({ color: '#b5c1b8' });
    for (let x = -hx + 5; x < hx; x += 5) {
      const j = new T.Mesh(new T.PlaneGeometry(0.05, hz * 2), jointM);
      j.rotation.x = -Math.PI / 2; j.position.set(x, 0.004, 0); scene.add(j);
    }
    // zones: a tinted patch with tape corners and the zone name on the floor
    ZONES.forEach((z) => {
      const w = z.x1 - z.x0, d = z.z1 - z.z0, cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2;
      const patch = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ color: '#d2dbd2' }));
      patch.rotation.x = -Math.PI / 2; patch.position.set(cx, 0.008, cz); scene.add(patch);
      const tm = new T.MeshBasicMaterial({ color: TAPE });
      [[cx, z.z0, w, 0.12], [cx, z.z1, w, 0.12], [z.x0, cz, 0.12, d], [z.x1, cz, 0.12, d]].forEach(([x, zz, a, b]) => {
        const t = new T.Mesh(new T.PlaneGeometry(a, b), tm);
        t.rotation.x = -Math.PI / 2; t.position.set(x, 0.012, zz); scene.add(t);
      });
      const lab = canvasTex(512, 96);
      z.draw = function () {
        lab.ctx.clearRect(0, 0, 512, 96);
        lab.ctx.fillStyle = '#4d5f5c'; lab.ctx.textAlign = 'center'; lab.ctx.textBaseline = 'middle';
        lab.ctx.font = '700 60px ' + FONT; lab.ctx.fillText(z.name, 256, 50);
        lab.tex.needsUpdate = true;
      };
      z.draw();
      const m = new T.Mesh(new T.PlaneGeometry(3.7, 3.7 * 96 / 512),
        new T.MeshBasicMaterial({ map: lab.tex, transparent: true }));
      m.rotation.x = -Math.PI / 2; m.position.set(z.lx, 0.016, z.lz); scene.add(m);
    });
    // a pipe run along the top of the side walls, for scale
    [-1, 1].forEach((s) => {
      const p = cyl(scene, 0.12, 0.12, hz * 2, '#9fb0b0', s * (hx - 0.3), 7.9, 0, null, 8); p.rotation.x = Math.PI / 2;
      const q = cyl(scene, 0.08, 0.08, hz * 2, TAPE, s * (hx - 0.3), 7.5, 0, null, 8); q.rotation.x = Math.PI / 2;
    });
  }

  // ---- the agent ---------------------------------------------------------------------------
  function buildAgent(scene) {
    const g = new T.Group(); scene.add(g);
    const body = new T.Group(); g.add(body);
    cyl(body, 0.3, 0.46, 1.25, COBALT, 0, 0.82, 0, { flatShading: false }, 16);
    cyl(body, 0.31, 0.31, 0.08, PAPER, 0, 1.3, 0, { flatShading: false }, 16);
    ball(body, 0.34, PAPER, 0, 1.72, 0, { flatShading: false });
    box(body, 0.46, 0.16, 0.2, INK, 0, 1.75, 0.22);
    box(body, 0.1, 0.06, 0.02, '#7fd4ff', -0.1, 1.75, 0.33, { emissive: new T.Color('#3aa0d0') });
    box(body, 0.1, 0.06, 0.02, '#7fd4ff', 0.1, 1.75, 0.33, { emissive: new T.Color('#3aa0d0') });
    cyl(body, 0.5, 0.5, 0.06, '#1a2f8f', 0, 0.2, 0, { flatShading: false }, 16);
    const marker = new T.Mesh(new T.ConeGeometry(0.2, 0.4, 4), new T.MeshBasicMaterial({ color: TAPE }));
    marker.rotation.x = Math.PI; marker.position.y = 2.7; g.add(marker);
    const shadow = new T.Mesh(new T.CircleGeometry(0.6, 20),
      new T.MeshBasicMaterial({ color: '#1d2a30', transparent: true, opacity: 0.22 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.035; g.add(shadow);
    return { group: g, body, marker };
  }

  // ---- wall display: probability of each cause, budget, and the reveal ---------------------
  function buildDisplay(scene, data) {
    const d = canvasTex(1400, 700);
    const W = 15.2, H = 7.6, y = 7.2, z = -ROOM.hz + 0.12;
    box(scene, W + 0.5, H + 0.5, 0.16, INK, 0, y, z - 0.06);
    const screen = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshBasicMaterial({ map: d.tex }));
    screen.position.set(0, y, z + 0.04); scene.add(screen);
    const causes = data.causes.map((c) => causeName(c.name));

    function draw(v) {
      const ctx = d.ctx;
      ctx.fillStyle = PAPER; ctx.fillRect(0, 0, 1400, 700);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = INK; ctx.font = '800 58px ' + FONT;
      ctx.fillText('Probability of each cause', 44, 58);
      ctx.font = '500 34px ' + FONT; ctx.fillStyle = '#51636a';
      ctx.textAlign = 'right'; ctx.fillText(v.status, 1010, 62);
      const x0 = 410, full = 510, top = 112, rh = 54;
      ctx.strokeStyle = '#c4ccc4'; ctx.lineWidth = 2;
      [0, 0.5, 1].forEach((f) => {
        ctx.beginPath(); ctx.moveTo(x0 + full * f, top - 4); ctx.lineTo(x0 + full * f, top + rh * 9); ctx.stroke();
      });
      for (let i = 0; i < causes.length; i++) {
        const yy = top + rh * i + rh / 2, p = v.probs[i];
        const isTrue = v.revealed && i === v.truth;
        if (isTrue) { ctx.fillStyle = TAPE; ctx.fillRect(20, yy - rh / 2 + 3, 1010, rh - 6); }
        ctx.fillStyle = INK; ctx.textAlign = 'right';
        ctx.font = (isTrue ? '800' : '600') + ' 33px ' + FONT;
        ctx.fillText(causes[i], x0 - 18, yy + 1);
        ctx.fillStyle = COBALT;
        ctx.fillRect(x0, yy - 16, Math.max(3, full * p), 32);
        ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.font = '700 33px ' + FONT;
        const pct = p * 100;
        ctx.fillText((pct >= 99.5 || pct < 0.05 ? Math.round(pct) : pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '%',
          x0 + Math.max(3, full * p) + 12, yy + 1);
      }
      // right column: budget and tests
      const rx = 1070;
      ctx.fillStyle = INK; ctx.fillRect(rx - 26, 30, 3, 574);
      ctx.textAlign = 'left'; ctx.font = '700 38px ' + FONT; ctx.fillText('Budget left', rx, 58);
      ctx.font = '800 120px ' + FONT; ctx.fillText(String(Math.round(v.budgetLeft)), rx - 4, 160);
      const nw = ctx.measureText(String(Math.round(v.budgetLeft))).width;
      ctx.font = '500 38px ' + FONT; ctx.fillStyle = '#51636a';
      ctx.fillText('of ' + data.budget, rx + nw + 12, 186);
      for (let i = 0; i < data.budget; i++) {
        const bx = rx + (i % 5) * 58, by = 240 + Math.floor(i / 5) * 58;
        if (i < Math.round(v.budgetLeft)) { ctx.fillStyle = INK; ctx.fillRect(bx, by, 46, 46); }
        else { ctx.strokeStyle = '#9aa8a4'; ctx.lineWidth = 3; ctx.strokeRect(bx + 2, by + 2, 42, 42); }
      }
      ctx.fillStyle = INK; ctx.font = '700 38px ' + FONT; ctx.fillText('Tests run', rx, 410);
      ctx.font = '800 120px ' + FONT; ctx.fillText(String(v.testsRun), rx - 4, 510);
      ctx.font = '500 32px ' + FONT; ctx.fillStyle = '#51636a';
      ctx.fillText(v.who, rx, 584);
      // bottom line
      ctx.fillStyle = INK; ctx.fillRect(0, 618, 1400, 82);
      ctx.fillStyle = PAPER; ctx.textAlign = 'left';
      fitText(ctx, v.footer, 1320, 38, '600');
      ctx.fillText(v.footer, 44, 660);
      d.tex.needsUpdate = true;
    }
    return { draw };
  }

  function build(data) {
    const scene = new T.Scene();
    scene.background = new T.Color('#1f2d33');
    scene.add(new T.HemisphereLight(0xffffff, 0x9aa89c, 0.92));
    const sun = new T.DirectionalLight(0xfff4e0, 0.42); sun.position.set(8, 16, 12); scene.add(sun);
    buildRoom(scene);
    const reactor = buildReactor(scene);
    const stations = {};
    data.tests.forEach((t) => { stations[t.name] = buildStation(scene, t); });
    const agent = buildAgent(scene);
    const display = buildDisplay(scene, data);
    return { scene, stations, agent, display, reactor, zones: ZONES };
  }

  window.LabScene = { build, drawPlacard, testName, causeName, plain, ROOM, PAL };
})();
