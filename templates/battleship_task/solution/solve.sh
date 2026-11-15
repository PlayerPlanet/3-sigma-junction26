#!/bin/bash
# Reference run (Harbor `oracle` agent): greedy information-per-shot design + the exact
# posterior, played through the same MCP tools as the agent, without access to the hidden state.
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 python - <<'PY'
import asyncio
from fastmcp import Client
import os
from bayesenv.battleship_worlds import load
B = load(os.environ.get("BATTLESHIP_WORLD", "closed"))

async def main():
    belief = B.Belief()
    async with Client("http://mcp-server:8000/mcp") as c:
        remaining = (await c.call_tool("get_rules", {})).data["budget"]
        while remaining > 0:
            a = B.greedy_action(belief, remaining)
            act = B.action_dict(a)
            if act["type"] == "fire":
                r = (await c.call_tool("fire", {"row": act["row"], "col": act["col"]})).data
            else:
                r = (await c.call_tool("scan", {"axis": act["axis"], "index": act["index"]})).data
            belief.update(a, r["result"])
            remaining = r["budget_remaining"]
        rules = dict(zip(B.NAMES, map(float, belief.rules())))
        occ = belief.occupancy().reshape(B.N, B.N).tolist()
        print({k: round(v, 3) for k, v in rules.items()})
        print((await c.call_tool("submit_beliefs", {"rules": rules, "occupancy": occ})).data)

asyncio.run(main())
PY
