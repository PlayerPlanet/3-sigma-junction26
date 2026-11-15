// ---------- live AI lab partner ----------
// With a partner the human is P1 (either key set: WASD or arrows) and an AI drives P2 through the same
// scripted hands as the replays (makeBot(1)). Only the science comes from the server: the bot asks when it
// is idle, keeps the frame loop running while the request is out (the game does not pause), and applies the
// answer at its next idle moment. Failures, timeouts and rate limits arrive as "wait" decisions.
const LIVE_URL = "https://playerplanet-3-sigma-submission--bench-pressure-web.us-east.modal.run/";
const PARTNERS = {
  gemini: { name: "Gemini", tag: "GEMINI", path: "/api/gemini",
    note: "Gemini (live API) reads every grant's posterior and the experiment menu, then decides what P2 runs or publishes, with the same prompt as the recorded runs. A decision takes about 2 to 15 s; the round keeps running while it thinks." },
  gemma: { name: "Gemma", tag: "GEMMA", path: "/api/gemma",
    note: "Our Gemma 4 (26B-A4B), RL-trained (GRPO) to pick informative experiments, chooses P2's experiments on a Modal GPU. It was never trained to decide when to publish, so a fixed rule does that (publish at MAP ≥ 85% or with < 15 s left, otherwise work on the most urgent grant); those decisions are labelled RULE. First use wakes the GPU (about 40 s)." },
  nemotron: { name: "Nemotron", tag: "NEMOTRON", path: "/api/nemotron",
    note: "NVIDIA Nemotron 3.5 Super (live API, thinking off) gets the same prompt as Gemini and decides what P2 runs or publishes. The shared key allows about 30 decisions a minute across all players." },
};
const STATUS_TEXT = { thinking: "thinking…", warming: "GPU warming up", rate_limited: "partner rate-limited", error: "partner offline", offline: "partner offline", timeout: "partner offline (timeout)", invalid: "invalid answer, waited" };
const api = { ok: false, models: {} };
function partnerChoice() { const v = $("partnerSel").value; return api.ok && PARTNERS[v] ? v : ""; }
function newPartner(kind) {
  return { kind, pi: 1, bot: makeBot(1), acc: 0, inflight: false, pendingD: null, lastReq: -1e9, askedAt: 0, status: "idle",
    gid: kind + "-" + seed + "-" + Math.random().toString(36).slice(2, 8), model: api.models[kind] || "", calls: 0, fails: 0, lastMs: 0 };
}
// The compact state the server turns into the prompt (same fields as the offline harness's snapshot()).
function partnerSnapshot(bot) {
  const st = [...G.stations.values()];
  return {
    t: G.t, roundLeft: G.timeLeft, score: G.score, canRun: bot.canRun(),
    rack: st.find(s => s.type === "rack").count, freeInc: st.filter(s => s.type === "incubator" && !s.item).length,
    tickets: activeTickets().map(t => ({
      id: t.id, type: t.type, labels: t.labels, prior: t.prior, post: t.post, timeLeft: t.timeLeft, timeMax: t.timeMax, nExp: t.nExp,
      history: t.history.map(h => ({ e: h.e, y: h.y })), pending: bot.pending(t),
      exps: t.exps.map(e => e.pool ? { pool: e.pool, lik: e.lik } : { dose: e.dose, lik: e.lik }),
    })),
  };
}
function askPartner(P) {
  const now = performance.now();
  if (P.inflight || P.pendingD || now - P.lastReq < 2300) return;
  P.inflight = true; P.lastReq = now; P.status = "thinking"; P.askedAt = G.t;
  const body = JSON.stringify({ game: P.gid, state: partnerSnapshot(P.bot) });
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 35000);
  fetch(PARTNERS[P.kind].path, { method: "POST", headers: { "content-type": "application/json" }, body, signal: ctl.signal })
    .then(r => r.ok ? r.json() : { action: "wait", why: r.status === 429 ? "partner rate-limited" : "partner offline", status: r.status === 429 ? "rate_limited" : "error" })
    .catch(() => ({ action: "wait", why: "partner offline", status: "offline" }))
    .then(d => {
      clearTimeout(to);
      if (partner !== P) return;
      if (!d || typeof d !== "object") d = { action: "wait", why: "partner offline", status: "error" };
      P.inflight = false; P.lastMs = performance.now() - now; P.calls++;
      P.pendingD = d; P.status = d.status || "ok";
      if (P.status !== "ok") P.fails++;
      if (d.model) P.model = d.model;
    });
}
// One fixed 1/60 s step of a partner game: the human's input is already queued in events/keysDown.
function partnerStep() {
  const P = partner, bot = P.bot;
  if (bot.tick() === "need") {
    if (P.pendingD && G.t - P.askedAt > 10) P.pendingD = null; // too stale: ask again
    if (P.pendingD) {
      const d = P.pendingD; P.pendingD = null;
      const rec = bot.decide(d);
      rec.by = d.by || P.kind; rec.status = d.status || "ok"; rec.ms = P.lastMs; rec.stale = d.action !== rec.a && d.action !== "wait";
      bot.tick();
    } else askPartner(P);
  }
  update(DT); bot.step++;
}
function partnerBadge(rec) {
  if (rec.a === "run") { const f = rec.best > 1e-9 ? rec.eig / rec.best : 1; return ["EIG " + rec.eig.toFixed(2) + " b · best " + rec.best.toFixed(2) + " b · " + Math.round(f * 100) + "%", f >= 0.9 ? C.good : f >= 0.6 ? C.hazard : C.bad]; }
  if (rec.a === "publish") return ["MAP " + Math.round(rec.conf * 100) + "% at writing", rec.conf >= 0.9 ? C.good : C.hazard];
  return null;
}
function drawPartner(x, y, w, h) {
  const P = partner, PD = PARTNERS[P.kind], log = P.bot.log, rec = log[log.length - 1];
  ctx.fillStyle = C.line; ctx.fillRect(x, y + 6, 1.5, h - 12);
  const gx = x + 14, rule = rec && rec.by === "rule";
  const tag = rule ? "RULE" : PD.tag;
  ctx.font = FONT.mono(700, 10); const tw = ctx.measureText(tag).width + 16;
  rr(gx, y + 6, tw, 16, 3); ctx.fillStyle = rule ? C.muted : C.p2; ctx.fill();
  text(tag, gx + tw / 2, y + 18, FONT.mono(700, 10), C.paper, "center");
  const st = P.inflight ? "thinking" : P.status;
  const stTxt = STATUS_TEXT[st] || "";
  const stCol = st === "thinking" ? C.muted : st === "warming" || st === "rate_limited" ? C.hazard : C.bad;
  ctx.font = FONT.mono(700, 9.5); const sw = stTxt ? ctx.measureText(stTxt).width : 0;
  if (stTxt) text(stTxt, x + w - 10, y + 18, FONT.mono(700, 9.5), stCol, "right");
  const sub = (P.model || PD.name) + " · P2 lab partner" + (rule ? " · Gemma only picks experiments" : "");
  text(fitText(sub, w - tw - sw - 40, FONT.mono(500, 9.5)), gx + tw + 8, y + 18, FONT.mono(500, 9.5), C.muted);
  if (!rec) { text(P.inflight ? "Reading the grants…" : "Waiting for an idle moment…", gx, y + 44, FONT.body(400, 12), C.muted); return; }
  const t = rec.tk ? ticketById(rec.tk) : null;
  ctx.fillStyle = t ? C.strain[t.slot] : C.muted; ctx.fillRect(gx, y + 30, 5, 18);
  text(fitText(decisionHead(rec) + (rec.stale ? " (grant changed, skipped)" : ""), w - 40, FONT.body(600, 12.5)), gx + 11, y + 44, FONT.body(600, 12.5), C.ink);
  const why = rec.why ? (rule || rec.by === "gemma" || rec.status !== "ok" ? rec.why : "“" + rec.why + "”") : "";
  wrapText(why, w - 30, FONT.body(400, 12), 3).forEach((l, i) => text(l, gx, y + 64 + i * 16, FONT.body(400, 12), C.ink));
  const by = y + h - 16, b = partnerBadge(rec);
  if (b) {
    ctx.font = FONT.mono(700, 10); const bw = ctx.measureText(b[0]).width + 14;
    rr(gx, by - 12, bw, 17, 8); ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = b[1]; ctx.lineWidth = 2; ctx.stroke();
    text(b[0], gx + 7, by + 1, FONT.mono(700, 10), C.ink);
  }
  const runs = log.filter(r => r.a === "run"), se = runs.reduce((a, r) => a + r.eig, 0), sm = runs.reduce((a, r) => a + r.best, 0);
  text(runs.length + " designs · eff " + (sm > 0 ? Math.round(100 * se / sm) + "%" : "–") + (P.lastMs ? " · " + (P.lastMs / 1000).toFixed(1) + " s" : ""), x + w - 10, by + 1, FONT.mono(500, 9.5), C.muted, "right");
}
function drawPartnerTag(t, x, y, w) {
  const log = partner.bot.log, rec = log[log.length - 1];
  if (!rec || rec.tk !== t.id || rec.a === "wait") return;
  rr(x - 2, y - 2, w + 4, 136, 7); ctx.strokeStyle = C.p2; ctx.lineWidth = 2.5; ctx.stroke();
  const who = rec.by === "rule" ? "Rule" : PARTNERS[partner.kind].name;
  const s = rec.a === "run" ? who + ": " + t.exps[rec.e].label : who + ": publish";
  ctx.font = FONT.mono(700, 9.5); const tw = ctx.measureText(s).width + 12;
  rr(x + w - tw - 6, y + 25, tw, 15, 7); ctx.fillStyle = C.p2; ctx.fill();
  text(s, x + w - 12, y + 36, FONT.mono(700, 9.5), C.paper, "right");
}
function syncPartnerLine() {
  const el = $("gemLine"), log = partner.bot.log, st = partner.inflight ? "thinking" : partner.status;
  const key = log.length + st;
  if (el.dataset.n === key) return;
  el.dataset.n = key;
  const rec = log[log.length - 1], name = PARTNERS[partner.kind].name;
  const b = rec ? partnerBadge(rec) : null;
  el.textContent = (rec ? (rec.by === "rule" ? "Rule" : name) + " (P2): " + decisionHead(rec) + (b ? " (" + b[0] + ")" : "") + (rec.why ? ". " + rec.why : "") : name + " (P2) is getting ready.") + (STATUS_TEXT[st] ? " [" + STATUS_TEXT[st] + "]" : "");
  el.hidden = false;
}
function renderPartnerEnd() {
  const P = partner, name = PARTNERS[P.kind].name, ds = G.hist.designs, log = P.bot.log;
  const eff = (k) => { const q = ds.filter(d => d.by === k); const a = q.reduce((x, d) => x + d.eig, 0), b = q.reduce((x, d) => x + d.best, 0); return [q.length, q.length ? Math.round(100 * a / Math.max(1e-9, b)) + "%" : "–"]; };
  const [nu, eu] = eff(0), [np, ep] = eff(1);
  const pubs = log.filter(r => r.a === "publish").length, ruled = log.filter(r => r.by === "rule").length;
  $("endCmp").innerHTML = `<h3>You and ${name}</h3><div class="cmpwrap"><table class="cmp"><thead><tr><th></th><th>Designs</th><th>Design eff.</th><th>Publish calls</th></tr></thead><tbody>` +
    `<tr><th>You (P1)</th><td>${nu}</td><td>${eu}</td><td>–</td></tr><tr class="gem"><th>${name} (P2)</th><td>${np}</td><td>${ep}</td><td>${pubs}</td></tr></tbody></table></div>` +
    `<p class="note">${P.model || name}: ${P.calls} decisions requested, ${P.fails} came back as waits (offline, rate limit, warm-up or invalid)${P.kind === "gemma" ? "; " + ruled + " of P2's decisions came from the publish/target rule, the rest are Gemma's experiment choices" : ""}. Design efficiency counts the experiments each scientist prepared at the bench.</p>`;
  $("endCmp").hidden = false;
}
function initPartnerMenu() {
  const sel = $("partnerSel"), note = $("partnerNote"), btn = $("btnSolo");
  const sync = () => {
    const k = partnerChoice();
    btn.textContent = k ? "Start with " + PARTNERS[k].name : "Start solo";
    if (!api.ok) return;
    note.textContent = k ? PARTNERS[k].note + " You are P1 (WASD or arrows); your partner is P2." : "Play alone, or pick an AI lab partner to run the second scientist.";
    if (k === "gemma") fetch("/api/gemma/warm", { method: "POST" }).then(r => r.json()).then(j => { if (sel.value === "gemma") note.textContent = PARTNERS.gemma.note + (j.warm ? " The GPU is warm." : " Waking the GPU now…") + " You are P1 (WASD or arrows); Gemma's hands are P2."; }).catch(() => {});
  };
  sel.addEventListener("change", () => { sync(); sel.blur(); });
  const off = () => {
    api.ok = false;
    for (const o of sel.options) if (o.value) o.disabled = true;
    sel.value = "";
    note.innerHTML = 'AI lab partners (Gemini, our Gemma, Nemotron) run on the live site: <a href="' + LIVE_URL + '" target="_blank" rel="noopener">open the live demo</a>.';
    sync();
  };
  if (typeof fetch !== "function" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) { off(); return; }
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 5000);
  fetch("/api/status", { signal: ctl.signal, cache: "no-store" })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (!j || !j.ok) throw new Error("no api"); api.ok = true; api.models = j.partners || {}; for (const o of sel.options) o.disabled = false; sync(); })
    .catch(off);
}
try { initPartnerMenu(); } catch (e) { /* headless harness: no DOM or fetch */ }

