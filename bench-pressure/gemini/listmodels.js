const { loadKey } = require("./env");
(async () => {
  const key = loadKey();
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
  const j = await r.json();
  if (!j.models) { console.log("status", r.status, JSON.stringify(j).slice(0, 300)); return; }
  for (const m of j.models) if (/gemini/.test(m.name)) console.log(m.name, "|", m.displayName, "|", (m.supportedGenerationMethods||[]).join(","), "| thinking:", m.thinking);
})();
