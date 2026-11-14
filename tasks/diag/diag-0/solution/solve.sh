#!/bin/bash
# Reference run (Harbor `oracle` agent): the exact dynamic-programming policy + exact
# posterior, played through the same MCP tools as the agent. The table is rebuilt from
# get_rules alone, so this also checks that the rules are complete; no access to the hidden
# cause, the nuisance state or the table file with its role tags.
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 --with scipy==1.16.3 python - <<'PY'
import asyncio
import os
from fastmcp import Client
from bayesenv import diag as D

async def main():
    async with Client(os.environ.get("MCP_URL", "http://mcp-server:8000/mcp")) as c:
        tb = D.table_from_rules((await c.call_tool("get_rules", {})).data)
        dp = D.exact_dp(tb)
        obs, remaining = (), tb.budget
        while True:
            t = dp.policy(tb, D.joint_weights(tb, obs), obs, remaining)
            if t is None:
                break
            r = (await c.call_tool("run_test", {"name": tb.tests[t]})).data
            obs += ((t, tb.outcomes[t].index(r["reading"])),)
            remaining = r["budget_remaining"]
            print(r)
        p = D.cause_marginal(D.joint_weights(tb, obs))
        print(dict(zip(tb.causes, p.round(4).tolist())))
        print((await c.call_tool("submit_posterior",
                                 {"posterior": dict(zip(tb.causes, map(float, p)))})).data)

asyncio.run(main())
PY
