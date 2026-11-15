// Loads GDM_API_KEY from the team repo's git-ignored .env into process.env. Never prints it.
const fs = require("fs");
const ENV = "C:/Users/Käyttäjä/documents/projects/hackathons/3-sigma-junction26/.env";
function loadKey() {
  if (process.env.GDM_API_KEY) return process.env.GDM_API_KEY;
  for (const line of fs.readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?GDM_API_KEY\s*=\s*["']?([^"'\s#]+)/);
    if (m) { process.env.GDM_API_KEY = m[1]; return m[1]; }
  }
  throw new Error("GDM_API_KEY not found");
}
module.exports = { loadKey };
