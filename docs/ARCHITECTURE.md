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
rl/                 PLACEHOLDER: the RL stack (see docs/DECISIONS.md for how it relates to tasks/)
scripts/            seed-db, replay, headless-run (run from the repo root with tsx)
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
- The server owns wall-clock timing only: `LiveSession` calls `sim.tick()` every 100 ms and streams a
  `snapshot` message per tick. Browser actions arrive as `action` messages and are attributed to `human`.

## Rules

- sim-core: no DOM, rendering, network, `node:` imports, wall-clock time or `Math.random`. It must run in
  plain Node so the RL stack can import it.
- web: renders snapshots and sends actions; nothing else.
- Content is data. New equipment, pathways or scenarios should normally need a JSON file, not new code.

## Runtime

- `npm run dev` starts the server (port 8790, `tsx watch`) and Vite (port 5173). Vite proxies `/api` and
  `/ws` to the server, so the browser only talks to `localhost:5173`.
- Workspace packages are consumed as TypeScript source (no build step); `tsx` and Vite compile on the fly.
