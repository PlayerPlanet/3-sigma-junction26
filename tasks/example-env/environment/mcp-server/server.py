"""MCP server the agent talks to, plus a token-protected grading endpoint for the verifier.

Ports:
  8000  MCP (streamable-http) - the agent's only interface to the environment
  8001  GET /grade            - verifier only; requires `Authorization: Bearer $GRADER_TOKEN`

This runs in its own container, so the agent cannot read this code, the seed or the
token. The verifier's copy of the token lives in tests/, which Harbor only uploads
after the agent has finished.
"""

from __future__ import annotations

import hmac
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from game import ActionError, Game

GRADER_TOKEN = os.environ.get("GRADER_TOKEN", "")
if not GRADER_TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")

game = Game(seed=int(os.environ.get("TASK_SEED", "0")))
mcp = FastMCP("example-env")


def _act(fn, *args):
    try:
        return fn(*args)
    except ActionError as e:
        raise ToolError(str(e)) from e


@mcp.tool()
def get_rules() -> str:
    """Explain the environment's goal, actions and scoring."""
    return game.rules()


@mcp.tool()
def probe(guess: int) -> str:
    """Probe a number. Returns 'higher', 'lower' or 'correct'. Costs one probe."""
    return _act(game.probe, guess)


@mcp.tool()
def submit(answer: int) -> str:
    """Submit your final answer. Ends the episode; only the first submission counts."""
    return _act(game.submit, answer)


@mcp.tool()
def status() -> dict:
    """Probes used and left, and whether the episode is over."""
    return game.status()


class GradeHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 (http.server API)
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if self.path != "/grade" or not hmac.compare_digest(supplied, GRADER_TOKEN):
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(game.grade()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:
        pass


if __name__ == "__main__":
    grader = ThreadingHTTPServer(("0.0.0.0", 8001), GradeHandler)
    threading.Thread(target=grader.serve_forever, daemon=True).start()
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
