"""Reference agent for the Harbor `oracle` run: plays refpolicy.play through the MCP server (same tools as the
agent; no hidden state). POLICY env selects a baseline instead (see refpolicy.py)."""
import asyncio, os
from fastmcp import Client
import refpolicy

URL = os.environ.get("MCP_URL", "http://mcp-server:8000/mcp")
POLICY = os.environ.get("POLICY", "ref")


async def main():
    async with Client(URL) as c:
        async def call(tool, args):
            return (await c.call_tool(tool, args)).data
        await refpolicy.play(call, POLICY)
        print("done", POLICY, await call("status", {}))

asyncio.run(main())
