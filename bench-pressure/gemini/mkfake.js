// Builds shots/fake.html: the page with a baseline trace embedded, to test replay UI without API calls.
const fs = require("fs"), path = require("path");
const { playGame } = require("./sim"); const { makeBaseline } = require("./policies");
(async () => {
  const r = await playGame(1001, makeBaseline("batch", { seed: 1 }));
  r.trace.d.forEach(d => d[4] = "Test reason: this experiment splits the posterior mass close to half and half, maximising the expected information.");
  const DATA = { model: "Test model", modelId: "test", date: "2026-11-14", traces: [r.trace], table: { caption: "test caption", rows: [{ name: "Test", n: 1, gemini: true, score: [r.score, 0], papers: [1, 0], retractions: [0, 0], expired: [0, 0], eff: [0.9, 0], bits: [3, 0] }, { name: "EIG-greedy", n: 1, score: [100, 3], papers: [1, 0], retractions: [0, 0], expired: [0, 0], eff: [1, 0], bits: [3, 0] }] } };
  let html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  html = html.replace(/(<script type="application\/json" id="geminiData">)[\s\S]*?(<\/script>)/, (_, a, b) => a + JSON.stringify(DATA) + b);
  const q = process.argv[2] || "";
  html += `<script>${fs.readFileSync(path.join(__dirname, "shotdrive.js"), "utf8")}</script>`;
  fs.writeFileSync(path.join(__dirname, "shots", "fake.html"), html);
  console.log("fake score", r.score);
})();
