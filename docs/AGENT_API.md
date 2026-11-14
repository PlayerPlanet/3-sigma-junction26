# Playing as an agent

Agents use the same action space and rules as the keyboard player (`docs/ACTION_SPACE.md`). There are
two ways in.

## 1. Headless CLI (fast, no server)

JSON lines on stdin/stdout. The clock only runs while you `wait`, so it goes as fast as the agent thinks.

```bash
npm run -s play -- --scenario soap_order --seed 7 --save run.json
```

| request | reply |
|---------|-------|
| `{"cmd":"briefing"}` | goal, pathway description, rules, robots, places (work level / reach / controls), reagents, example actions |
| `{"cmd":"observe"}` | snapshot (robots, items with contents, equipment settings, lab log tail, session status) + completion notices |
| `{"type": ... }` or `{"cmd":"act","action":{...}}` | accepted into the robot's queue, or a reason |
| `{"cmd":"wait","robot"?:"r1","maxTicks"?:600}` | runs ticks until your robots are idle; returns snapshot, completions, score |

Robots start `idle`: claim one first with `{"type":"set_controller","robot":"r1","controller":"llm"}`.
The run ends on `{"type":"commit","result":{"item":"flask_1"}}` or when time runs out. `--save` writes
seed + events; `npm run replay -- run.json` re-runs it and checks the score.

## 2. HTTP API on the live server (plays alongside humans in the browser)

```
GET  /api/agent/briefing
GET  /api/agent/observe?actor=llm
POST /api/agent/act     { "action": {...}, "actor": "llm" | "script" }
POST /api/agent/wait    { "robot"?: "r1", "maxTicks"?: 600, "actor"?: "llm" }   blocks until your robots are idle
POST /api/session       { "scenario"?: "soap_order", "seed"?: 1, "speed"?: 5 }   restart (all browsers follow)
```

Example with curl:

```bash
curl -s localhost:5173/api/agent/briefing | jq .rules
curl -s -XPOST localhost:5173/api/agent/act -H 'content-type: application/json' \
  -d '{"action":{"type":"set_controller","robot":"r1","controller":"llm"}}'
curl -s -XPOST localhost:5173/api/agent/act -H 'content-type: application/json' \
  -d '{"action":{"type":"place","robot":"r1","item":"flask_1","target":"dispenser_1"}}'
curl -s -XPOST localhost:5173/api/agent/wait -H 'content-type: application/json' -d '{}' | jq .completions
```

A human in the browser can take any robot over at any time (T). The agent's queue for that robot is
dropped and further actions from the agent are rejected until the human hands it back.

## What an agent cannot see

The briefing and snapshots never include the hidden optimum or faults. The analyzer gives a noisy
yield reading; the true yield and the score are revealed only on commit. Clues appear in the lab log.
