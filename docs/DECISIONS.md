# Decisions

Notable choices, newest last. When the spec was ambiguous, the simpler option was taken and noted here.

## 2026-11-14 · Milestone 1 (scaffold)

1. **The monorepo lives at the repo root next to the existing Python Harbor scaffold.** `tasks/`,
   `baselines/`, `tests/`, `scripts/eval.sh` and the MLflow scaffold (`src/`, `config/`, `Dockerfile*`)
   are left in place because CI and `eval.sh` depend on those paths. `rl/` is a placeholder; when the lab
   sim replaces the placeholder Harbor game, its MCP server, graders and baselines will move to or be
   generated from `rl/`.
2. **`scripts/` is shared.** The existing shell/Python eval scripts stay; the game's `seed-db`, `replay`
   and `headless-run` are TypeScript files there, run with `tsx` via root npm scripts.
3. **No build step for workspace packages.** `shared` and `sim-core` export their `src/index.ts`; the
   server runs under `tsx`, the web app under Vite. If the RL stack needs plain-JS output from sim-core,
   add a `tsc` build to that package then.
4. **Current major versions** (React 19, react-three-fiber 9, three 0.187, Vite 8, Vitest 5, zod 4,
   Fastify 5, better-sqlite3 13, TypeScript 7), chosen because the older majors had open advisories and
   a fresh scaffold is the cheapest time to move.
5. **Env loading** uses Node's built-in `process.loadEnvFile` on the repo-root `.env` (no dotenv).
   `DB_PATH` resolves relative to the repo root. Node >= 22 is required.
