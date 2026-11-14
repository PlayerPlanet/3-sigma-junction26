"""MCP server for the Virtual Chemistry Lab task (Held-out C), plus the verifier's grader.

Ports:
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only

Episode flow: get_rules -> run_experiment (up to the budget) -> submit_posterior (once; ends
the episode). Reward: log q(h*) - log prior(h*) from bayesenv.chem_reward, plus its design /
inference decomposition, accuracy, and the Bayes reference's reward on the same task.
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

from bayesenv import chem_lab as C

TOKEN = os.environ.get("GRADER_TOKEN", "")
if not TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")

# The code is public and the seed is in the task name, so an unsalted task's hidden fault could
# be recomputed. The salt lives only in this container: random per trial by default, or pinned
# via TASK_SALT for a private fixed set.
SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
lab = C.ChemLab()
lab.reset(int(os.environ["TASK_SEED"]), SALT)
lock = threading.Lock()
mcp = FastMCP("chem-lab")


@mcp.tool()
def get_rules() -> dict:
    """The reactor model, the hypotheses (with prior), bounds, budget and scoring."""
    return C.rules()


@mcp.tool()
def run_experiment(temperature: float, time: float, concentration: float) -> dict:
    """Run one experiment: temperature in K, reaction time in min, co-reagent concentration in
    M. Returns the measured yield and the experiment index i (0-based)."""
    with lock:
        try:
            obs = lab.step({"temperature": temperature, "time": time,
                            "concentration": concentration})
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return {**obs["result"], "experiments_remaining": obs["experiments_remaining"]}


@mcp.tool()
def submit_posterior(posterior: dict[str, float]) -> str:
    """Submit your probability for each hypothesis name (normalised for you; missing names get
    0). Ends the episode; only one submission is accepted."""
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
            if lab.result is None:  # no submission = the prior = reward 0
                out = {"reward": 0.0, "submitted": 0.0, "n_experiments": float(len(lab.ys))}
            else:
                r = lab.result
                out = {k: float(r[k]) for k in ("reward", "reward_norm", "design", "inference",
                                               "accuracy", "n_experiments", "reference_reward",
                                               "gap_to_reference")}
                out["submitted"] = 1.0
                out["max_reward"] = float(r["max_reward"])
        # The single 0-1 score: share of the maximum achievable log-score gain for this fault
        # (0 = the prior or worse, 1 = certain and correct).
        out["score"] = min(1.0, max(0.0, out["reward"] / out["max_reward"])) if out.get("max_reward") else 0.0
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a) -> None:
        pass


if __name__ == "__main__":
    threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", 8001), Grade).serve_forever,
                     daemon=True).start()
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
