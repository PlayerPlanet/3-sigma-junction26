# Plan: Lab Rats as the Harbor environment

Goal: replace the placeholder number-guessing game in `tasks/example-env/` with the lab sim, so
`./scripts/eval.sh` runs a frontier agent against Lab Rats and it scores below our reference run.

Status (after milestones 1–8): step 1 is covered by `soap_order` and its scoring, and one fault exists for
step 4; steps 2 and 3 are not started. See `docs/NEXT_STEPS.md`.

Rule for every step: take the simplest option that works end to end. One scenario, one grader, one
fault. Anything not listed here waits until all four steps are done.

## 1. One scenario and its grader in sim-core

- Add one order to `content/scenarios/`, using the current placeholder chemistry, for example: "commit a
  flask holding at least 40 u of `reagent_a` + `reagent_b`, heated to at least 60 °C".
- Add `grade(world, state)` in `packages/sim-core/src/scoring/`. It reads only sim state (the first
  commit and the committed item's contents) and returns `{ reward }` in 0..1. No commit, or an empty or
  wrong item, scores 0.
- Tests: the scripted solution scores near 1; doing nothing scores 0; committing at once scores 0.

Done when `npm test` covers those three cases.

## 2. MCP server over sim-core

- `rl/mcp-server/`: a small Node server (TypeScript, `@modelcontextprotocol/sdk`, run with `tsx`) that
  holds one `Sim` seeded from `TASK_SEED`.
- Tools: `get_rules`, `get_lab` (stations, items, work levels), the six macros, `wait`, `read_log`,
  `status`, `commit`. Each robot tool submits the action, then runs the sim until that robot is idle, and
  returns the result plus new log lines. No wall clock: the sim advances only on tool calls, so a run is
  fully described by seed + events.
- Keep the existing contract so the rest of the task does not change: MCP on port 8000, `GET /grade` on
  port 8001 behind `GRADER_TOKEN`, returning `grade()` from step 1.

Done when the server starts locally and a short script can play the scenario through MCP and read a
non-zero grade.

## 3. Swap the Harbor task

- Point `tasks/example-env/environment/` at the new server: a Node `Dockerfile` for the `mcp-server`
  container, same `docker-compose.yaml` and `task.toml` server entry (rename to `lab-rats`).
- Rewrite `instruction.md` for the scenario. Rewrite `solution/solve.sh` as the reference run: the
  step-1 script, sent through the MCP tools.
- Adapt `baselines/stop_early.py` (commits immediately). The do-nothing baseline (`nop`) needs no change.
- Leave `tests/test.sh` as is; it already fails closed and reads only `/grade`.

Done when `SKIP_AGENT=1 ./scripts/eval.sh` shows reference > 0 and both baselines at 0.

## 4. One fault that breaks the agent

- Add one hidden fault, chosen from the seed, that leaves a clue in the lab log: for example the
  dispenser under-delivers by 30 %, logged as a low reading on the balance. An agent that follows the
  instruction without reading the log or checking with `analyze` commits too little and scores low.
- The reference run checks the log and corrects for it.
- Run `MODEL=<provider/model> ./scripts/eval.sh`, fill in the README results table, and write down why
  the agent fails (with excerpts from its trajectory) in the README.

Done when the agent's mean reward over 3 runs is below the reference, for the reason we wrote down.

## Not in this plan

Training (`rl/training/`), exporting reference runs from SQLite, more scenarios or faults, the LLM
controller, and anything in the web app.
