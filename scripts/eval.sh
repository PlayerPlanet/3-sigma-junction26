#!/usr/bin/env bash
# One-command evaluation, mirroring the judges' rerun:
#   reference run, 3 frontier-agent runs, a do-nothing baseline and a stop-early baseline.
#
#   MODEL=<provider/model> ./scripts/eval.sh            # everything
#   SKIP_AGENT=1 ./scripts/eval.sh                      # no API key: reference + baselines only
#
# Env: TASK (default tasks/credit-blackbox-v2, the submission; also tasks/bayes, tasks/chem, tasks/wetlab, tasks/battleship, tasks/droplet), AGENT (default opencode), AGENT_RUNS (default 3),
# and whatever API key OpenCode needs for MODEL's provider (e.g. ANTHROPIC_API_KEY).
set -euo pipefail
cd "$(dirname "$0")/.."

TASK="${TASK:-tasks/credit-blackbox-v2}"
AGENT="${AGENT:-opencode}"
AGENT_RUNS="${AGENT_RUNS:-3}"
RUN_DIR="jobs/$(date +%Y%m%d-%H%M%S)"
[[ -d "$TASK" ]] || ./scripts/render_tasks.sh   # rendered tasks are not tracked in git
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}" PYTHONIOENCODING=utf-8

# API keys: take them from a git-ignored .env if they are not already in the environment (never
# printed), and give OpenCode's Google provider the variable it reads. Without it every agent
# trial ends in ProviderAuthError and is scored 0, which is a harness failure, not a result.
if [[ -f .env ]]; then
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
        key="${key%$'\r'}"; value="${value%$'\r'}"
        [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
        [[ -n "${!key:-}" ]] || export "$key=$value"
    done < .env
fi
if [[ -z "${GOOGLE_GENERATIVE_AI_API_KEY:-}" && -n "${GDM_API_KEY:-}" ]]; then
    export GOOGLE_GENERATIVE_AI_API_KEY="$GDM_API_KEY"
fi
if [[ -z "${SKIP_AGENT:-}" && ( "${MODEL:-}" == google/* || "${MODEL:-}" == gemini/* ) && -z "${GOOGLE_GENERATIVE_AI_API_KEY:-}" ]]; then
    echo "MODEL=$MODEL needs GOOGLE_GENERATIVE_AI_API_KEY (or GDM_API_KEY in .env)" >&2
    exit 1
fi

run() {  # run <job-name> <harbor args...>
    local name="$1"; shift
    echo "==> $name"
    harbor run -p "${TASK_OVERRIDE:-$TASK}" -o "$RUN_DIR" --job-name "$name" -y -q ${HARBOR_ARGS:-} "$@"
}

# Black-box credit desk: the image installs slowly, and "stop early" is the one-step-lookahead
# policy played through the same MCP tools and grader (a copy of the tasks with POLICY=onestep).
if [[ "$TASK" == *credit-blackbox-v2* ]]; then
    HARBOR_ARGS="${HARBOR_ARGS:---agent-setup-timeout-multiplier 3}"
    run reference  -a oracle
    run do-nothing -a nop
    bash scripts/make_baseline_tasks.sh onestep >/dev/null
    TASK_OVERRIDE=tasks/credit-blackbox-v2-onestep run stop-early -a oracle
    if [[ -z "${SKIP_AGENT:-}" ]]; then
        : "${MODEL:?set MODEL=<provider/model>, or SKIP_AGENT=1 to skip the agent runs}"
        run agent -a "$AGENT" -m "$MODEL" -k "$AGENT_RUNS"
    fi
    echo
    python scripts/summarize.py "$RUN_DIR"
    exit 0
fi

run reference  -a oracle
run do-nothing -a nop
case "$TASK" in
    *battleship*) DEFAULT_STOP=baselines.battleship_baselines:BattleshipStopEarlyAgent ;;
    *droplet*)    DEFAULT_STOP=baselines.droplet_baselines:DropletStopEarlyAgent ;;
    *)            DEFAULT_STOP=baselines.bayes_stop_early:BayesStopEarlyAgent ;;
esac
STOP_EARLY="${STOP_EARLY:-$DEFAULT_STOP}"
run stop-early -a "$STOP_EARLY"
if [[ "$TASK" == *battleship* ]]; then   # the strategy that per-trial clipping favours most
    run gamble -a baselines.battleship_baselines:BattleshipGambleAgent
fi
if [[ "$TASK" == *droplet* ]]; then      # certainty on one mechanism per catalyst, no runs
    run gamble -a baselines.droplet_baselines:DropletGambleAgent
fi
if [[ -z "${SKIP_AGENT:-}" ]]; then
    : "${MODEL:?set MODEL=<provider/model>, or SKIP_AGENT=1 to skip the agent runs}"
    run agent -a "$AGENT" -m "$MODEL" -k "$AGENT_RUNS"
fi

echo
python scripts/summarize.py "$RUN_DIR"
if [[ "$TASK" == *battleship* ]]; then   # unclipped scores, design/inference split, leak test
    python scripts/battleship_report.py "$RUN_DIR"
fi
if [[ "$TASK" == *droplet* ]]; then      # paired gap to the reference; writes results/droplet_bench/
    python scripts/droplet_report.py "$RUN_DIR"
fi
