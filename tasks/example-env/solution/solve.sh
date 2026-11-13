#!/bin/bash
# Reference run (Harbor's `oracle` agent runs this). It must play through the same MCP
# interface as the agent: no peeking at the seed or the grader.
set -euo pipefail

curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"

uv run --no-project --with fastmcp==4.2.0 python - <<'EOF'
import asyncio
from fastmcp import Client

async def main():
    async with Client("http://mcp-server:8000/mcp") as c:
        lo, hi = 1, 1000
        while lo <= hi:
            mid = (lo + hi) // 2
            answer = (await c.call_tool("probe", {"guess": mid})).data
            print(f"probe {mid}: {answer}")
            if answer == "correct":
                break
            lo, hi = (mid + 1, hi) if answer == "higher" else (lo, mid - 1)
        print((await c.call_tool("submit", {"answer": mid})).data)

asyncio.run(main())
EOF
