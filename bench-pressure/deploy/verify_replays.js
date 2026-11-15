// node verify_replays.js <page.html> : replays every embedded Gemini trace headlessly (same loop as the
// page's autoStep/tracePolicy) and checks score/papers/bits and decision steps against the recording;
// then runs a P2-bot game (makeBot(1), player 0 idle) to check the generalised bot does full plate cycles.
const fs = require("fs");
const vm = require("vm");
const page = fs.readFileSync(process.argv[2], "utf8");
const src = page.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)[1];
const gem = JSON.parse(page.match(/<script[^>]*id="geminiData"[^>]*>([\s\S]*?)<\/script>/)[1]);

function stub() {
  const f = function () { return p; };
  const p = new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => "";
      if (k === Symbol.iterator) return function* () {};
      if (k === "measureText") return (s) => ({ width: String(s).length * 6.5 });
      if (k === "getBoundingClientRect") return () => ({ width: 960, height: 804 });
      if (k === "textContent") return "null";
      if (k === "matches") return false;
      if (k === "value") return "1";
      if (k === "then") return undefined;
      return p;
    },
    set() { return true; }, apply() { return p; },
  });
  return p;
}
function load() {
  const S = stub();
  const ctx = {
    console, Math, JSON, Date, Number, String, Array, Object, Map, Set, Symbol, Error, Infinity, NaN, parseInt, parseFloat, isFinite,
    document: { getElementById: () => S, documentElement: S, activeElement: null, createElement: () => S },
    getComputedStyle: () => ({ getPropertyValue: () => "#888" }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} },
    requestAnimationFrame: () => 0, performance: { now: () => 0 }, setTimeout: () => 0, clearTimeout() {},
    addEventListener() {}, innerWidth: 1200, devicePixelRatio: 1, localStorage: { getItem: () => null, setItem() {} },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "page" });
  return vm.runInContext(`({ newGame, update, makeBot, activeTickets, ticketById, DT, setState, G: () => G, state: () => state,
    setSeed: (v) => { seed = v; }, setAuto: (v) => { auto = v; }, setPartner: (v) => { try { partner = v; } catch (e) {} } })`, ctx);
}

let ok = 0, bad = 0;
for (const tr of gem.traces) {
  const g = load();
  g.setSeed(tr.seed); g.newGame(1);
  const bot = g.makeBot();
  g.setAuto({ bot }); g.setState("play");
  let i = 0, desync = false, steps = 0;
  while (g.state() !== "end" && steps++ < 200 * 60) {
    if (bot.tick() === "need") {
      const d = tr.d[i++];
      if (d && d[0] !== bot.step) desync = true;
      bot.decide(d ? { action: d[1], ticket: d[2], experiment: d[3], why: d[4] } : { action: "wait" }); bot.tick();
    }
    g.update(g.DT); bot.step++;
  }
  const st = g.G().stats, G = g.G();
  const m = !desync && G.score === tr.final.score && st.papers === tr.final.papers && +st.bits.toFixed(3) === tr.final.bits;
  m ? ok++ : bad++;
  if (!m) console.log("MISMATCH seed", tr.seed, G.score, tr.final);
}
console.log(`replays: ${ok} match, ${bad} mismatch (of ${gem.traces.length})`);

// P2 bot with a simple EIG policy, player 0 standing still (a passive human).
const g = load();
g.setSeed(777); g.newGame(2); g.setState("play");
const bot = g.makeBot(1);
g.setPartner({ kind: "gemini", pi: 1, bot, calls: 0, fails: 0, model: "test" });
let steps = 0;
const policy = () => {
  const ts = g.activeTickets();
  for (const t of ts) { const m = Math.max(...t.post); if (m > 0.85 || t.timeLeft < 15) return { action: "publish", ticket: t.id }; }
  if (!bot.canRun()) return { action: "wait" };
  const t = ts[0]; return { action: "run", ticket: t.id, experiment: 0 };
};
// The page's axis() hands P2 the bot's axis; emulate: player 0 axis 0, player 1 = bot.axis.
while (g.state() !== "end" && steps++ < 200 * 60) {
  if (bot.tick() === "need") { bot.decide(policy()); bot.tick(); }
  g.update(g.DT); bot.step++;
}
const st = g.G().stats;
console.log("P2 bot game:", { score: g.G().score, papers: st.papers, plates_read: st.experiments, retractions: st.retractions, expired: st.expired, decisions: bot.log.length, p0_moved: g.G().players[0].walk });
