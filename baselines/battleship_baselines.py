"""Baselines for Rulebound Battleship (Harbor agents that talk to the MCP server directly).

    harbor run -p tasks/battleship -a baselines.battleship_baselines:BattleshipStopEarlyAgent
    harbor run -p tasks/battleship -a baselines.battleship_baselines:BattleshipGambleAgent

Stop-early: one shot, then the prior. Gamble: no shots, all probability on one rule (the
strategy that per-trial clipping at 0 favours most); it should earn far less than real play.
The do-nothing baseline is Harbor's built-in `nop` agent.
"""

from harbor.agents.base import BaseAgent
from harbor.agents.capabilities import AgentCapabilities
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

TEMPLATE = r"""
set -e
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null
source "$HOME/.local/bin/env"
uv run --no-project --with fastmcp==4.2.0 python - <<'PYEOF'
import asyncio
from fastmcp import Client

async def main():
    async with Client("http://mcp-server:8000/mcp") as c:
        rules = (await c.call_tool("get_rules", {})).data
        names = [r["name"] for r in rules["rules"]]
        __BODY__
        print((await c.call_tool("submit_beliefs",
                                 {"rules": q, "occupancy": rules["prior_occupancy"]})).data)

asyncio.run(main())
PYEOF
"""
STOP_EARLY = TEMPLATE.replace("__BODY__", 'print((await c.call_tool("fire", {"row": 2, "col": 2}))'
                              '.data)\n        q = {n: 1.0 for n in names}')
GAMBLE = TEMPLATE.replace("__BODY__", 'q = {"no_touch": 1.0}')


class _Scripted(BaseAgent):
    capabilities = AgentCapabilities(mcp_servers=True)
    SCRIPT = ""

    def version(self) -> str:
        return "1.0.0"

    async def setup(self, environment: BaseEnvironment) -> None:
        pass

    async def run(self, instruction: str, environment: BaseEnvironment,
                  context: AgentContext) -> None:
        result = await environment.exec(self.SCRIPT, timeout_sec=300)
        if result.return_code != 0:
            raise RuntimeError(f"{self.name()} script failed: {result.stderr}")


class BattleshipStopEarlyAgent(_Scripted):
    SCRIPT = STOP_EARLY

    @staticmethod
    def name() -> str:
        return "battleship-stop-early"


class BattleshipGambleAgent(_Scripted):
    SCRIPT = GAMBLE

    @staticmethod
    def name() -> str:
        return "battleship-gamble"
