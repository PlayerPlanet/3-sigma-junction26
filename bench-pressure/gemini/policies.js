// Baseline lab leads. Each has its own seeded RNG (never the game's), so the world is identical across policies.
const LN2 = Math.log(2);
const h2 = (p) => (p <= 0 || p >= 1 ? 0 : -(p * Math.log(p) + (1 - p) * Math.log(1 - p)) / LN2);
function eig(post, lik) { let pr = 0, c = 0; for (let i = 0; i < post.length; i++) { pr += post[i] * lik[i]; c += post[i] * h2(lik[i]); } return Math.max(0, h2(pr) - c); }
function entropy(d) { let s = 0; for (const p of d) if (p > 0) s -= p * Math.log(p); return s / LN2; }
// Expected information from a batch of binary experiments (enumerate outcomes).
function batchEig(post, liks) {
  const n = liks.length; let hy = 0, hyh = 0;
  for (let m = 0; m < 1 << n; m++) {
    let py = 0;
    for (let i = 0; i < post.length; i++) {
      let l = 1; for (let j = 0; j < n; j++) l *= (m >> j) & 1 ? liks[j][i] : 1 - liks[j][i];
      py += post[i] * l;
      if (l > 0) hyh -= post[i] * l * Math.log2(l);
    }
    if (py > 0) hy -= py * Math.log2(py);
  }
  return Math.max(0, hy - hyh);
}
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mapOf = (t) => { let b = 0; for (let i = 1; i < t.post.length; i++) if (t.post[i] > t.post[b]) b = i; return b; };

function publishRule(s, thr, low) {
  let best = null;
  for (const t of s.tickets) {
    const c = t.post[mapOf(t)];
    if (c >= thr || t.timeLeft < low) if (!best || c > best.c) best = { t, c };
  }
  return best ? { action: "publish", ticket: best.t.id, why: "MAP " + best.c.toFixed(2) } : null;
}

// mode: "greedy" (myopic EIG on the current posterior), "batch" (EIG given plates already growing), "random"
function makeBaseline(mode, { thr = 0.9, low = 15, seed = 1 } = {}) {
  const rng = mulberry32(seed * 7919 + 13);
  return (s) => {
    const pub = publishRule(s, thr, low);
    if (pub) return pub;
    if (!s.canRun) return { action: "wait", why: "incubators full" };
    if (mode === "random") {
      const t = s.tickets[Math.floor(rng() * s.tickets.length)];
      return { action: "run", ticket: t.id, experiment: Math.floor(rng() * t.exps.length), why: "random" };
    }
    let best = null;
    for (const t of s.tickets) {
      const pend = t.pending.map(p => t.exps[p.e].lik);
      const base = mode === "batch" && pend.length ? batchEig(t.post, pend) : 0;
      t.exps.forEach((e, i) => {
        const v = mode === "batch" && pend.length ? batchEig(t.post, pend.concat([e.lik])) - base : eig(t.post, e.lik);
        if (!best || v > best.v + 1e-12) best = { v, t, i };
      });
    }
    return { action: "run", ticket: best.t.id, experiment: best.i, why: "EIG " + best.v.toFixed(3) };
  };
}

module.exports = { eig, entropy, batchEig, makeBaseline, mapOf };
