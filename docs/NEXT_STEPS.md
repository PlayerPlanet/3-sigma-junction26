# Next steps

Where the game stands after milestones 1–8, and what to do next, most important first.

## Where we are

The first working version is in place: a playable soap order and a soap research question, keyboard
play, a scripted controller, an LLM controller (mock without a key), SQLite persistence with replay and
a leaderboard, and an agent API over HTTP and a headless CLI.

What has been checked: `npm test` (156 unit tests) and `npm run typecheck` pass. What has **not** been
checked: the server and the browser app were not started after milestones 6–8, so the new HUD (commit
form, leaderboard, new-session form), the new HTTP routes and the npm scripts `seed-db` and `replay`
have only been typechecked, not run.

## 1. Play it once, end to end

1. `npm run dev`, open http://localhost:5173.
2. Take a robot over (`1`, `T`), make a batch, press **Commit vessel**. Check the score, the leaderboard
   and the new-session form appear.
3. Start `Research: the best soap recipe`, check the analyzer-runs counter and the answer form.
4. Set a robot to `script` in the robot list and watch it play and commit. Set one to `llm` and check
   the mock wanders and that `T` takes it back.
5. `npm run seed-db`, then `npm run replay -- 1`. Expect `OK`.

Fix whatever this turns up before anything else.

## 2. Turn on the real LLM controller

Needs an API key, which we do not have yet.

1. Set `LLM_PROVIDER`, `LLM_MODEL` and the provider's key in `.env`, restart, set a robot to `llm`.
2. Neither adapter has made a live call. Expect to fix request details first: `agents/llm/gemini.ts`
   (tool schema format, thought signatures) or `agents/llm/anthropic.ts`.
3. Then tune the prompt in `agents/llm/LlmDriver.ts`. The model is called each time its robot goes idle,
   so one session is a few dozen calls. Watch the cost per session before running many.
4. Not done: streaming, prompt caching, a per-session token budget, and showing the model's reasoning in
   the HUD.

## 3. Make it the Harbor environment (the actual challenge)

`docs/PLAN.md` has the four steps. Status:

- Step 1 (scenario + grader): done differently. `soap_order` and its scoring exist, as a 0–100 score in
  sim state. The Harbor reward is that score divided by 100.
- Step 2 (MCP server over sim-core): not started. `scripts/play.ts` is the closest thing: the MCP server
  is the same loop with MCP tools in place of JSON lines.
- Step 3 (swap `tasks/example-env`): not started.
- Step 4 (a fault that breaks the agent): one fault exists (`contaminated_glassware`, 35 % of soap
  orders). Whether a frontier agent misses its clue is unmeasured.

Then fill in the README: the results table and the TODO paragraph on why we chose this environment.

## 4. Gameplay gaps

- **Research strategy for the script.** On a research question the scripted controller makes one batch
  and answers with its own settings. A real strategy would vary share and temperature over several
  batches and use all six analyzer runs.
- **More content.** The `ester` and `aspirin_style` pathways are data only: no scenario uses them, and
  the scripted player is tied to the soap pathway and the default lab's ids.
- **Filter station** still only runs a timer; no shipped pathway needs it.
- **Faults** are one hard-coded example; `content/faults/` is empty.
- **Mast camera** (`V`) and **hand-tracking control** are placeholders.

## 5. Sessions and data

- **One live session at a time.** Everyone connected shares it; starting a new one ends it for all.
  Per-player sessions need a session id on the WebSocket and the routes.
- **No replay viewer.** Stored sessions replay headlessly only; `GET /api/sessions/:id` already returns
  what a browser viewer would need.
- **Replay does not check versions.** A session stores its sim-core version, but `replay` does not
  refuse or warn when the content or sim-core has changed since.
- **Training** (`rl/training/`, the MLflow scaffold under `src/`): untouched. The events table is the
  dataset.

## 6. Housekeeping

- **Commit.** Milestones 6–8 are uncommitted changes on `feature/lab-rats`; nothing is pushed.
- **CI** runs only the Python reward test. Add `npm test` and `npm run typecheck`.
- **Leftover backup:** `git stash list` holds the dropped "citrus" M5 (DECISIONS, milestones 6–8, #18).
  Drop it once nobody wants it.
