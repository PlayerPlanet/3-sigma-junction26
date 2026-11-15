const path = require("path");
process.argv[2] = path.join(__dirname, "..", "index.html");
const fs = require("fs"); const vm = require("vm");
// reuse loader from verify_replays by eval of its top part
const code = fs.readFileSync(path.join(__dirname, "..", "verify_replays.js"), "utf8").split("let ok = 0")[0];
eval(code);
const g = load();
g.setSeed(777); g.newGame(2); g.setState("play");
const bot = g.makeBot(1);
g.setPartner({ kind: "gemini", pi: 1, bot, calls: 0, fails: 0, model: "t" });
let steps = 0, lastLog = 0;
while (g.state() !== "end" && steps++ < 60 * 60) {
  const r = bot.tick();
  if (r === "need") { const ts = g.activeTickets(); bot.decide(bot.canRun() ? { action: "run", ticket: ts[0].id, experiment: 0 } : { action: "wait" }); bot.tick(); console.log("t", g.G().t.toFixed(1), "decide", bot.log[bot.log.length-1].a); }
  g.update(g.DT); bot.step++;
  if (steps % 120 === 0) { const p = g.G().players[1]; console.log("t", g.G().t.toFixed(1), "p2", (p.x/80).toFixed(2), ((p.y)/80).toFixed(2), "held", p.held && p.held.st, "axis", bot.axis.join(","), "task", !!bot.task); }
}
