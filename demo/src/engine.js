// Rulebound Battleship in the browser: a line-for-line port of bayesenv/battleship.py.
// Same layout order, same noise model, same exact posterior and score. Checked against the
// Python engine by `node demo/src/verify.mjs` (test vectors in demo/data.js).

export const N = 6;
export const SHIPS = [4, 3, 2];
export const FIRE_NOISE = 0.1;
export const SCAN_NOISE = [0.15, 0.7, 0.15]; // -1, 0, +1
export const BUDGET = 20;
export const EPS = 1e-3;
export const NAMES = ['any', 'no_touch', 'parallel', 'border', 'center_clear', 'clustered'];
export const K = NAMES.length;
export const N_CELLS = N * N;
export const N_LINES = 2 * N;
export const N_ACTIONS = N_CELLS + N_LINES;

const h2 = (p) => {
  p = Math.min(Math.max(p, 1e-15), 1 - 1e-15);
  return -(p * Math.log(p) + (1 - p) * Math.log1p(-p));
};

export const actionCost = (a) => (a < N_CELLS ? 1 : 2);
export const actionInfo = (a) =>
  a < N_CELLS
    ? { type: 'fire', row: Math.floor(a / N), col: a % N }
    : { type: 'scan', axis: a - N_CELLS < N ? 'row' : 'col', index: (a - N_CELLS) % N };

let G = null;

export function geometry() {
  if (G) return G;
  const placements = SHIPS.map((length) => {
    const ps = [];
    for (const horiz of [1, 0])
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const cells = [];
          let ok = true;
          for (let i = 0; i < length; i++) {
            const a = horiz ? r : r + i;
            const b = horiz ? c + i : c;
            if (a >= N || b >= N) ok = false;
            cells.push([a, b]);
          }
          if (ok) ps.push({ horiz, cells });
        }
    return ps;
  });
  const mask = (cells, dilate) => {
    let m = 0n;
    const ds = dilate ? [-1, 0, 1] : [0];
    for (const [a, b] of cells)
      for (const da of ds)
        for (const db of ds) {
          const x = a + da, y = b + db;
          if (x >= 0 && x < N && y >= 0 && y < N) m |= 1n << BigInt(x * N + y);
        }
    return m;
  };
  const centre = new Set([14, 15, 20, 21]);
  const P = placements.map((ps) =>
    ps.map((p) => ({
      m: mask(p.cells, false),
      d: mask(p.cells, true),
      h: p.horiz,
      edge: p.cells.some(([a, b]) => a === 0 || a === N - 1 || b === 0 || b === N - 1),
      cen: p.cells.some(([a, b]) => centre.has(a * N + b)),
      idx: p.cells.map(([a, b]) => a * N + b),
    })),
  );
  const ships = [];
  const memberRows = NAMES.map(() => []);
  for (let i = 0; i < P[0].length; i++)
    for (let j = 0; j < P[1].length; j++) {
      const A = P[0][i], B = P[1][j];
      if (A.m & B.m) continue;
      for (let k = 0; k < P[2].length; k++) {
        const C = P[2][k];
        if (A.m & C.m || B.m & C.m) continue;
        const t01 = (A.d & B.m) !== 0n, t02 = (A.d & C.m) !== 0n, t12 = (B.d & C.m) !== 0n;
        ships.push([i, j, k]);
        memberRows[0].push(1);
        memberRows[1].push(!(t01 || t02 || t12) ? 1 : 0);
        memberRows[2].push(A.h === B.h && B.h === C.h ? 1 : 0);
        memberRows[3].push(A.edge && B.edge && C.edge ? 1 : 0);
        memberRows[4].push(!(A.cen || B.cen || C.cen) ? 1 : 0);
        memberRows[5].push((t01 || t02) && (t01 || t12) && (t02 || t12) ? 1 : 0);
      }
    }
  const L = ships.length;
  const occ = new Uint8Array(L * N_CELLS);
  const lines = new Uint8Array(N_LINES * L);
  for (let l = 0; l < L; l++) {
    const [i, j, k] = ships[l];
    for (const c of [...P[0][i].idx, ...P[1][j].idx, ...P[2][k].idx]) {
      occ[l * N_CELLS + c] = 1;
      lines[Math.floor(c / N) * L + l]++;
      lines[(N + (c % N)) * L + l]++;
    }
  }
  const member = memberRows.map((r) => Uint8Array.from(r));
  const nRule = member.map((m) => m.reduce((s, v) => s + v, 0));
  const w0 = new Float64Array(L);
  for (let k = 0; k < K; k++) {
    const v = 1 / (K * nRule[k]);
    const m = member[k];
    for (let l = 0; l < L; l++) if (m[l]) w0[l] += v;
  }
  const p0 = new Float64Array(N_CELLS);
  for (let l = 0; l < L; l++) {
    const w = w0[l], o = l * N_CELLS;
    for (let c = 0; c < N_CELLS; c++) if (occ[o + c]) p0[c] += w;
  }
  let cellNorm = 0;
  for (let c = 0; c < N_CELLS; c++) cellNorm += h2(p0[c]);
  const scanT = [];
  const scanH = [];
  for (let kk = 0; kk <= N; kk++) {
    const row = new Float64Array(N + 1);
    [-1, 0, 1].forEach((d, i) => {
      row[Math.min(Math.max(kk + d, 0), N)] += SCAN_NOISE[i];
    });
    scanT.push(row);
    scanH.push(-row.reduce((s, t) => s + (t > 0 ? t * Math.log(t) : 0), 0));
  }
  G = { placements, P, ships, L, occ, lines, member, nRule, w0, p0, cellNorm, scanT, scanH };
  return G;
}

