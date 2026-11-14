# Architecture

Lab Rats is a browser game whose simulation is also a data-capture and RL environment. Every action by a
human, an LLM or a script goes through one action schema, is logged, and can be replayed exactly.

## Packages

```
packages/shared     types, zod schemas (actions, content, WS protocol), constants
packages/sim-core   the simulation: pure, deterministic, fixed tick, seeded PRNG, serializable state
apps/server         Fastify + WebSocket + SQLite; owns sessions, steps sim-core, stores events
apps/web            Vite + React + react-three-fiber; renders snapshots, sends actions
content/            JSON data (layouts, equipment, pathways, scenarios, faults), validated by zod
assets/             art files, addressed by id via assets/MANIFEST.md
rl/                 PLACEHOLDER: the RL stack (see docs/PLAN.md and docs/NEXT_STEPS.md)
scripts/            seed-db, replay, headless-run, play (run from the repo root with tsx)
```

Dependency direction (enforced by convention, and for sim-core by `packages/sim-core/test/purity.test.ts`):

```
shared  <-  sim-core  <-  server
shared  <-------------------  web
```

`web` never imports `sim-core`: the browser holds no game rules.

## Data flow

```
 keyboard / HUD                         LLM / scripted / mock controllers
       |  primitive actions                         |  macro actions
       v                                            v
   web (net/) ---- WebSocket ----> server (sessions/) ---> sim-core.step(state, action)
       ^                                 |                         |
       |  state snapshots                |  append event           v
   web (state/ -> scene/, hud/)          +-----------> SQLite events (session, tick, actor, robot, action, result)
```

- The server is authoritative. It steps each session on a fixed tick and streams snapshots.
- Macros are expanded into primitives inside sim-core; the event log stores **primitives**.
- A session is reproducible from `seed + events`. `scripts/replay.ts` re-runs a stored session headlessly
  and asserts the same final score.

## Coordinates and conventions

Metres. Origin at the room centre on the floor; +x along the long axis, +z across it (north wall at
negative z), +y up. Headings are radians measured from +x toward +z (`atan2(dz, dx)`). Every model and
primitive has its origin at the base centre and its front facing -z; `scene/rotation.ts` converts a
heading to a three.js rotation.

## Static lab (milestone 2)

```
content/*.json --zod--> server/content/load.ts --> sim-core buildLabView() --> WS "lab" message --> web scene
```

sim-core owns all lab geometry: cross-reference validation (`world/validate.ts`), rail arcs and sampling
(`world/rails.ts`), station targets and item slot positions (`world/stations.ts`, `world/view.ts`), robot
start poses (`robots/pose.ts`). The web app draws rails from the sampled polylines it receives and never
computes rail geometry itself.

## Simulation core (milestone 3)

```
controllers --submit(actor, action)--> Sim (runner)            pure
                                        |  per-robot queues      step(world, state, inputs) -> state'
                                        |  macro expansion  ---->   1. apply inputs in order
                                        |  controller rules         2. robots advance (id order)
                                        v                           3. equipment ticks (id order)
                                      event log  <---------------   4. cooling, tick++
                                        |
                                        +--> replay(world, seed, events, endTick) == same state hash
```

- `World` (`compileWorld`) is static and precomputed: rail graph with integer mm lengths, places
  (equipment and hoods) with work level, reach and capacity.
- `SimState` is plain JSON of integers: rail position as segment + mm progress, hand level and extension
  percent, liquids as integer units per reagent, the PRNG as one uint32. `hashState` hashes its canonical
  JSON. Trig and metres exist only in `world/view.ts` (`snapshot()`), which never feeds back into state.
- Equipment rules live in one file per type in `sim-core/src/equipment/`.
- The server owns wall-clock timing only: `SessionHost` calls `sim.tick()` every 100 ms and streams a
  `snapshot` message per tick. Browser actions arrive as `action` messages and are attributed to `human`.

## Scenarios and scoring (milestones 5 and 8)

A scenario gives the session a goal, a budget and a hidden truth drawn from the seed (the pathway's best
share and temperature, and faults). `scoring/scenario.ts` ends the session on `commit` or timeout and
writes the score into state, so a replay reproduces it:

- **order**: commit the product vessel; the score comes from its true yield (`chemistry/pathway.ts`).
- **research**: commit an answer `{ add_share, temp }`; the score is its distance from the hidden truth.
  Analyzer runs are budgeted.

Snapshots never contain the hidden truth while the session runs; it is revealed on commit.

## Sessions and persistence (milestone 6)

```
SessionHost.advance() --new events--> SessionRecorder --> SQLite: players, sessions, events
                                                              |
        npm run replay -- <id>  <--- seed + ordered events ---+---> leaderboard view --> GET /api/leaderboard
```

- `apps/server/src/db/`: append-only migrations and `SessionStore` (every query). A session row holds the
  player, scenario, seed and sim-core version; its events are stored in order as JSON. That is all a
  replay needs (`sim-core` `replay()`); a test checks a stored session replays to the same state hash.
- A session ends as `committed`, `timeout`, or `abandoned` (restarted or server stopped before it ended).
- The leaderboard is a SQL view: best finished score per player and scenario.

## Controllers (milestone 7)

A robot's controller slot (`human`, `llm`, `script`, `idle`) lives in sim state; who actually sends the
actions is the server's business:

```
human  -> browser keyboard over WebSocket
script -> agents/scripted/ScriptedDriver   plays a ScenarioScript from sim-core/players, then commits
llm    -> agents/llm/LlmDriver             tool-use loop over a provider adapter (gemini | anthropic)
          agents/mock/MockDriver           when no LLM key + model is set: wanders, never commits
external agents -> HTTP /api/agent/* as the llm or script actor (they drive the robots they claim)
```

`SessionHost` attaches a built-in driver when a human or the session config sets a robot to `script` or
`llm`, calls it after every advance with the completion notices for that robot, and detaches it on any
later `set_controller` (takeover). Drivers see what any agent sees: snapshots, the briefing and the lab
log. The LLM's tools are generated from the zod action schemas, so they cannot drift from the sim.

## Rules

- sim-core: no DOM, rendering, network, `node:` imports, wall-clock time or `Math.random`. It must run in
  plain Node so the RL stack can import it.
- web: renders snapshots and sends actions; nothing else.
- Content is data. New equipment, pathways or scenarios should normally need a JSON file, not new code.

## Runtime

- `npm run dev` starts the server (port 8790, `tsx watch`) and Vite (port 5173). Vite proxies `/api` and
  `/ws` to the server, so the browser only talks to `localhost:5173`.
- Workspace packages are consumed as TypeScript source (no build step); `tsx` and Vite compile on the fly.
