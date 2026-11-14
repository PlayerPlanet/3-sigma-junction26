#!/bin/bash
# Reference run (Harbor `oracle` agent): greedy-EIG experiments + exact posterior, played
# through the same MCP tools as the agent, without access to the hidden fault.
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 --with scipy==1.16.3 python - <<'PY'
import asyncio
from fastmcp import Client
from bayesenv import chem_lab as C

async def main():
    xs, ys = [], []
    async with Client("http://mcp-server:8000/mcp") as c:
        for i in range(C.BUDGET):
            x = C.eig_action(C.posterior(xs, ys), i)
            r = (await c.call_tool("run_experiment", dict(zip(C.KEYS, map(float, x))))).data
            xs.append(x)
            ys.append(r["yield"])
        p = C.posterior(xs, ys)
        print(dict(zip(C.NAMES, p.round(4).tolist())))
        print((await c.call_tool("submit_posterior",
                                 {"posterior": dict(zip(C.NAMES, map(float, p)))})).data)

asyncio.run(main())
PY
