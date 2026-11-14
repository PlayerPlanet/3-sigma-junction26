#!/usr/bin/env bash
# One-command evaluation, mirroring the judges' rerun:
#   reference run, 3 frontier-agent runs, a do-nothing baseline and a stop-early baseline.
#
#   MODEL=<provider/model> ./scripts/eval.sh            # everything
#   SKIP_AGENT=1 ./scripts/eval.sh                      # no API key: reference + baselines only
#
# Env: TASK (default tasks/bayes; also tasks/chem, tasks/wetlab, tasks/battleship), AGENT (default opencode), AGENT_RUNS (default 3),
# and whatever API key OpenCode needs for MODEL's provider (e.g. ANTHROPIC_API_KEY).
set -euo pipefail
cd "$(dirname "$0")/.."

TASK="${TASK:-tasks/bayes}"
AGENT="${AGENT:-opencode}"
AGENT_RUNS="${AGENT_RUNS:-3}"
RUN_DIR="jobs/$(date +%Y%m%d-%H%M%S)"
[[ -d "$TASK" ]] || ./scripts/render_tasks.sh   # rendered tasks are not tracked in git
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}" PYTHONIOENCODING=utf-8

run() {  # run <job-name> <harbor args...>
    local name="$1"; shift
    echo "==> $name"
    harbor run -p "$TASK" -o "$RUN_DIR" --job-name "$name" -y -q "$@"
}

run reference  -a oracle
run do-nothing -a nop
case "$TASK" in
    *battleship*) DEFAULT_STOP=baselines.battleship_baselines:BattleshipStopEarlyAgent ;;
    *)            DEFAULT_STOP=baselines.bayes_stop_early:BayesStopEarlyAgent ;;
esac
STOP_EARLY="${STOP_EARLY:-$DEFAULT_STOP}"
run stop-early -a "$STOP_EARLY"
if [[ "$TASK" == *battleship* ]]; then   # the strategy that per-trial clipping favours most
    run gamble -a baselines.battleship_baselines:BattleshipGambleAgent
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
