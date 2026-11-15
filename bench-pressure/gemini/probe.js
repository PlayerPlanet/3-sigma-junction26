const { loadKey } = require("./env");
const key = loadKey();
async function call(model) {
  const t0 = Date.now();
  const body = { contents: [{ role: "user", parts: [{ text: "Five hypotheses A-E with probabilities A .4 B .3 C .1 D .1 E .1. Test 1 checks {A}, test 2 checks {A,B}, test 3 checks {C,D}. Each test is positive w.p. 0.9 if truth in set, else 0.08. Which test is most informative? Reply as JSON." }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { test: { type: "INTEGER" }, why: { type: "STRING" } }, required: ["test", "why"] } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const j = await r.json();
  const txt = j.candidates ? j.candidates[0].content.parts.map(p => p.text || "").join("") : JSON.stringify(j).slice(0, 200);
  console.log(model, r.status, ((Date.now() - t0) / 1000).toFixed(1) + "s", JSON.stringify(j.usageMetadata || {}), txt.slice(0, 200));
}
(async () => { await Promise.all(process.argv.slice(2).map(m => call(m).catch(e => console.log(m, "ERR", e.message)))); })();
