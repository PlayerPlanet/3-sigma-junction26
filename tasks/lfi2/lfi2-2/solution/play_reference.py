"""The reference policy played through the MCP tools only (run by solve.sh; also used for the
local server check). It sees exactly what an agent sees, plus the PUBLIC exact FSP tables (a
function of the public model only, no hidden information; about 40 CPU-hours to recompute),
fetched from the server with the solution token."""
import asyncio
import os
import urllib.request

from fastmcp import Client

URL = os.environ.get("MCP_URL", "http://mcp-server:8000/mcp")
TABLE_URL = os.environ.get("TABLE_URL", "http://mcp-server:8001/table")
TABLE = os.environ.setdefault("LFILAB2_TABLE", "/tmp/lfilab2_exact.npz")

if not os.path.exists(TABLE):
    tok = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "solution_token")).read().strip()
    req = urllib.request.Request(TABLE_URL, headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(req, timeout=900) as r, open(TABLE, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)

from bayesenv import lfilab2 as L  # noqa: E402


async def main():
    belief = L.Belief()
    async with Client(URL, timeout=900) as c:
        rules = (await c.call_tool("get_rules", {})).data
        assert rules["experiments"]["cell_budget"] == L.REF_ASSAYS * L.REF_CELLS
        for k in range(L.REF_ASSAYS):
            cond, t, ro = L.DESIGNS[L.choose_design(belief, "reference", k)]
            r = (await c.call_tool("run_assay", {"condition": cond, "time": t, "readout": ro,
                                                 "cells": L.REF_CELLS})).data
            belief.add(L.DESIGNS.index((cond, t, ro)), r["counts"])
            print(cond, t, ro, "mean count", sum(r["counts"]) / len(r["counts"]))
        qs = (await c.call_tool("finish_experiments", {})).data["queries"]
        items = [(q["condition"], float(q["time"]), q["readout"], q.get("threshold")) for q in qs]
        p = belief.predict(items)
        dists = [[float(x) for x in p[i, :L.item_nbins(it)]] for i, it in enumerate(items)]
        print((await c.call_tool("submit_predictions", {"distributions": dists})).data)


asyncio.run(main())
