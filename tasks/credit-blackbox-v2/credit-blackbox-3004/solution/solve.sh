#!/bin/bash
# Reference run (Harbor `oracle` agent): calibrates the black box through the sandbox (fixed draws per cell), builds
# median + pooled-empirical-residual band tables, then plays the exact DP; same MCP tools as the agent, no hidden state.
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 --with scipy==1.16.3 python oracle.py
