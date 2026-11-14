"""MCP server for the hierarchical lab task, plus the verifier's grader.

Ports (overridable for local testing with MCP_PORT / GRADE_PORT):
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only

Episode flow: get_rules -> run_experiment(unit, design) up to the budget -> finish_experiments
(reveals the queries; no more experiments) -> submit_predictions (once).
Reward: expected log score of the submitted probabilities under the true parameters, minus the
prior predictive's, divided by a fixed per-task constant (bayesenv.hier_reward), clipped to
[0, 1]. Also reported: the unclipped value, the split into known-unit (a) and new-unit (b)
queries, the score of the exact posterior on the agent's own data, and the reference's score
on the same hidden draw.
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

from bayesenv import hier as H

TOKEN = os.environ.get("GRADER_TOKEN", "")
if not TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")

# The code is public and the seed is in the task name, so an unsalted task's hidden draws could
# be recomputed. The salt lives only in this container: random per trial by default, or pinned
# via TASK_SALT for a private fixed set.
SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
SEED = int(os.environ["TASK_SEED"])
lab = H.HierLab()
lab.reset(SEED, SALT)
state: dict = {"reference": None}
lock = threading.Lock()
mcp = FastMCP("hier-lab")


@mcp.tool()
def get_rules() -> dict:
    """The complete generative model (every prior and hyperprior), the budget, the format of
    the queries and of the submission, and the scoring rule."""
    return H.rules()


@mcp.tool()
def run_experiment(unit: int, design: float) -> dict:
    """Run one experiment on unit `unit` (integer 0..K-1) at design `design`. Returns the
    binary outcome. Invalid requests are rejected and do not use up budget."""
    with lock:
        try:
            obs = lab.step({"unit": unit, "design": design})
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return {**obs["result"], "experiments_remaining": obs["experiments_remaining"]}


@mcp.tool()
def finish_experiments() -> dict:
    """End the experiment phase (no more experiments) and reveal the queries to predict."""
    with lock:
        return {"queries": lab.finish()}


@mcp.tool()
def submit_predictions(predictions: list[float]) -> str:
    """Submit P(outcome = 1) for every query, in the order of the queries. Only one submission
    is accepted; it ends the episode."""
    with lock:
        if not lab.finished:
            raise ToolError("call finish_experiments first")
        if lab.result is not None:
            raise ToolError("predictions already submitted")
        try:
            lab.submit(predictions)
        except ValueError as e:
            raise ToolError(str(e)) from e
        return "submitted"


KEYS = ("reward", "raw", "raw_a", "raw_b", "gain_nats", "gain_a_nats", "gain_b_nats", "norm",
        "norm_a", "norm_b", "design_raw", "inference_raw", "n_experiments", "units_tested")


def grade() -> dict:
    with lock:
        if lab.result is None:      # no submission = the prior predictive = reward 0
            out = {"reward": 0.0, "raw": 0.0, "raw_a": 0.0, "raw_b": 0.0, "submitted": 0.0,
                   "n_experiments": float(len(lab.history))}
        else:
            out = {k: float(lab.result[k]) for k in KEYS}
            out["submitted"] = 1.0
        if state["reference"] is None:      # same hidden draw and noise stream, about 0.5 s
            state["reference"] = H.run_policy("reference", SEED, SALT, lab.m).result
        ref = state["reference"]
        out.update(reference_raw=float(ref["raw"]), reference_raw_a=float(ref["raw_a"]),
                   reference_raw_b=float(ref["raw_b"]), reference_reward=float(ref["reward"]),
                   gap_to_reference=float(out["raw"] - ref["raw"]))
    out["score"] = min(1.0, max(0.0, out["reward"]))    # the single 0-1 score
    return out


class Grade(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        given = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if self.path != "/grade" or not hmac.compare_digest(given, TOKEN):
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(grade()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a) -> None:
        pass


if __name__ == "__main__":
    host = os.environ.get("BIND_HOST", "0.0.0.0")
    threading.Thread(
        target=ThreadingHTTPServer((host, int(os.environ.get("GRADE_PORT", "8001"))), Grade).serve_forever,
        daemon=True).start()
    mcp.run(transport="streamable-http", host=host, port=int(os.environ.get("MCP_PORT", "8000")))