6. **The AI controller is available only when an API key and a model id are set**, so there is no
   hardcoded model id; otherwise robots use the mock controller. (Superseded in part by M2 #1.)
7. **Ports:** server 8790 (8787 is the MLflow serve port, 5000 MLflow), web 5173. Vite proxies `/api` and
   `/ws` so the browser has a single origin.
8. **sim-core purity is tested**, not just documented: `packages/sim-core/test/purity.test.ts` fails on
   imports of web/server/three/react/`node:` and on `Math.random`, `Date.now`, `new Date`,
   `performance.now`, `window.`, `document.`, `fetch(` in sim-core source.
9. **DB migrations are an append-only list** in `apps/server/src/db/migrations.ts`, tracked in a
   `schema_version` table. Milestone 1 ships none; tables come in milestone 6.

## 2026-11-14 · Milestone 2 (static lab)

1. **The AI controller is provider-neutral, Gemini by default.** The team expects to use Gemini credits.
   The controller kind and event actor are `llm` (not `claude`), `agents/claude/` became `agents/llm/`, and
   the provider comes from `LLM_PROVIDER` (`gemini` | `anthropic`) with `LLM_MODEL` and the provider's key
   (`GEMINI_API_KEY` / `ANTHROPIC_API_KEY`). Keeping Anthropic as an option costs one adapter file in M7.
2. **The server sends the static lab as one `lab` WebSocket message** (layout, equipment types, sampled rail
   polylines, robot poses, item positions), built by sim-core. Live snapshots replace the pose part in M3.
3. **sim-core computes rail polylines; the web only draws them,** so there is one rail-geometry
   implementation for the browser, the server and later RL.
4. **Room, table and hoods are registry assets too** (`lab.room`, `lab.table.stadium`, `lab.hood`), sized
   from the layout. Rails are not: they are generated from the rail graph.
5. **`assets/MANIFEST.md` is the single source of the id -> file mapping.** The web app imports it raw and
   parses its table; Vite serves `assets/` as the public dir. A test checks every manifest id has a
   primitive and every equipment `assetId` is in the manifest.
6. **Labels are a plain DOM overlay projected each frame**, not drei `<Html>`: drei creates one React root
   per label, which raced under React 19 StrictMode and dropped labels.
7. **Shadows use PCF with a blur radius**: three 0.187 removed `PCFSoftShadowMap`.
8. **Default lab:** 16 x 10 m room; 7.4 m x 2.4 m stadium table; a 12-segment loop at 0.8 m from the table
   edge with 8 table stations; one straight rail per long wall with 3 hoods each; one connector from each
   wall rail to the loop. Robots start at the dispenser, the analyzer and hood S1. Fume hoods are empty
   for now; which steps require a hood is pathway data (M5).
9. **Item positions** are computed from slots on their host equipment (glassware rack, 5 slots); liquids
   are not shown until there is state to show (M5).
10. **Heads-up for M3:** `Math.sin/cos/atan2` are not guaranteed bit-identical across JS engines. Robot
    poses are derived for rendering only; the deterministic state hash in M3 must use rail positions
    (segment id + distance), not derived trig values.

## 2026-11-14 · Milestone 3 (sim core)

1. **Integers only in `SimState`.** Rail position = segment + progress in mm (segment lengths rounded to
   mm once at compile time), hand level, extension percent, liquid units, temperature °C, the PRNG as one
   uint32. A test walks the state and fails on any non-integer. This makes the state hash stable across
   JS engines (trig results are not guaranteed bit-identical).
2. **Two layers.** `step(world, state, inputs)` is pure physics on plain data. `Sim` is the runner:
   per-robot queues, macro expansion, controller rules, completion notices. Only step inputs are needed to
   replay, so the event log records primitives and session actions; macro requests are logged as
   annotations for data capture and skipped by replay.
3. **Macros expand lazily** (when the robot reaches them in its queue) against the current state, into a
   fixed plan. A plan stops at the first failed primitive.
4. **A failed request clears the rest of the robot's queue.** Found in live testing: after a blocked
   `place`, queued presses ran at whatever station the robot had stopped at. Continuing is unsafe for
   scripts and LLMs; humans rarely queue more than one thing.
5. **`move_along_rail` takes a target (`to`: station or node), not a direction.** "Forward/back" is
   ambiguous at junctions. The keyboard controller (M4) will pick the adjacent node in the pressed
   direction from the layout, which is presentation logic, and send it as `to`.
6. **Every robot action carries `robot`, including `wait`.** Queues are per robot.
7. **Rail rule:** one robot per segment, a parked robot blocks its node (stations included), a moving
   robot reserves its next node. No re-routing; a robot waiting more than 10 s fails with `blocked`.
   Head-on deadlocks resolve by both timing out. This makes robot placement part of the procedure.
8. **Hand rules:** hands move vertically only when retracted; the robot moves only with both hands
   retracted; extending below a place's work level at its station is a collision. Grip, release, pour and
   press need the hand "on the spot" (work level, +1 to pour, reach ±10 %). Work level and reach are
   precomputed per place and visible to controllers.
9. **`grip`, `release` and `tilt_pour` take an optional `slot`** (not in the original sketch) so macros can
   address a specific beaker on the 5-slot rack. Without it, the first occupied/free slot is used.
10. **Cancellation safe points:** a move stops at its next rail node, `wait` and `tilt_pour` stop at once,
    short primitives (≤ a few ticks) finish. `set_controller` cancels and clears the queue, so takeover is
    one action; hand-back is another `set_controller`.
11. **`system` actor** added for session setup (initial controllers are logged as `set_controller` at
    tick 0, so a session is fully described by seed + events). Robots start `idle` in raw state; the live
    session assigns `human` to all three for now.
12. **Placeholder chemistry until M5:** the dispenser cycles `reagent_a/b/c` and adds 20 u per press, the
    hotplate heats vessels toward 20 + 15 × heat °C, the analyzer reports volume, temperature and noisy
    component shares after 3 s, the balance reports tare + volume ±1 g. The noise uses the seeded PRNG,
    so readings differ by seed and replay exactly.
13. **Equipment `holdOffset`** (new optional content field) says where a vessel sits on single-slot
    equipment, for rendering only.
14. **State is cloned with JSON per tick** for purity. Fine at 3 robots and 10 Hz; revisit if RL needs
    much faster stepping.
15. **The live server runs one session**, seeded from `SEED` or a random seed (logged). Sessions, players
    and persistence come in M6.

## 2026-11-14 · Milestones 4–5 (human play, soap order) and agent access

1. **No mast-mounted "takeover" camera yet** (deferred at the user's request); the orbit overview is the
   only view. Arrow keys follow the camera's facing, so a mast camera can be added later without changing
   the keymap.
2. **Keyboard teleoperation is a pure function** (`controllers/keyboard/keymap.ts`: key + snapshot ->
   action), unit-tested. Repeated key presses stack on the last target sent while the robot is busy.
   Key repeat is ignored: one press, one step.
3. **The browser holds no rules:** "on spot" hints, work levels and reach come from sim-core (snapshot
   `hands[].spot`, LabView `places`). Snapshots are interpolated per frame for smooth motion.
4. **Robots start at docks** (rail ends) instead of stations: r2 starting at the analyzer blocked it for
   everyone. Layout field `startStation` became `start` (station or node id). r1 still starts at the
   dispenser.
5. **Routing goes round parked robots, and head-on meetings fail immediately** with a clear reason,
   found when two robots deadlocked at the loop junction.
6. **Hotplate heat is 0..15 in 5 °C steps** (was 0..10 in 15 °C steps): with coarse steps even a perfect
   player could not reach some seeds' optimum.
7. **Yield model** = product of factor scores (ratio, temperature, time, stirring, hood, purity, filter,
   faults) + per-run noise drawn when the reagents first meet (so observing does not change the truth).
   The analyzer adds its own noise. Balance check over 20 seeds: fixed mid-range guesses average score 43,
   the oracle 81, skipping the hood 21. A player who uses the analyzer to tune can close most of the gap.
8. **Faults placeholder**: interface + one example (`contaminated_glassware`, 35 % chance in the soap
   order): yield x0.65 for anything made in that vessel, with a clue when it is first picked up.
9. **Sessions end on commit (orders) or timeout**; afterwards primitives are rejected. The true yield and
   score are revealed on commit.
10. **Live server robots start `idle`.** A human presses T to claim one, an agent sends `set_controller`.
    Agents (`llm`/`script`) may only claim idle robots or act on their own; humans can always take over.
11. **Agent access ahead of M7**: an HTTP agent API on the live server and a headless JSON-lines CLI
    (`npm run play`), both with the same briefing (`sim-core/src/agent/briefing.ts`). This is what an
    LLM controller (M7) or the Harbor MCP server (rl/) will wrap.
12. **Reference soap player** (`sim-core/src/players/soapOrder.ts`): fair and oracle variants using
    only the public action space; tests and balance checks use it. The scripted controller in M7 will
    reuse it.
13. **Content loading for Node** lives in `@lab-rats/sim-core/node` (outside `src/`, so sim-core stays
    pure); server, tests and scripts share it.
14. **`npm run replay -- run.json`** replays runs saved by the CLI. Replaying sessions stored in SQLite
    remains milestone 6.

## 2026-11-14 · Milestones 6–8 (persistence, controllers, research scoring)

No written spec existed for these milestones; their scope was rebuilt from the notes earlier milestones
left in the code and READMEs. Where that left a choice, the simpler option was taken.

1. **Schema:** `players`, `sessions`, `events` and a `leaderboard` view, in one migration. Events are
   stored in order as JSON rows; a session is seed + scenario + events. Sandbox sessions are stored too.
2. **Session outcomes are `committed`, `timeout` or `abandoned`.** A session that is restarted, or still
   running when the server stops, is closed as abandoned and never reaches the leaderboard.
3. **Players are just names.** The browser sends the name with `POST /api/session` and remembers it in
   localStorage; without one the session is recorded for `anonymous`. No accounts or auth.
4. **Wall-clock timestamps exist only in SQLite** (`started_at`, `ended_at`), never in sim state.
5. **`npm run replay -- <id>` replays a stored session**; `-- run.json` still replays CLI saves. A stored
   session ends one tick after its `end_tick`, so replay runs to `end_tick + 1`.
6. **`npm run seed-db` stores real runs** of the reference player (careful, no-hood, research guess), not
   invented rows, so every seeded session replays.
7. **Built-in controllers are server-side "drivers"** behind one small interface (`agents/types.ts`),
   using the same action space and information as external agents. sim-core knows nothing about them.
8. **Who gets a driver:** a robot set to `script` or `llm` by a human, or by the session config, is driven
   by the server. A robot an external agent claims as the `llm`/`script` actor is not, so the HTTP agent
   API keeps working unchanged. Any later `set_controller` on the robot detaches the driver.
9. **The scripted controller plays one batch and commits.** It reuses the reference soap player, now
   split into phases (`soapScript`) so the same script runs headlessly and tick by tick on the server. It
   is tied to the default lab's ids. If a step fails it sets the robot idle and logs why.
10. **The mock controller only wanders** between free stations: no glassware, no commit. It is the `llm`
    controller when no key + model is set, enough to try takeover and rail blocking offline.
11. **The LLM controller is a tool-use loop per robot**, called when the robot is idle. Tools are all
    primitives and macros plus `read_log` and `commit`, generated from the zod schemas; the robot is
    implied. The conversation is capped at 40 messages. Three failed model calls in a row hand the robot
    back. Gemini goes through REST, Claude through the official SDK. **Neither adapter has been run
    against its live API yet** (no key); the loop is tested with a fake client and the Gemini request
    shape with a fake fetch.
12. **T hands a robot back to whoever had it** (idle stays idle). Before, an idle robot was handed to
    `llm`, which would now start the mock wandering.
13. **Research questions reuse the pathway's hidden optimum** as the truth. The answer is two whole
    numbers (`add_share` in percent, `temp` in °C) so state stays integer-only. Score: 50 points each,
    linear to zero at the scenario's tolerance, minus the reagent overspend penalty; waste is not
    penalised because test batches must be discarded.
14. **"N runs" is a budget of analyzer runs**, counted in state (`analyses`); the analyzer refuses more.
    Time and reagents are budgeted as for orders.
15. **A commit of the wrong kind is rejected** (a vessel for a research question, an answer for an
    order) and the session continues.
16. **The browser got a commit form** (vessel picker or answer fields), the leaderboard and a
    new-session form in the top panel. Before this there was no way to commit from the browser.
17. **Unlisted robots default to idle** when a session is started with a partial `controllers` map.
18. **Two M5 implementations existed for a while.** A parallel "citrus ester" M5 was built in a separate
    worktree and dropped in favour of the soap M5 already in the main tree; nothing from it is merged.
