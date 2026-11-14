#!/bin/bash
# Reference run (Harbor `oracle` agent): EIG-greedy experiments + exact posterior predictive,
# played through the same MCP tools as the agent, without access to the true parameters.
set -euo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
cd /solution
uv run --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 --with scipy==1.16.3 python - <<'PY'
import asyncio, numpy as np
from fastmcp import Client
from bayesenv.bayes import Posterior
from bayesenv.envs import ENVS

ENV = "location"

async def main():
    env = ENVS[ENV]
    post = Posterior(env, np.random.default_rng(12345), n=40_000)
    async with Client("http://mcp-server:8000/mcp") as c:
        for _ in range(10):
            x = env.validate(post.best_design())
            r = (await c.call_tool("run_experiment", {"design": x.tolist()})).data
            post.update(x, r["outcome"])
        xq = np.asarray((await c.call_tool("finish_experiments", {})).data["designs"], float)
        pred = post.predictive(xq)
        ans = (pred["p"].tolist() if env.family == "bernoulli"
               else np.stack([pred["mean"], pred["sd"]], 1).tolist())
        print((await c.call_tool("submit_predictions", {"predictions": ans})).data)

asyncio.run(main())
PY
