// Re-runs a session headlessly from its seed + events and checks it ends the same way.
//   npm run replay -- 12                (a session id stored in SQLite by the server)
//   npm run replay -- run.json          (a file written by `npm run play -- --save run.json`)
import { readFileSync } from "node:fs";
import { z } from "zod";
import { SimEvent } from "@lab-rats/shared";
import { replay } from "@lab-rats/sim-core";
import { DEFAULT_CONTENT_DIR, loadContent, worldFromContent } from "@lab-rats/sim-core/node";

const Saved = z.object({ scenario: z.string().nullable(), seed: z.number().int(), endTick: z.number().int(), events: z.array(SimEvent), score: z.number().nullable(), status: z.string() });
type Saved = z.infer<typeof Saved>;

async function fromDb(id: number): Promise<Saved> {
  const { config } = await import("../apps/server/src/config.js");
  const { openDb } = await import("../apps/server/src/db/index.js");
  const { SessionStore } = await import("../apps/server/src/db/store.js");
  const db = openDb(config.dbPath);
  const store = new SessionStore(db);
  const s = store.session(id);
  if (!s) throw new Error(`no session ${id} in ${config.dbPath}`);
  const events = store.events(id);
  db.close();
  // A session without an end tick (still running, or abandoned at tick 0) replays up to its last event.
  return { scenario: s.scenario, seed: s.seed, endTick: s.endTick ?? (events.at(-1)?.tick ?? 0) + 1, events, score: s.score, status: s.status };
}

const arg = process.argv[2];
if (!arg) {
  console.error("usage: npm run replay -- <session id | run.json>");
  process.exit(2);
}
const run = /^\d+$/.test(arg) ? await fromDb(Number(arg)) : Saved.parse(JSON.parse(readFileSync(arg, "utf8")));
const scenario = run.scenario === "none" ? null : run.scenario;
const world = worldFromContent(loadContent(DEFAULT_CONTENT_DIR), { scenario });
// Sessions end one tick after their end tick is stamped; replaying one extra tick is harmless.
const state = replay(world, run.seed, run.events, run.endTick + 1);
const got = { status: state.scenario?.status ?? "sandbox", score: state.scenario?.score ?? null };
// Abandoned and sandbox sessions have no outcome to compare; replaying without an error is the check.
const comparable = run.status === "committed" || run.status === "timeout";
const same = !comparable || (got.status === run.status && got.score === run.score);
console.log(`${arg}: seed ${run.seed}, ${run.events.length} events, ${run.endTick} ticks -> ${got.status}, score ${got.score} (stored ${run.status}, ${run.score}) ${same ? "OK" : "MISMATCH"}`);
process.exit(same ? 0 : 1);
