#!/bin/bash
# Reference run (Harbor `oracle` agent): greedy expected-information-gain designs +
# simulation-based inference (approximate), played through the same MCP tools as the agent,
# without access to the hidden mechanism or rate constants.
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 python - <<'PY'
import asyncio
import numpy as np
from fastmcp import Client
from bayesenv import wetlab as W

async def main():
    rng = np.random.default_rng(0)
    belief = W.Belief(np.random.default_rng(1))
    stock = dict(W.STOCK)
    async with Client("http://mcp-server:8000/mcp") as c:
        while True:
            a = W.reference_action(belief, stock, rng)
            if a is None:
                break
            r = (await c.call_tool("run_experiment", a)).data
            belief.update(a, r["readings"])
            stock = r["stock_remaining"]
            print(a, [round(y, 1) for y in r["readings"]], belief.posterior().round(3).tolist())
        p = belief.posterior()
        print((await c.call_tool("submit_posterior",
                                 {"posterior": dict(zip(W.NAMES, map(float, p)))})).data)

asyncio.run(main())
PY
