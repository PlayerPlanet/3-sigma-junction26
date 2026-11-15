// Headless Chrome smoke test of the live site: node cdp_game.js <url> <partner> <seconds> <out.png>
// Opens the page, picks the lab partner, starts a game (P1 idle), lets it run in real time, and reports
// what P2 did. Uses only the DevTools protocol (Node's built-in WebSocket); test-only, not part of the page.
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const [url, kind, secs, out] = [process.argv[2], process.argv[3], +process.argv[4] || 60, process.argv[5]];
const CH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9300 + Math.floor(Math.random() * 500);
const prof = path.join(__dirname, "_vol", "prof_" + kind + "_" + Date.now());
const chrome = spawn(CH, ["--headless=new", "--disable-gpu", "--no-first-run", "--window-size=1500,1100", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let tgt;
  for (let i = 0; i < 50 && !tgt; i++) { try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page"); } catch (e) { await sleep(200); } }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r));
  let id = 0; const wait = new Map(); const errors = [];
  ws.addEventListener("message", (m) => {
    const j = JSON.parse(m.data);
    if (j.id && wait.has(j.id)) { wait.get(j.id)(j); wait.delete(j.id); }
    if (j.method === "Runtime.exceptionThrown") errors.push(j.params.exceptionDetails.exception?.description || j.params.exceptionDetails.text);
    if (j.method === "Runtime.consoleAPICalled" && j.params.type === "error") errors.push(j.params.args.map(a => a.value).join(" "));
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url });
  for (let i = 0; i < 40; i++) { await sleep(250); if (await ev("typeof api !== 'undefined' && api.ok")) break; }
  const ok = await ev("api.ok");
  console.log(kind, "api.ok", ok, "note:", (await ev("document.getElementById('partnerNote').textContent")).slice(0, 90));
  await ev(`(() => { const s = document.getElementById('partnerSel'); s.value = '${kind}'; s.dispatchEvent(new Event('change')); return s.value; })()`);
  await sleep(500);
  console.log("button:", await ev("document.getElementById('btnSolo').textContent"));
  await ev("document.getElementById('btnSolo').click()");
  const t0 = Date.now();
  const snap = `(() => { const P = partner; if (!P) return null; const log = P.bot.log, st = G.stats, ds = G.hist.designs;
    return { t: +G.t.toFixed(1), status: P.inflight ? 'thinking' : P.status, calls: P.calls, fails: P.fails, lastMs: Math.round(P.lastMs), model: P.model,
      decisions: log.length, runs: log.filter(r => r.a === 'run').length, publishes: log.filter(r => r.a === 'publish').length, byRule: log.filter(r => r.by === 'rule').length,
      p2designs: ds.filter(d => d.by === 1).length, platesRead: st.experiments, papers: st.papers, retractions: st.retractions, score: G.score, rackCount: [...G.stations.values()].find(s => s.type === 'rack').count,
      last: log.length ? (({ a, tk, e, why, eig, best, by, status }) => ({ a, tk, e, why: (why || '').slice(0, 110), eig: eig && +eig.toFixed(3), best: best && +best.toFixed(3), by, status }))(log[log.length - 1]) : null,
      gemLine: document.getElementById('gemLine').textContent.slice(0, 160), chartErr: charts.err || null }; })()`;
  let s;
  while (Date.now() - t0 < secs * 1000) {
    await sleep(10000);
    s = await ev(snap);
    console.log(JSON.stringify({ wall: Math.round((Date.now() - t0) / 1000), ...s, last: undefined, gemLine: undefined }));
  }
  console.log("last decision:", JSON.stringify(s.last));
  console.log("gemLine:", s.gemLine);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  if (out) fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  const html = await ev("document.documentElement.outerHTML");
  console.log("page errors:", errors.length ? errors.slice(0, 5) : "none", "| html bytes", html.length);
  ws.close(); chrome.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
