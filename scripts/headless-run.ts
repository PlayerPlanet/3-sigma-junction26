// Runs the fixed sim-core demo script headlessly on the default lab and prints the lab log and final state.
// Usage: npm run headless -- [seed]   (the scripted *controller* replaces this in milestone 7)
import { hashState, replay, runDemo, snapshot } from "@lab-rats/sim-core";
import { DEFAULT_CONTENT_DIR, loadContent, worldFromContent } from "@lab-rats/sim-core/node";

const world = worldFromContent(loadContent(DEFAULT_CONTENT_DIR));

const seed = Number(process.argv[2] ?? 1);
const sim = runDemo(world, seed);
for (const e of sim.state.log) console.log(`${String(e.tick).padStart(5)}  ${e.level.padEnd(6)} ${e.source.padEnd(12)} ${e.text}`);

const failed = sim.drainCompletions().filter((c) => !c.result.ok);
console.log(failed.length ? `\nfailed requests:\n${failed.map((c) => `  ${c.tick} ${c.robot} ${c.action.type}: ${c.result.reason}`).join("\n")}` : "\nall requests succeeded");

const snap = snapshot(world, sim.state);
console.log("\nitems:");
for (const it of snap.items) console.log(`  ${it.id.padEnd(9)} ${JSON.stringify(it.location)} ${JSON.stringify(it.contents)} ${it.temp}°C`);
const hash = hashState(sim.state);
const replayed = hashState(replay(world, seed, sim.events, sim.state.tick));
console.log(`\nseed ${seed}: ${sim.state.tick} ticks (${sim.state.tick / 10} s sim time), ${sim.events.length} events, waste ${sim.state.waste} u`);
console.log(`state hash ${hash}; replay ${replayed === hash ? "matches" : `DIFFERS (${replayed})`}`);
if (replayed !== hash) process.exit(1);
