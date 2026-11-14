"""MCP server for the diagnostic lab task (bayesenv.diag), plus the verifier's grader.

Ports (overridable with MCP_PORT / GRADE_PORT for local tests):
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only

Episode flow: get_rules -> run_test (within the budget, each test once) -> submit_posterior
(once; ends the episode). The rules disclose the complete table; the test roles in the table
file (control, misleading, ...) stay in this container and appear only in /grade.

/grade returns bayesenv.diag.grade: the 0-1 score, the raw reward, its design / inference
split, the ordered tests, whether the control was run, how many misleading tests were run, and
the rewards of the exact-DP and greedy policies on the same hidden draw.
"""

from __future__ import annotations

import hmac
import json
import os
import secrets
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from bayesenv import diag as D

TOKEN = os.environ.get("GRADER_TOKEN", "")
if not TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")

# The code and the table are public and the seed is in the task name, so an unsalted task's
# hidden cause and readings could be recomputed. The salt lives only in this container: random
# per trial by default, or pinned via TASK_SALT for a private fixed set.
SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
SEED = int(os.environ["TASK_SEED"])
TABLE = D.load_table(os.environ.get("TASK_TABLE", "low_yield"))
lab = D.DiagLab(TABLE)
lab.reset(SEED, SALT)
# Exact DP and greedy on the same hidden draw (about half a second, once, before serving).
REFS = D.reference_runs(TABLE, SEED, SALT, lab.budget)
lock = threading.Lock()
mcp = FastMCP("diag-lab")


@mcp.tool()
def get_rules() -> dict:
    """The complete model: causes and priors, nuisance states and their probabilities, every
    test with its cost and outcome probabilities, the budget, the protocol and the scoring."""
    return D.task_rules(TABLE, lab.budget)


@mcp.tool()
def run_test(name: str) -> dict:
    """Run one test by name. Returns its reading and the budget left. Each test can be run
    once; unknown, repeated or unaffordable tests are rejected and cost nothing."""
    with lock:
        try:
            obs = lab.step(str(name))
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        r = obs["result"]
        return {"test": r["test"], "reading": r["outcome"], "cost": r["cost"],
                "budget_remaining": obs["budget_remaining"]}


@mcp.tool()
def submit_posterior(posterior: dict[str, float]) -> str:
    """Submit your probability for each cause name (normalised for you; missing names get 0).
    Ends the episode; only one submission is accepted."""
    with lock:
        if lab.result is not None:
            raise ToolError("already submitted")
        try:
            lab.submit(posterior)
        except ValueError as e:
            raise ToolError(str(e)) from e
        return "submitted"


class Grade(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        given = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if self.path != "/grade" or not hmac.compare_digest(given, TOKEN):
            self.send_response(404)
            self.end_headers()
            return
        with lock:
            out = D.grade(lab, REFS)      # no submission = the prior = reward 0, score 0
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a) -> None:
        pass


if __name__ == "__main__":
    host = os.environ.get("BIND_HOST", "0.0.0.0")
    threading.Thread(target=ThreadingHTTPServer(
        (host, int(os.environ.get("GRADE_PORT", "8001"))), Grade).serve_forever,
        daemon=True).start()
    mcp.run(transport="streamable-http", host=host, port=int(os.environ.get("MCP_PORT", "8000")))
