// Re-runs a saved session headlessly from its seed + events and checks it ends the same way.
//   npm run replay -- run.json          (files written by `npm run play -- --save run.json`)
// Milestone 6 adds replaying sessions stored in SQLite.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { SimEvent } from "@lab-rats/shared";
import { replay } from "@lab-rats/sim-core";
import { DEFAULT_CONTENT_DIR, loadContent, worldFromContent } from "@lab-rats/sim-core/node";

const Saved = z.object({ scenario: z.string(), seed: z.number().int(), endTick: z.number().int(), events: z.array(SimEvent), score: z.number().nullable(), status: z.string() });
const file = process.argv[2];
if (!file) {
  console.error("usage: npm run replay -- <run.json>");
  process.exit(2);
}
const run = Saved.parse(JSON.parse(readFileSync(file, "utf8")));
const world = worldFromContent(loadContent(DEFAULT_CONTENT_DIR), { scenario: run.scenario === "none" ? null : run.scenario });
const state = replay(world, run.seed, run.events, run.endTick);
const got = { status: state.scenario?.status ?? "sandbox", score: state.scenario?.score ?? null };
const same = got.status === run.status && got.score === run.score;
console.log(`${file}: seed ${run.seed}, ${run.events.length} events, ${run.endTick} ticks -> ${got.status}, score ${got.score} (stored ${run.status}, ${run.score}) ${same ? "OK" : "MISMATCH"}`);
process.exit(same ? 0 : 1);
