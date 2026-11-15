// Gemini plays Bench Pressure on a set of seeds (games run concurrently, each one sequential).
// usage: node run_gemini.js <model> <seed,seed,...>
const fs = require("fs");
const path = require("path");
const { playGame } = require("./sim");
const { makeGemini, stats } = require("./gemini");

(async () => {
  const model = process.argv[2] || "gemini-4-hydrogen";
  const seeds = (process.argv[3] || "1000").split(",").map(Number);
  const t0 = Date.now();
  await Promise.all(seeds.map(async (seed) => {
    const transcript = [];
    const r = await playGame(seed, makeGemini(model, transcript));
    r.model = model; r.date = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(__dirname, "results", `gemini_${model}_${seed}.json`), JSON.stringify(r));
    console.log(model, "seed", seed, "score", r.score, "papers", r.papers, "retr", r.retractions, "exp", r.expired, "eff", r.eff.toFixed(3), "bits", r.bits.toFixed(2), "decisions", r.decisions, "zeroEIG", r.zeroEigRuns);
  }));
  console.log("calls", stats.calls, "retries", stats.retries, "failures", stats.failures, "invalid", stats.invalid,
    "tokens in/out/thought", stats.inTok, stats.outTok, stats.thoughtTok, "mean latency s", (stats.ms / Math.max(1, stats.calls) / 1000).toFixed(1),
    "wall", ((Date.now() - t0) / 1000).toFixed(0) + "s");
})();
