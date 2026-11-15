const { loadGame, snapshot } = require("./sim");
const { makeBaseline } = require("./policies");
const g = loadGame(); g.setSeed(1000); g.newGame(1);
const bot = g.makeBot(); g.setAuto({ bot }); g.setState("play");
const pol = makeBaseline("greedy", { seed: 1 });
let lastExp = 0, lastT = -1;
while (g.state() !== "end" && g.G().t < 60) {
  const G = g.G();
  if (bot.tick() === "need") { const d = pol(snapshot(g, bot)); const r = bot.decide(d); console.log(G.t.toFixed(2), "DECIDE", r.a, r.tk, r.e); bot.tick(); }
  g.update(g.DT); bot.step++;
  if (G.stats.experiments !== lastExp) { lastExp = G.stats.experiments; console.log(G.t.toFixed(2), "READ", lastExp); }
  if (Math.floor(G.t) !== lastT && Math.floor(G.t) % 1 === 0) { lastT = Math.floor(G.t); const p = G.players[0]; console.log(G.t.toFixed(1), "pos", (p.x/64).toFixed(2), ((p.y-150)/64).toFixed(2), "held", p.held && p.held.st, "task", !!bot.task, "incs", [...G.stations.values()].filter(s=>s.type==="incubator").map(s=>s.item? s.item.st+":"+(s.item.grow||0).toFixed(2):"-").join(" "), "rack", [...G.stations.values()].find(s=>s.type==="rack").count); }
}
