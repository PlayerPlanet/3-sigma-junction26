"""MCP server for a Bayesian experimental-design task, plus the verifier's grading endpoint.

Ports:
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only

Episode flow: get_rules -> run_experiment (up to the budget) -> finish_experiments (reveals the
evaluation designs; no more experiments) -> submit_predictions (once).
Reward: normalised expected log score under the TRUE parameters (0 = prior, 1 = truth), from
bayesenv. Also reported: the BoxingGym-style naive score, and the posterior-predictive
ceiling-check p-value that flags information leaks.
"""

from __future__ import annotations

import hmac
import json
import os
import secrets
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from bayesenv.task import Task, grade

TOKEN = os.environ.get("GRADER_TOKEN", "")
if not TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")

# The code is public and the seed is in the task name, so an unsalted task's theta* could be
# recomputed by the agent. The salt lives only in this container: random per trial by default
# (a fresh theta* from the prior every run), or pinned via TASK_SALT for a private fixed set.
SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
task = Task(os.environ["TASK_ENV"], int(os.environ["TASK_SEED"]), salt=SALT)
ep = task.episode()
state = {"pred": None, "eval_x": None}
lock = threading.Lock()
mcp = FastMCP("bayes-env")


@mcp.tool()
def get_rules() -> str:
    """Describe the system, the experiment budget, and the prediction format."""
    fmt = ("a list of probabilities (one per design) that the outcome is 1"
           if task.env.family == "bernoulli" else
           "a list of [mean, sd] pairs (one per design) for the measured value")
    return (f"{task.env.describe()}\n\nYou may run up to {task.budget} experiments with "
            "run_experiment. Call finish_experiments when done; it reveals the designs you must "
            f"predict and ends the experiment phase. Then call submit_predictions once with {fmt}. "
            "You are scored by the expected log probability your predictions assign to what the "
            "system actually does: be calibrated.")


@mcp.tool()
def run_experiment(design: list[float]) -> dict:
    """Run one experiment at the given design. Returns the observed outcome."""
    with lock:
        try:
            y = ep.observe(design)
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return {"outcome": y, "experiments_remaining": ep.remaining}


@mcp.tool()
def finish_experiments() -> dict:
    """End the experiment phase and reveal the evaluation designs to predict."""
    with lock:
        if state["eval_x"] is None:
            state["eval_x"] = ep.finish().round(3).tolist()
        return {"designs": state["eval_x"]}


@mcp.tool()
def submit_predictions(predictions: list) -> str:
    """Submit predictions for the evaluation designs (only the first submission counts)."""
    with lock:
        if state["eval_x"] is None:
            raise ToolError("call finish_experiments first")
        if state["pred"] is not None:
            raise ToolError("predictions already submitted")
        a = np.asarray(predictions, dtype=float)
        n = len(state["eval_x"])
        if task.env.family == "bernoulli":
            if a.shape != (n,) or np.any((a < 0) | (a > 1)):
                raise ToolError(f"need {n} probabilities in [0, 1]")
            state["pred"] = {"p": a}
        else:
            if a.shape != (n, 2) or np.any(a[:, 1] <= 0) or not np.all(np.isfinite(a)):
                raise ToolError(f"need {n} [mean, sd] pairs with sd > 0")
            state["pred"] = {"mean": a[:, 0], "sd": a[:, 1]}
        return "submitted"


class Grade(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        given = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if self.path != "/grade" or not hmac.compare_digest(given, TOKEN):
            self.send_response(404)
            self.end_headers()
            return
        with lock:
            if state["pred"] is None:  # no submission: do-nothing / stop-early earns nothing
                out = {"reward": 0.0, "submitted": 0.0, "n_obs": float(len(ep.ys))}
            else:
                g = grade(task, ep, state["pred"])
                out = {"reward": g["bayes_reward"], "submitted": 1.0, "n_obs": float(g["n_obs"]),
                       "bayes_raw": max(-10.0, g["bayes_raw"]), "naive": g["naive_reward"],
                       "ppc_p": g["ppc_p"]}
        out["score"] = min(1.0, max(0.0, float(out["reward"])))  # the single 0-1 score
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
