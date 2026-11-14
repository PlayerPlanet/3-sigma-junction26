"""Stop-early baseline for the Bayesian tasks: one experiment, then a hedged submission.

    harbor run -p tasks/bayes -a baselines.bayes_stop_early:BayesStopEarlyAgent
"""

from harbor.agents.base import BaseAgent
from harbor.agents.capabilities import AgentCapabilities

SCRIPT = r"""
set -e
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
uv run --no-project --with fastmcp==4.2.0 python - <<'EOF'
import asyncio
from fastmcp import Client

async def main():
    async with Client("http://mcp-server:8000/mcp") as c:
        rules = (await c.call_tool("get_rules", {})).data
        binary = "probabilities" in rules
        design = [50, 100, 30] if binary else [0.0, 0.0]
        print((await c.call_tool("run_experiment", {"design": design})).data)
        xs = (await c.call_tool("finish_experiments", {})).data["designs"]
        pred = [0.5] * len(xs) if binary else [[0.0, 2.0]] * len(xs)
        print((await c.call_tool("submit_predictions", {"predictions": pred})).data)

asyncio.run(main())
EOF
"""


class BayesStopEarlyAgent(BaseAgent):
    capabilities = AgentCapabilities(mcp_servers=True)

    @staticmethod
    def name() -> str:
        return "bayes-stop-early"

    def version(self) -> str:
        return "1.0.0"

    async def setup(self, environment) -> None:
        pass

    async def run(self, instruction, environment, context) -> None:
        r = await environment.exec(SCRIPT, timeout_sec=600)
        if r.return_code != 0:
            raise RuntimeError(f"stop-early script failed: {r.stderr}")
