#!/bin/bash
# Copy the black-box credit desk tasks with the oracle switched to a baseline policy, so that
# `harbor run -a oracle` plays that baseline through the same MCP tools and grader.
#
#   scripts/make_baseline_tasks.sh onestep      # -> tasks/credit-blackbox-v2-onestep/   (stop-early: one-step lookahead)
#   scripts/make_baseline_tasks.sh naive        # Gaussian fit on the reference's draws
#   scripts/make_baseline_tasks.sh guess        # no calibration, guessed model
#   scripts/make_baseline_tasks.sh over         # buy all 1,000 draws, then play as the reference
#
# Policies are defined in tasks/credit-blackbox-v2/*/solution/refpolicy.py.
set -euo pipefail
P=${1:?usage: make_baseline_tasks.sh <policy>}
SRC=tasks/credit-blackbox-v2
DST=tasks/credit-blackbox-v2-$P
rm -rf "$DST"
mkdir -p "$DST"
for t in "$SRC"/credit-blackbox-*/; do
  name=$(basename "$t")
  cp -r "$t" "$DST/$name"
  sed -i "s|^uv run|POLICY=$P uv run|" "$DST/$name/solution/solve.sh"
  grep -q "POLICY=$P" "$DST/$name/solution/solve.sh"
done
echo "wrote $DST ($(ls "$DST" | wc -l) tasks); run: harbor run -p $DST -a oracle"
