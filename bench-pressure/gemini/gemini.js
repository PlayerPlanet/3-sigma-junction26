// Gemini as the lab lead. REST generateContent with JSON mode + responseSchema.
// The API key is read from the team repo's .env at runtime and is never logged or written anywhere.
const { loadKey } = require("./env");

const SYSTEM = `You are the lab lead in "Bench Pressure", a Bayesian lab game. You decide the science; a technician carries it out.

How the lab works:
- Each open grant ticket asks which hypothesis is true. The truth was drawn at random from the ticket's prior. You see the current posterior, updated by exact Bayes' rule after every plate read.
- "run": the technician prepares one experiment for one ticket (about 4-5 s of bench work), incubates it 6 s, then reads it. Each experiment gives a noisy yes/no result with the probabilities stated in its menu entry. There are 3 incubators, so up to 3 plates can grow at once, but the technician is one person and every plate costs bench time. Results of plates still growing are not in the posterior yet.
- "publish": the technician writes a paper claiming the hypothesis with the HIGHEST posterior at the moment of writing and submits it (about 5 s). The ticket closes; plates still growing for it are wasted.
- "wait": do nothing now; you will be asked again when something changes.

Scoring:
- Correct paper: +100 + round(60 x time_left / time_max) + max(0, 60 - 10 x plates_read_for_that_ticket).
- Wrong paper: -60 (retraction).
- A ticket that reaches 0 s left expires: -30.
- The round lasts 180 s. New tickets arrive every 22-30 s while fewer than 4 are open and more than 25 s remain.
- Game time is frozen while you think.

Answer with JSON only: {"action": "run"|"publish"|"wait", "ticket": <ticket id>, "experiment": <E number, for run>, "why": "<one short sentence, at most 25 words, explaining the choice in terms of the evidence>"}.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    action: { type: "STRING", enum: ["run", "publish", "wait"] },
    ticket: { type: "INTEGER" },
    experiment: { type: "INTEGER" },
    why: { type: "STRING" },
  },
  required: ["action", "why"],
  propertyOrdering: ["action", "ticket", "experiment", "why"],
};

const f3 = (x) => x.toFixed(3);
function expLine(t, e, i) {
  if (t.type === "gene") {
    const set = "{" + e.pool.map(j => t.labels[j]).join(", ") + "}";
    return `E${i}: knock out ${set}: P(phenotype lost) = ${f3(e.lik[e.pool[0]])} if the culprit is in ${set}, else ${f3(e.lik.find((_, h) => !e.pool.includes(h)))}`;
  }
  return `E${i}: treat at ${t.labels[e.dose]} µM: P(response) = ${f3(e.lik[0])} if the threshold is <= ${t.labels[e.dose]} µM, else ${f3(t.exps[0].lik[t.labels.length - 1])}`;
}
function describe(s) {
  const L = [];
  L.push(`Round time left: ${Math.ceil(s.roundLeft)} s. Score so far: ${s.score}.`);
  L.push(s.canRun
    ? `Lab: ${s.freeInc} of 3 incubators free, ${s.rack} clean plates. You can run an experiment now.`
    : `Lab: no incubator or clean plate free right now, so you cannot run an experiment; you may publish or wait.`);
  for (const t of s.tickets) {
    L.push("");
    const unit = t.type === "dose" ? " µM" : "";
    L.push(t.type === "gene"
      ? `Ticket ${t.id}: Culprit gene. Exactly one of these genes causes the phenotype.`
      : `Ticket ${t.id}: Dose threshold. Hypothesis "X µM" means X is the lowest dose that triggers a response (doses at or above X respond).`);
    L.push(`  Time left ${Math.ceil(t.timeLeft)} s of ${t.timeMax}. Plates read so far: ${t.nExp}.`);
    L.push(`  Posterior: ` + t.labels.map((l, i) => `${l}${unit} ${f3(t.post[i])}`).join(" | "));
    if (t.history.length) L.push(`  Results: ` + t.history.map(h => `E${h.e} -> ${h.y ? (t.type === "gene" ? "phenotype lost" : "response") : (t.type === "gene" ? "phenotype intact" : "no response")}`).join("; "));
    if (t.pending.length) L.push(`  Growing now: ` + t.pending.map(p => `E${p.e} (result in ${Math.ceil(p.ready)} s)`).join(", "));
    let m = 0; t.post.forEach((p, i) => { if (p > t.post[m]) m = i; });
    L.push(`  If published now, the paper claims ${t.labels[m]}${unit} (posterior ${f3(t.post[m])}).`);
    L.push(`  Experiment menu:`);
    t.exps.forEach((e, i) => L.push("    " + expLine(t, e, i)));
  }
  L.push("", "Choose one action.");
  return L.join("\n");
}

const stats = { calls: 0, retries: 0, failures: 0, inTok: 0, outTok: 0, thoughtTok: 0, ms: 0, invalid: 0 };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ask(model, prompt) {
  const key = loadKey();
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    const t0 = Date.now();
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
      });
      stats.ms += Date.now() - t0;
      if (r.status === 429 || r.status >= 500) { stats.retries++; await sleep(2000 * 2 ** attempt + Math.random() * 1000); continue; }
      const j = await r.json();
      if (!r.ok) throw new Error("HTTP " + r.status + " " + JSON.stringify(j).slice(0, 200));
      stats.calls++;
      const u = j.usageMetadata || {};
      stats.inTok += u.promptTokenCount || 0; stats.outTok += u.candidatesTokenCount || 0; stats.thoughtTok += u.thoughtsTokenCount || 0;
      const txt = (j.candidates && j.candidates[0].content && j.candidates[0].content.parts || []).map(p => p.text || "").join("");
      return JSON.parse(txt);
    } catch (e) {
      stats.retries++;
      if (attempt === 5) { stats.failures++; return null; }
      await sleep(2000 * 2 ** attempt);
    }
  }
  stats.failures++;
  return null;
}

// Returns a policy for sim.playGame. Invalid answers get one corrective retry, then become waits.
function makeGemini(model, transcript) {
  return async (s) => {
    const prompt = describe(s);
    let d = await ask(model, prompt);
    const valid = (d) => {
      if (!d) return false;
      const t = s.tickets.find(t => t.id === d.ticket);
      if (d.action === "wait") return true;
      if (d.action === "publish") return !!t;
      return d.action === "run" && !!t && s.canRun && Number.isInteger(d.experiment) && d.experiment >= 0 && d.experiment < t.exps.length;
    };
    if (!valid(d)) {
      stats.invalid++;
      d = await ask(model, prompt + `\n\nYour previous answer ${JSON.stringify(d)} was not a valid action here (check the ticket id, the experiment number, and whether running is possible). Answer again.`);
      if (!valid(d)) d = { action: "wait", why: "(invalid answer, treated as wait)" };
    }
    d.why = String(d.why || "").replace(/\s+/g, " ").trim().slice(0, 220);
    if (transcript) transcript.push({ t: +s.t.toFixed(2), d });
    return d;
  };
}

module.exports = { makeGemini, describe, stats, SYSTEM };
