#!/usr/bin/env bash
# Render every Harbor task set from its template. Rendered tasks are not tracked in git:
# each render writes fresh grader tokens and vendors the current bayesenv code.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python}"
$PY scripts/make_harbor_tasks.py --seeds 0:5 --out tasks/bayes
$PY scripts/make_chem_tasks.py --seeds 0:5 --out tasks/chem
$PY scripts/make_wetlab_tasks.py --seeds 0:5 --out tasks/wetlab
$PY scripts/make_dag_tasks.py --seeds 0:5 --out tasks/dag
$PY scripts/make_lfi_tasks.py --seeds 0:3 --out tasks/lfi
# Red-team tasks: the same Bayes tasks with the attack script as the "solution".
$PY scripts/make_harbor_tasks.py --seeds 0:1 --out tasks/redteam
for t in tasks/redteam/*/; do cp scripts/redteam_solve.sh "$t/solution/solve.sh"; done
echo "rendered: $(ls -d tasks/bayes/* tasks/chem/* tasks/wetlab/* tasks/dag/* tasks/lfi/* tasks/redteam/* | wc -l) tasks"
