"""The reference policy played through the MCP tools only (run by solve.sh; also used for the
local server check). It sees exactly what an agent sees: it rebuilds the exact posterior from
the tool outputs and never touches the hidden circuit."""
import asyncio
import os

import numpy as np
from fastmcp import Client

from bayesenv import optolab as O

URL = os.environ.get("MCP_URL", "http://mcp-server:8000/mcp")


class Shadow:
    """The minimal lab interface `O.choose` needs, filled from tool outputs."""

    def __init__(self, budget: int):
        self.cfg = O.DEFAULT
        self.belief = O.Belief()
        self.animals: list = []
        self.remaining = budget


async def main():
    async with Client(URL) as c:
        rules = (await c.call_tool("get_rules", {})).data
        sh = Shadow(rules["actions"]["budget"])
        rng = np.random.default_rng(0)
        I = O.DEFAULT.intensities
        while True:
            cand = O.choose(sh, "reference", rng)
            if cand is None:
                break
            if cand["kind"] == "record":
                r = (await c.call_tool("record_activity", {})).data
                sh.belief.add(r["samples"])
            else:
                if cand["kind"] == "new":
                    r = (await c.call_tool("express_opsin", {
                        "opsin": cand["opsin"], "populations": [O.POPS[j] for j in cand["nodes"]]})).data
                    sh.belief.add_animal(cand["v"], cand["nodes"])
                    sh.animals.append(r["animal"])
                    animal = r["animal"]
                else:
                    animal = cand["animal"]
                r = (await c.call_tool("light_session", {"animal": animal,
                                                         "intensity": I[cand["ii"]]})).data
                sh.belief.add(r["samples"], animal, cand["ii"])
            sh.remaining = r["budget_remaining"]
        qs = (await c.call_tool("finish_experiments", {})).data["queries"]
        queries = [({O.POPS.index(k): int(v) for k, v in q["do"].items()}, O.NAMES.index(q["target"]))
                   for q in qs]
        p = sh.belief.predict(queries)
        print(p.round(3).tolist())
        print((await c.call_tool("submit_predictions",
                                 {"probabilities": [float(x) for x in p]})).data)


asyncio.run(main())
