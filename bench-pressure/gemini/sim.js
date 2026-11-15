// Headless Bench Pressure: runs the game's own <script> from ../index.html in a node vm
// with inert DOM/canvas stubs, so the rules, RNG and the bot controller are the published ones.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PAGE = path.join(__dirname, "..", "index.html");

function gameSource() {
  const html = fs.readFileSync(PAGE, "utf8");
  const m = html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/);
  if (!m) throw new Error("game script not found");
  return m[1];
}

function stub() {
  // An object that absorbs any property access / call.
  const f = function () { return p; };
  const p = new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => "";
      if (k === "measureText") return (s) => ({ width: String(s).length * 6.5 });
      if (k === "getBoundingClientRect") return () => ({ width: 960, height: 804 });
      if (k === "textContent") return "null";
      if (k === "matches") return false;
      if (k === "value") return "1";
      if (k === "then") return undefined;
      return p;
    },
    set() { return true; },
    apply() { return p; },
  });
  return p;
}

function loadGame() {
  const S = stub();
  const ctx = {
    console, Math, JSON, Date, Number, String, Array, Object, Map, Set, Symbol, Error, Infinity, NaN, parseInt, parseFloat, isFinite,
    document: { getElementById: () => S, documentElement: S, activeElement: null, createElement: () => S },
    getComputedStyle: () => ({ getPropertyValue: () => "#888" }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} },
    requestAnimationFrame: () => 0, performance: { now: () => 0 },
    addEventListener() {}, innerWidth: 1200, devicePixelRatio: 1,
    localStorage: { getItem: () => null, setItem() {} },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(gameSource(), ctx, { filename: "index.html#game" });
  return vm.runInContext(`({
    newGame, update, makeBot, activeTickets, ticketById, Bayes, DT, setState,
    setSeed: (v) => { seed = v; }, setAuto: (v) => { auto = v; },
    G: () => G, state: () => state, events: () => events,
  })`, ctx);
}

// Snapshot of what the lab lead can see at a decision point.
function snapshot(g, bot) {
  const G = g.G();
  return {
    t: G.t, roundLeft: G.timeLeft, score: G.score, canRun: bot.canRun(),
    rack: [...G.stations.values()].find(s => s.type === "rack").count,
    freeInc: [...G.stations.values()].filter(s => s.type === "incubator" && !s.item).length,
    tickets: g.activeTickets().map(t => ({
      id: t.id, type: t.type, title: t.title, labels: t.labels.slice(), prior: t.prior.slice(), post: t.post.slice(),
      timeLeft: t.timeLeft, timeMax: t.timeMax, nExp: t.nExp, history: t.history.map(h => ({ e: h.e, y: h.y })),
      exps: t.exps.map(e => ({ label: e.label, long: e.long, pool: e.pool, dose: e.dose, lik: e.lik.slice() })),
      pending: bot.pending(t),
    })),
  };
}

// Play one solo round. policy(snapshot) -> decision (may be async). Returns stats + trace.
async function playGame(seed, policy, opts = {}) {
  const g = loadGame();
  g.setSeed(seed); g.newGame(1);
  const bot = g.makeBot();
  g.setAuto({ bot });
  g.setState("play");
  let steps = 0;
  while (g.state() !== "end") {
    if (bot.tick() === "need") {
      const snap = snapshot(g, bot);
      const d = await policy(snap, g);
      bot.decide(d); bot.tick();
    }
    g.update(g.DT); bot.step++;
    if (++steps > 200 * 60) throw new Error("runaway");
  }
  const G = g.G(), st = G.stats;
  const runs = bot.log.filter(r => r.a === "run");
  return {
    seed, score: G.score, papers: st.papers, retractions: st.retractions, expired: st.expired,
    experiments: st.experiments, bits: st.bits, eff: st.sumMax > 0 ? st.sumEig / st.sumMax : 0, contam: st.contam,
    decisions: bot.log.length, runs: runs.length, publishes: bot.log.filter(r => r.a === "publish").length,
    zeroEigRuns: runs.filter(r => r.eig < 1e-6).length,
    log: bot.log,
    trace: { seed, d: bot.log.map(r => [r.s, r.a, r.tk, r.e, r.why]), final: { score: G.score, papers: st.papers, retractions: st.retractions, expired: st.expired, bits: +st.bits.toFixed(3), eff: +(st.sumMax > 0 ? st.sumEig / st.sumMax : 0).toFixed(3) } },
  };
}

module.exports = { loadGame, playGame, snapshot };
