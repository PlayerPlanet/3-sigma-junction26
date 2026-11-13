# Bitshift Happens

**Team 3-Sigma · Junction 2026 · AfterQuery "Break the Agent"**

> Obsessed about maximizing shareholder value.

## Challenge

Build an RL environment where a frontier agent consistently scores below our reference run, for reasons
we can explain, with a reward that can't be gamed. Judges rerun everything with
[Harbor](https://github.com/harbor-framework/harbor) + OpenCode over MCP: our reference run, three agent
runs, a do-nothing baseline and a stop-early baseline.

TODO: the environment we chose, why, and what an agent can learn there.

## Reproduce the evaluation (one command)

Requirements: Docker running, and Harbor (`uv tool install harbor`, tested with 0.25.0).

```bash
MODEL=<provider/model> ./scripts/eval.sh     # reference + 3 agent runs + do-nothing + stop-early
SKIP_AGENT=1 ./scripts/eval.sh               # no API key needed: reference + baselines only
```

The agent runs need whatever API key OpenCode uses for `MODEL`'s provider (for example `ANTHROPIC_API_KEY`).
Results go to `jobs/<timestamp>/`; `harbor view jobs` opens a browser viewer.

### Current results (placeholder environment)

| Run | Agent | Trials | Reward |
|-----|-------|--------|--------|
| Reference | `oracle` (runs `solution/solve.sh`) | 1 | 0.583 |
| Do-nothing | `nop` | 1 | 0.000 |
| Stop-early | `baselines/stop_early.py` | 1 | 0.000 |
| Frontier agent | `opencode` | 3 | TODO |

## Layout

```
tasks/example-env/              Harbor task (PLACEHOLDER game: find a hidden number under a probe budget)
├── task.toml                   task config; declares the MCP server
├── instruction.md              the agent's prompt
├── environment/
│   ├── Dockerfile              agent container (`main`)
│   ├── docker-compose.yaml     adds the environment's MCP server as a separate container
│   └── mcp-server/
│       ├── game.py             environment logic + reward (pure Python, unit-tested)
│       └── server.py           MCP tools (port 8000) + token-protected /grade (port 8001)
├── solution/solve.sh           reference run, plays through the same MCP tools
└── tests/                      verifier: fetches the score from /grade -> reward.json
baselines/stop_early.py         stop-early baseline agent
scripts/eval.sh                 the one command; scripts/summarize.py prints the table
tests/test_env_reward.py        reward-integrity tests (CI runs these on every push)
```

### Replacing the placeholder

1. Rewrite `game.py` (state, actions, `grade()`) and the tools in `server.py`.
2. Update `instruction.md`, `solution/solve.sh` and `baselines/stop_early.py`.
3. Rewrite `tests/test_env_reward.py`: do-nothing and stop-early must score ~0, and solving the task
   well must be the best way to score. Turn every exploit we find into a test.
4. Rename the task directory and `TASK` in `scripts/eval.sh`.

## Reward-integrity design

- **The score comes from the environment's state, not from the agent's files.** The verifier asks the
  MCP server's `/grade` endpoint, so nothing the agent writes in its container can fake a pass.
- **The agent can't see the grader.** The MCP server runs in its own container. The seed and grader token
  live only in `docker-compose.yaml` (not mounted into the agent) and in `tests/` (Harbor uploads it only
  after the agent finishes). Checked with a probe agent: no token on disk, no `/tests`, `/grade` without
  the token returns 404.
- **The grader fails closed.** If the grader is unreachable, the reward is 0.

## Known limitations

- Harbor runs multi-container (MCP sidecar) tasks only on its `docker` provider, not on Modal or
  Daytona. Run evaluations locally or on a Verda VM.
- Line endings are pinned to LF (`.gitattributes`); CRLF breaks the shell scripts inside containers.

## Other code in this repo

`src/`, `config/`, `Dockerfile*` and `docker-compose.yml` are the MLflow train/serve scaffold from
`cookiecutter-inference-template`, kept for the stretch goal (training a smaller model on experience
from the environment).

## Team

TODO: names and roles.
