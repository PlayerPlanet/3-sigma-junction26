// Dumps decision-point snapshots + the JS describe() text, to check the Python port in deploy/prompts.py.
const fs = require("fs");
const _r = fs.readFileSync; fs.readFileSync = (p, ...a) => _r(String(p).endsWith("index.html") ? String(p).replace(/index.html$/, "index.pre-charts.html") : p, ...a);
const { playGame } = require("./sim");
const { describe } = require("./gemini");
const { makeBaseline } = require("./policies");
(async () => {
  const out = [];
  for (const seed of [1000, 1001, 1002]) {
    const base = makeBaseline("batch", { seed });
    await playGame(seed, (s) => { out.push({ s, text: describe(s) }); return base(s); });
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(out));
  console.log("snapshots", out.length);
})();
