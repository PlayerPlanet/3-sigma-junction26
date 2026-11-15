// Test-only driver (never in the published page): ?mode=replay&t=SECONDS fast-forwards the replay; &theme=dark; &end=1
addEventListener("load", () => {
  const q = new URLSearchParams(location.search);
  if (q.get("theme")) document.documentElement.setAttribute("data-theme", q.get("theme"));
  if (q.get("mode") === "replay") {
    if (q.get("tr")) document.getElementById("traceSel").value = q.get("tr");
    document.getElementById("btnWatch").click();
    const tt = +(q.get("t") || 30);
    while (G && G.t < tt && state === "play") autoStep(tracePolicy);
    if (q.get("goggles")) setGoggles(true);
    syncGemLine();
    if (state === "play") { state = "pause"; pauseEl.hidden = true; } // freeze frame for screenshot
    document.title = "READY score=" + G.score + " recorded=" + auto.trace.final.score + " desync=" + auto.desync + " state=" + state;
  } else document.title = "READY";
});