export function layoutShips(li) {
  const g = geometry();
  return g.ships[li].map((pi, s) => ({
    length: SHIPS[s],
    horiz: !!g.P[s][pi].h,
    cells: g.placements[s][pi].cells,
  }));
}

// The environment's reply to action `a` taken as the i-th action, given the board's noise draws.
export function outcome(layout, a, i, u) {
  const g = geometry();
  if (a < N_CELLS) return g.occ[layout * N_CELLS + a] ^ (u[i] < FIRE_NOISE ? 1 : 0);
  const k = g.lines[(a - N_CELLS) * g.L + layout];
  const d = u[i] < SCAN_NOISE[0] ? -1 : u[i] < SCAN_NOISE[0] + SCAN_NOISE[1] ? 0 : 1;
  return Math.min(Math.max(k + d, 0), N);
}

export class Belief {
  constructor() {
    this.g = geometry();
    this.ll = new Float64Array(this.g.L);
    this.obs = [];
    this._w = null;
  }

  update(a, y) {
    const g = this.g, ll = this.ll, L = g.L;
    if (a < N_CELLS) {
      const yes = Math.log1p(-FIRE_NOISE), no = Math.log(FIRE_NOISE);
      for (let l = 0; l < L; l++) ll[l] += g.occ[l * N_CELLS + a] === y ? yes : no;
    } else {
      const off = (a - N_CELLS) * L;
      const lg = g.scanT.map((row) => (row[y] > 0 ? Math.log(row[y]) : -Infinity));
      for (let l = 0; l < L; l++) ll[l] += lg[g.lines[off + l]];
    }
    this.obs.push([a, y]);
    this._w = null;
  }

  _A() {
    const ll = this.ll, L = this.g.L;
    let m = -Infinity;
    for (let l = 0; l < L; l++) if (ll[l] > m) m = ll[l];
    const A = new Float64Array(L);
    for (let l = 0; l < L; l++) A[l] = Math.exp(ll[l] - m);
    return A;
  }

  layoutWeights() {
    if (this._w) return this._w;
    const A = this._A(), w0 = this.g.w0, L = this.g.L;
    let s = 0;
    for (let l = 0; l < L; l++) {
      A[l] *= w0[l];
      s += A[l];
    }
    for (let l = 0; l < L; l++) A[l] /= s;
    this._w = A;
    return A;
  }

  rules() {
    const A = this._A(), g = this.g;
    const s = g.member.map((m, k) => {
      let t = 0;
      for (let l = 0; l < g.L; l++) if (m[l]) t += A[l];
      return t / g.nRule[k];
    });
    const z = s.reduce((a, b) => a + b, 0);
    return s.map((v) => v / z);
  }

  occupancy() {
    const w = this.layoutWeights(), g = this.g;
    const p = new Float64Array(N_CELLS);
    for (let l = 0; l < g.L; l++) {
      const wl = w[l];
      if (wl === 0) continue;
      const o = l * N_CELLS;
      for (let c = 0; c < N_CELLS; c++) if (g.occ[o + c]) p[c] += wl;
    }
    return Array.from(p, (v) => Math.min(Math.max(v, 0), 1));
  }

  // Expected information gain (nats) about the hidden state, for all 48 actions.
  eig() {
    const g = this.g, w = this.layoutWeights();
    const p = this.occupancy();
    const e = FIRE_NOISE;
    const out = new Float64Array(N_ACTIONS);
    for (let c = 0; c < N_CELLS; c++) out[c] = h2((1 - e) * p[c] + e * (1 - p[c])) - h2(e);
    for (let li = 0; li < N_LINES; li++) {
      const P = new Float64Array(N + 1);
      const off = li * g.L;
      for (let l = 0; l < g.L; l++) P[g.lines[off + l]] += w[l];
      let Hy = 0, cond = 0;
      for (let y = 0; y <= N; y++) {
        let py = 0;
        for (let k = 0; k <= N; k++) py += P[k] * g.scanT[k][y];
        if (py > 0) Hy -= py * Math.log(py);
      }
      for (let k = 0; k <= N; k++) cond += P[k] * g.scanH[k];
      out[N_CELLS + li] = Hy - cond;
    }
    return out;
  }
}

// The reference's design rule: the affordable action with the most information per shot.
export function greedyAction(belief, remaining) {
  const eig = belief.eig();
  let best = -1, bv = -Infinity;
  for (let a = 0; a < N_ACTIONS; a++) {
    const c = actionCost(a);
    if (c > remaining) continue;
    const v = eig[a] / c;
    if (v > bv) {
      bv = v;
      best = a;
    }
  }
  return best;
}

export function rulePart(q, rule) {
  const qm = (1 - EPS) * q[rule] + EPS / K;
  return (Math.log(qm) - Math.log(1 / K)) / Math.log(K);
}

export function cellPart(occ, layout) {
  const g = geometry();
  let s = 0;
  for (let c = 0; c < N_CELLS; c++) {
    const qm = (1 - EPS) * occ[c] + EPS * g.p0[c];
    s += g.occ[layout * N_CELLS + c]
      ? Math.log(qm) - Math.log(g.p0[c])
      : Math.log1p(-qm) - Math.log1p(-g.p0[c]);
  }
  return s / g.cellNorm;
}

export function score(q, occ, rule, layout) {
  const r = rulePart(q, rule), c = cellPart(occ, layout);
  return { rule_part: r, cell_part: c, score_raw: 0.5 * (r + c) };
}

// A person's rule guess as a distribution: `conf` on the pick, the rest spread evenly.
export function guessToRules(pick, conf) {
  return NAMES.map((_, k) => (k === pick ? conf : (1 - conf) / (K - 1)));
}
