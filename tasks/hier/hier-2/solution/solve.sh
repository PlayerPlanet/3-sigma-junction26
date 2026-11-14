#!/bin/bash
# Reference run (Harbor `oracle` agent): greedy expected-gain experiments + the exact
# hierarchical posterior predictive, played through the same MCP tools as the agent, without
# access to the hidden parameters.
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 --with scipy==1.16.3 python solve.py
