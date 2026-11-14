#!/bin/bash
# Reference run (Harbor `oracle` agent): greedy value-of-information design + exact Bayesian
# averaging over all circuits, expression levels and LEVER gates, played through the same MCP
# tools as the agent, without access to the hidden circuit.
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 --with scipy==1.16.3 python play_reference.py
