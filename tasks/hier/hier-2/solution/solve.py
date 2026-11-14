"""The reference, through MCP only. MCP_URL overrides the server address for local testing."""

import asyncio
import os

import numpy as np
from fastmcp import Client

from bayesenv import hier as H

URL = os.environ.get("MCP_URL", "http://mcp-server:8000/mcp")


async def main() -> None:
    model = H.get_model()
    belief = H.Belief(model)
    async with Client(URL) as c:
        for _ in range(model.cfg.budget):
            act = H.reference_action(belief)
            r = (await c.call_tool("run_experiment", act)).data
            belief.update(act["unit"], act["design"], int(r["outcome"]))
        qs = (await c.call_tool("finish_experiments", {})).data["queries"]
        units = np.array([-1 if q["unit"] is None else q["unit"] for q in qs])
        slopes = np.array([q["slope"] for q in qs], float)
        xs = np.array([q["design"] for q in qs], float)
        p = np.clip(belief.predict(units, slopes, xs), 0.0, 1.0)
        print("experiments per unit:", belief.n.tolist())
        print((await c.call_tool("submit_predictions", {"predictions": p.tolist()})).data)


asyncio.run(main())
