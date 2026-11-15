// Behaviour summary of Gemini runs. usage: node analyze.js <model> <seeds csv>
const fs = require("fs"), path = require("path");
const model = process.argv[2], seeds = process.argv[3].split(",").map(Number);
const rs = seeds.map(s => JSON.parse(fs.readFileSync(path.join(__dirname, "results", `gemini_${model}_${s}.json`), "utf8")));
let runs = 0, argmax = 0, within90 = 0, pubs = 0, pubConf = [], waits = 0, single = 0, pool = 0, doseRuns = 0, extremeDose = 0, wasted = 0;
for (const r of rs) {
  const pubT = {};
  for (const d of r.log) if (d.a === "publish") pubT[d.tk] = d.t;
  for (const d of r.log) {
    if (d.a === "wait") waits++;
    if (d.a === "publish") { pubs++; pubConf.push(d.conf); }
    if (d.a !== "run") continue;
    runs++;
    if (d.eig >= d.best - 1e-9) argmax++;
    if (d.eig >= 0.9 * d.best) within90++;
    if (pubT[d.tk] != null && pubT[d.tk] > d.t && pubT[d.tk] - d.t < 12) wasted++;
    if (/E\d/.test("")) {}
  }
}
// pool size preferences need the ticket structure: re-derive from why-free trace by replaying is heavy; use labels in log via sim.
const { playGame } = require("./sim");
(async () => {
  for (const r of rs) {
    let i = 0;
    const seen = [];
    await playGame(r.seed, (s) => {
      const d = r.trace.d[i++];
      if (d[1] === "run") { const t = s.tickets.find(t => t.id === d[2]); const e = t.exps[d[3]]; if (t.type === "gene") (e.pool.length === 1 ? single++ : pool++); else { doseRuns++; if (e.dose === 0 || e.dose === 7) extremeDose++; } }
      return { action: d[1], ticket: d[2], experiment: d[3], why: d[4] };
    });
  }
  pubConf.sort((a, b) => a - b);
  console.log(model, "games", rs.length, "runs", runs, "exact argmax-EIG", (argmax / runs).toFixed(2), "within 90% of best", (within90 / runs).toFixed(2));
  console.log(" publishes", pubs, "median MAP at publish", pubConf[pubConf.length >> 1].toFixed(2), "share <0.9", (pubConf.filter(c => c < 0.9).length / pubs).toFixed(2), "min", pubConf[0].toFixed(2), "waits", waits);
  console.log(" gene designs: single-gene", single, "pooled", pool, "| dose designs", doseRuns, "at 0.1 or 300 µM", extremeDose, "| runs started <12 s before publishing same ticket", wasted);
})();
