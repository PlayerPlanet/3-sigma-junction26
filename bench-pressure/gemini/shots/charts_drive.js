// Test-only driver (never in the published page). ?mode=replay&tr=I&t=SECONDS&theme=dark&hover=ent,0.6,0.5
addEventListener("load", () => {
  const q = new URLSearchParams(location.search);
  if (q.get("theme")) document.documentElement.setAttribute("data-theme", q.get("theme"));
  let msg = "READY";
  if (q.get("mode") === "replay") {
    if (q.get("tr")) document.getElementById("traceSel").value = q.get("tr");
    document.getElementById("btnWatch").click();
    const tt = +(q.get("t") || 30);
    while (G && G.t < tt && state === "play") autoStep(tracePolicy);
    syncGemLine();
    if (state === "play") { state = "pause"; pauseEl.hidden = true; }
    const endLine = document.getElementById("endLine").textContent;
    msg = "READY score=" + G.score + " recorded=" + auto.trace.final.score + " desync=" + auto.desync + " state=" + state + " exact=" + /matched the recorded run exactly/.test(endLine) + " designs=" + G.hist.designs.length + " reads=" + G.hist.reads.length + " events=" + G.hist.events.length;
  }
  if (q.get("hover")) {
    const [k, fx, fy] = q.get("hover").split(",");
    const cv = document.querySelector('[data-chart="' + k + '"] canvas'), r = cv.getBoundingClientRect();
    setTimeout(() => { cv.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width * +fx, clientY: r.top + r.height * +(fy || 0.5), bubbles: true })); charts.last = 0; drawCharts(performance.now() + 1e4); }, 50);
  }
  const de = document.documentElement;
  setTimeout(() => { document.title = msg + " err=" + charts.err + " tip=" + [...document.querySelectorAll(".tip")].map(t => t.hidden ? 0 : 1).join("") + " sw=" + de.scrollWidth + " iw=" + innerWidth + " sh=" + de.scrollHeight + " ih=" + innerHeight; }, 1500);
});
