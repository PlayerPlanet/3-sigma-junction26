"""Stop-early baseline: takes one action, then submits a guess without finishing the task.

The rubric requires this to earn little or no credit. Run it with:
    harbor run -p tasks/example-env -a baselines.stop_early:StopEarlyAgent
(the repo root must be on PYTHONPATH; scripts/eval.sh does this).

The do-nothing baseline is Harbor's built-in `nop` agent.
"""

from harbor.agents.base import BaseAgent
from harbor.agents.capabilities import AgentCapabilities
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

SCRIPT = r"""
set -e
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
uv run --no-project --with fastmcp==4.2.0 python - <<'EOF'
import asyncio
from fastmcp import Client

async def main():
    async with Client("http://mcp-server:8000/mcp") as c:
        print((await c.call_tool("probe", {"guess": 500})).data)
        print((await c.call_tool("submit", {"answer": 500})).data)

asyncio.run(main())
EOF
"""


class StopEarlyAgent(BaseAgent):
    # It talks to the task's MCP server directly, so it must declare MCP support.
    capabilities = AgentCapabilities(mcp_servers=True)

    @staticmethod
    def name() -> str:
        return "stop-early"

    def version(self) -> str:
        return "1.0.0"

    async def setup(self, environment: BaseEnvironment) -> None:
        pass

    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        result = await environment.exec(SCRIPT, timeout_sec=300)
        if result.return_code != 0:
            raise RuntimeError(f"stop-early script failed: {result.stderr}")
