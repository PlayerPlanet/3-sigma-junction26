#!/bin/bash
# Reference run (Harbor `oracle` agent): a fixed spread of protocols with repeats, a library
# of candidate currents fitted by simulation (approximate synthetic likelihood), forecasts =
# posterior-weighted simulated spike counts. Played through the same MCP tools as the agent;
# it has no access to the hidden cell, the world list or discriminator().
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 python - <<'PY'
import asyncio
from fastmcp import Client
from bayesenv import neuron_ref as R

async def main():
    async with Client("http://mcp-server:8000/mcp") as c:
        rules = (await c.call_tool("get_rules", {})).data
        ref = R.Reference(rules, seed=0)
        for run in R.plan(rules):
            obs = (await c.call_tool("run_experiment", run)).data
            ref.update(run, obs)
            print(run, obs["spike_count"], ref.family_posterior(), flush=True)
        forecasts = ref.forecast()
        print(forecasts)
        print((await c.call_tool("submit_forecasts", {"forecasts": forecasts})).data)

asyncio.run(main())
PY
