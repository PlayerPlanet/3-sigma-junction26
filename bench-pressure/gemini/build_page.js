// Summarise Gemini + baseline results on the same seeds and embed traces + table into ../index.html.
// usage: node build_page.js <model> <seeds csv> <trace seeds csv> [baselineFile] [other models csv]
const fs = require("fs");
const path = require("path");
const { playGame } = require("./sim");
const { makeBaseline } = require("./policies");

const DISPLAY = { "gemini-4-hydrogen": "Gemini 4 Hydrogen", "gemini-4-argon": "Gemini 4 Argon", "gemini-4-carbon": "Gemini 4 Carbon" };
const ms = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; const sd = a.length > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)) : 0; return [m, sd]; };
const row = (name, rs, extra) => ({ name, n: rs.length, ...extra, score: ms(rs.map(r => r.score)), papers: ms(rs.map(r => r.papers)), retractions: ms(rs.map(r => r.retractions)), expired: ms(rs.map(r => r.expired)), eff: ms(rs.map(r => r.eff)), bits: ms(rs.map(r => r.bits)) });

(async () => {
  const model = process.argv[2];
  const seeds = process.argv[3].split(",").map(Number);
  const traceSeeds = process.argv[4].split(",").map(Number);
  const gem = seeds.map(s => JSON.parse(fs.readFileSync(path.join(__dirname, "results", `gemini_${model}_${s}.json`), "utf8")));
  const pols = { "EIG-greedy": (s) => makeBaseline("greedy", { seed: s }), "EIG-greedy, batch-aware": (s) => makeBaseline("batch", { seed: s }), "Publish early (MAP ≥ 0.6)": (s) => makeBaseline("greedy", { seed: s, thr: 0.6 }), "Random design": (s) => makeBaseline("random", { seed: s }) };
  const rows = [row(DISPLAY[model] || model, gem, { gemini: true })];
  // Other Gemini variants on the same seeds (argv[6], comma list), shown as extra rows.
  for (const other of (process.argv[6] || "").split(",").filter(Boolean)) {
    const rs = seeds.map(s => JSON.parse(fs.readFileSync(path.join(__dirname, "results", `gemini_${other}_${s}.json`), "utf8")));
    rows.push(row(DISPLAY[other] || other, rs, { gemini: true }));
  }
  const base = {};
  for (const [name, mk] of Object.entries(pols)) {
    base[name] = [];
    for (const s of seeds) base[name].push(await playGame(s, mk(s)));
    rows.push(row(name, base[name]));
  }
  // Re-simulate each Gemini trace from its decisions alone to prove the replay is exact.
  for (const g of gem) {
    let i = 0;
    const rep = await playGame(g.seed, () => { const d = g.trace.d[i++]; return { action: d[1], ticket: d[2], experiment: d[3], why: d[4] }; });
    if (rep.score !== g.score || rep.trace.d.length !== g.trace.d.length || rep.trace.d.some((d, k) => d[0] !== g.trace.d[k][0])) throw new Error("replay mismatch seed " + g.seed);
  }
  const date = gem[0].date;
  const big = process.argv[5] ? JSON.parse(fs.readFileSync(path.join(__dirname, "results", process.argv[5]), "utf8")) : null;
  let bigNote = "";
  if (big) {
    const n = big["EIG-greedy"].length;
    bigNote = ` Over ${n} seeds the baselines average ` + Object.keys(big).map(k => `${k} ${ms(big[k].map(r => r.score))[0].toFixed(0)}`).join(", ") + ".";
  }
  const caption = `${DISPLAY[model] || model} (model id ${model}), ${seeds.length} seeds (${seeds[0]}–${seeds[seeds.length - 1]}), run ${date}. Baselines play the same seeds with the same scripted hands. Score is mean ± sd; other columns are means. Design efficiency = EIG of chosen experiments ÷ best EIG on offer for that grant.${bigNote}`;
  const DATA = {
    model: DISPLAY[model] || model, modelId: model, date,
    table: { caption, rows: rows.map(r => ({ ...r, score: r.score.map(x => +x.toFixed(1)), papers: r.papers.map(x => +x.toFixed(2)), retractions: r.retractions.map(x => +x.toFixed(2)), expired: r.expired.map(x => +x.toFixed(2)), eff: r.eff.map(x => +x.toFixed(3)), bits: r.bits.map(x => +x.toFixed(2)) })) },
    traces: traceSeeds.map(s => gem.find(g => g.seed === s).trace),
  };
  const json = JSON.stringify(DATA).replace(/</g, "\\u003c");
  const page = path.join(__dirname, "..", "index.html");
  let html = fs.readFileSync(page, "utf8");
  html = html.replace(/(<script type="application\/json" id="geminiData">)[\s\S]*?(<\/script>)/, (_, a, b) => a + json + b);
  fs.writeFileSync(page, html);
  for (const r of rows) console.log(r.name.padEnd(26), "n", r.n, "score", r.score[0].toFixed(1), "±", r.score[1].toFixed(1), "papers", r.papers[0].toFixed(2), "retr", r.retractions[0].toFixed(2), "exp", r.expired[0].toFixed(2), "eff", r.eff[0].toFixed(3), "bits", r.bits[0].toFixed(2));
  console.log("embedded", traceSeeds.length, "traces,", json.length, "bytes");
})();
