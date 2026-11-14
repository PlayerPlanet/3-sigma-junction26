#!/bin/bash
# Reference run (Harbor `oracle` agent): greedy expected-information-gain assays + exact
# Bayesian posterior over the 10,000 prior hypotheses with FSP likelihoods, played through the
# same MCP tools as the agent, without access to the hidden constants.
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
OMP_NUM_THREADS=2 uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 --with scipy==1.16.3 python play_reference.py
