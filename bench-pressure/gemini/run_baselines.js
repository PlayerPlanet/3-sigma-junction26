// Baselines over many seeds, same controller and world as the Gemini runs.
// usage: node run_baselines.js [nSeeds=100] [firstSeed=1000]
const fs = require("fs");
const path = require("path");
const { playGame } = require("./sim");
const { makeBaseline } = require("./policies");

const POLICIES = {
  "EIG-greedy": (s) => makeBaseline("greedy", { seed: s }),
  "EIG-greedy, batch-aware": (s) => makeBaseline("batch", { seed: s }),
  "Random design": (s) => makeBaseline("random", { seed: s }),
  "Publish early (MAP 0.6)": (s) => makeBaseline("greedy", { seed: s, thr: 0.6 }),
};

(async () => {
  const n = +(process.argv[2] || 100), first = +(process.argv[3] || 1000);
  const out = {};
  for (const [name, mk] of Object.entries(POLICIES)) {
    out[name] = [];
    for (let i = 0; i < n; i++) {
      const seed = first + i;
      const r = await playGame(seed, mk(seed));
      delete r.log; delete r.trace;
      out[name].push(r);
    }
    const m = (k) => out[name].reduce((a, r) => a + r[k], 0) / n;
    console.log(name.padEnd(26), "score", m("score").toFixed(1), "papers", m("papers").toFixed(2), "retr", m("retractions").toFixed(2), "exp", m("expired").toFixed(2), "eff", m("eff").toFixed(3), "bits", m("bits").toFixed(2), "reads", m("experiments").toFixed(1), "contam", m("contam").toFixed(2));
  }
  fs.writeFileSync(path.join(__dirname, "results", `baselines_${first}_${n}.json`), JSON.stringify(out));
})();
