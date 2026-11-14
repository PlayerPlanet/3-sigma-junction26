"""The reference policy played through the MCP tools only (run by solve.sh; also used for the
local server check). It sees exactly what an agent sees."""
import asyncio
import os

from fastmcp import Client

from bayesenv import dagnet as D

URL = os.environ.get("MCP_URL", "http://mcp-server:8000/mcp")


async def main():
    belief = D.Belief()
    async with Client(URL) as c:
        rules = (await c.call_tool("get_rules", {})).data
        for k in range(rules["experiments"]["budget"]):
            do = D.choose_action(belief, "reference", k)
            r = (await c.call_tool("run_experiment", {
                "interventions": {D.var_name(i): v for i, v in do.items()}})).data
            belief.add(do, r["samples"])
        qs = (await c.call_tool("finish_experiments", {})).data["queries"]
        queries = [(D.parse_do(q["do"], max_vars=2), int(q["target"][1:])) for q in qs]
        p = belief.predict(queries)
        print(p.round(3).tolist())
        print((await c.call_tool("submit_predictions",
                                 {"probabilities": [float(x) for x in p]})).data)


asyncio.run(main())
