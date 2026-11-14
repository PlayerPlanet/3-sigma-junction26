// Seeds the SQLite database with demo players and finished sessions, so the leaderboard has rows.
//   npm run seed-db
// Runs the reference soap player headlessly (a careful plan, a sloppy one and a one-batch research guess)
// and stores each run exactly as the server would: seed + events, replayable with `npm run replay -- <id>`.
import { FAIR_SOAP_PLAN, playSoapOrder, type SoapPlan } from "@lab-rats/sim-core";
import { DEFAULT_CONTENT_DIR, loadContent, worldFromContent } from "@lab-rats/sim-core/node";
import { config } from "../apps/server/src/config.js";
import { openDb } from "../apps/server/src/db/index.js";
import { SessionStore, storeFinishedSim } from "../apps/server/src/db/store.js";

const content = loadContent(DEFAULT_CONTENT_DIR);
const db = openDb(config.dbPath);
const store = new SessionStore(db);

const demo: { player: string; scenario: string; plan: SoapPlan; seeds: number[] }[] = [
  { player: "Demo: careful script", scenario: "soap_order", plan: FAIR_SOAP_PLAN, seeds: [101, 102, 103] },
  { player: "Demo: skips the hood", scenario: "soap_order", plan: { ...FAIR_SOAP_PLAN, useHood: false }, seeds: [101, 102] },
  { player: "Demo: careful script", scenario: "soap_research", plan: FAIR_SOAP_PLAN, seeds: [201, 202] },
];
for (const d of demo) {
  const world = worldFromContent(content, { scenario: d.scenario });
  for (const seed of d.seeds) {
    const sim = playSoapOrder(world, seed, d.plan);
    const id = storeFinishedSim(store, d.player, d.scenario, sim);
    console.log(`session ${id}: ${d.player}, ${d.scenario}, seed ${seed} -> score ${sim.state.scenario!.score}`);
  }
}
console.log(`\nleaderboard (${config.dbPath}):`);
for (const r of store.leaderboard(undefined, 20)) console.log(`  ${r.scenario.padEnd(14)} ${r.player.padEnd(22)} best ${r.best}  (${r.runs} runs, avg ${r.average})`);
db.close();
