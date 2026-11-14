// Headless play for agents: one JSON request per stdin line, one JSON reply per stdout line.
// Same action space and rules as the browser and the HTTP API; no wall clock, so it runs as fast as you send.
//
//   npm run -s play -- [--scenario soap_order] [--seed 1] [--actor llm] [--save run.json]
//
// Requests:  {"cmd":"briefing"}  {"cmd":"observe"}  {"cmd":"act","action":{...}}  {"cmd":"wait","robot"?:"r1","maxTicks"?:600}
//            or just an action object, e.g. {"type":"go_to","robot":"r1","station":"st_balance"} (= act)
// Scenarios: soap_order (commit the vessel), soap_research (commit an answer), none (sandbox).
// The run ends on commit or when time runs out; the reply to the last request includes the final score.
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { Action, ActorSchema } from "@lab-rats/shared";
import { Sim, briefing, snapshot } from "@lab-rats/sim-core";
import { DEFAULT_CONTENT_DIR, loadContent, worldFromContent } from "@lab-rats/sim-core/node";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
};
const scenario = arg("scenario", "soap_order");
const seed = Number(arg("seed", String(Math.floor(Math.random() * 2 ** 31))));
const actor = ActorSchema.parse(arg("actor", "llm"));
const save = arg("save", "");

const world = worldFromContent(loadContent(DEFAULT_CONTENT_DIR), { scenario: scenario === "none" ? null : scenario });
const sim = new Sim(world, { seed, controllers: { r1: "idle", r2: "idle", r3: "idle" } });

const Request = z.union([
  z.object({ cmd: z.literal("briefing") }),
  z.object({ cmd: z.literal("observe") }),
  z.object({ cmd: z.literal("act"), action: Action }),
  z.object({ cmd: z.literal("wait"), robot: z.string().optional(), maxTicks: z.number().int().min(1).max(6000).default(600) }),
  Action,
]);

const status = () => sim.state.scenario?.status ?? "sandbox";
const ended = () => status() === "committed" || status() === "timeout";
const summary = () => ({ status: status(), tick: sim.state.tick, score: sim.state.scenario?.score ?? null, trueYield: sim.state.scenario?.trueYield ?? null, answer: sim.state.scenario?.answer ?? null });
const idle = (id: string) => !sim.state.robots[id]!.task && sim.queueLength(id) === 0;

function handle(line: string): unknown {
  let parsed;
  try {
    parsed = Request.safeParse(JSON.parse(line));
  } catch {
    return { ok: false, reason: "not JSON" };
  }
  if (!parsed.success) {
    // Explain against the action schema when it looks like an action, else against the request shapes.
    const raw = JSON.parse(line);
    const inner = raw && typeof raw === "object" && "cmd" in raw ? raw.action : raw;
    const err = inner && typeof inner === "object" && "type" in inner ? Action.safeParse(inner).error ?? parsed.error : parsed.error;
    return { ok: false, reason: err.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ") };
  }
  const req = parsed.data;
  if ("cmd" in req && req.cmd === "briefing") return { ok: true, seed, ...briefing(world, sim.state) };
  if ("cmd" in req && req.cmd === "observe") return { ok: true, snapshot: snapshot(world, sim.state), completions: sim.drainCompletions() };
  if ("cmd" in req && req.cmd === "wait") {
    const mine = req.robot ? [req.robot] : world.robotIds.filter((id) => sim.state.robots[id]!.controller === actor);
    const start = sim.state.tick;
    do sim.tick();
    while (!ended() && sim.state.tick - start < req.maxTicks && !mine.every(idle));
    return { ok: true, ticks: sim.state.tick - start, snapshot: snapshot(world, sim.state), completions: sim.drainCompletions(), ...summary() };
  }
  const action = "cmd" in req ? req.action : req;
  const res = sim.submit(actor, action);
  // Session actions (commit, set_controller, cancel) apply on the next tick.
  if (["commit", "set_controller", "cancel"].includes(action.type)) sim.tick();
  return { ...res, ...(action.type === "commit" ? summary() : {}) };
}

const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  if (!line.trim()) continue;
  console.log(JSON.stringify(handle(line)));
  if (ended()) break;
}
if (save) writeFileSync(save, JSON.stringify({ scenario, seed, endTick: sim.state.tick, events: sim.events, ...summary() }, null, 1));
console.error(`[play] ${JSON.stringify(summary())}${save ? ` saved to ${save}` : ""}`);
process.exit(0);
