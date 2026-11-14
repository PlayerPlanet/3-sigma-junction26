"""MCP server for the Wetlab task (Held-out D), plus the verifier's grader.

Ports:
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only

Episode flow: get_rules -> run_experiment (while stock lasts) -> submit_posterior (once; ends
the episode). Reward: log q(h*) - log prior(h*) from bayesenv.wetlab_reward; it depends only on
the true mechanism. The grader also reports accuracy, stock used, the (approximate) reference
policy's reward on the same seed + salt and the gap to it. The reference is computed in a
background thread at start-up (it does not depend on the agent) and never shown to the agent.
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

from bayesenv import wetlab as W

TOKEN = os.environ.get("GRADER_TOKEN", "")
if not TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")

# The code is public and the seed is in the task name, so an unsalted task's hidden mechanism
# could be recomputed. The salt lives only in this container: random per trial by default, or
# pinned via TASK_SALT for a private fixed set.
SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
SEED = int(os.environ["TASK_SEED"])
lab = W.WetLab(track_reference=False)
lab.reset(SEED, SALT)
lock = threading.Lock()
mcp = FastMCP("wetlab")
reference: dict = {}


def _reference() -> None:
    try:
        reference.update(W.reference_trajectory(SEED, SALT)["result"])
    except Exception as e:  # noqa: BLE001  (the reward itself never depends on this)
        print(f"reference failed: {e!r}", file=sys.stderr)


ref_thread = threading.Thread(target=_reference, daemon=True)


@mcp.tool()
def get_rules() -> dict:
    """The stochastic model, the candidate mechanisms (with prior and rate-constant priors),
    bounds, stock, costs and scoring."""
    return W.rules()


@mcp.tool()
def run_experiment(substrate: int, catalyst: int, temperature: float,
                   sample_times: list[float], product_spike: int = 0) -> dict:
    """Run one vessel: substrate S0, catalyst C0 and product spike P0 in molecules,
    temperature in K, 1-6 strictly increasing sampling times in min. Returns the noisy product
    readings at those times and the remaining stock. Invalid or unaffordable runs are rejected
    and consume nothing."""
    with lock:
        try:
            obs = lab.step({"substrate": substrate, "catalyst": catalyst,
                            "product_spike": product_spike, "temperature": temperature,
                            "sample_times": sample_times})
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return {**obs["result"], "stock_remaining": obs["stock_remaining"],
                "can_run": obs["can_run"]}


@mcp.tool()
def submit_posterior(posterior: dict[str, float]) -> str:
    """Submit your probability for each mechanism name (normalised for you; missing names get
    0). Ends the episode; only one submission is accepted."""
    with lock:
        if lab.result is not None:
            raise ToolError("already submitted")
        try:
            lab.submit(posterior, reference=False, diagnostics=False)
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
        ref_thread.join(timeout=420)
        with lock:
            used = {k: W.STOCK[k] - v for k, v in lab.stock.items()}
            out = {"reward": 0.0, "accuracy": 0.0, "submitted": 0.0,   # no submission = prior
                   "n_runs": float(len(lab.actions)),
                   "n_samples": float(sum(len(y) for y in lab.readings)),
                   "budget_used": float(sum(used[k] / W.STOCK[k] for k in used) / len(used))}
            if lab.result is not None:
                out.update(reward=float(lab.result["reward"]),
                           accuracy=float(lab.result["accuracy"]), submitted=1.0)
            if reference:
                out["reference_reward"] = float(reference["reward"])
                out["reference_accuracy"] = float(reference["accuracy"])
                out["gap_to_reference"] = out["reward"] - out["reference_reward"]
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a) -> None:
        pass


if __name__ == "__main__":
    ref_thread.start()
    threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", 8001), Grade).serve_forever,
                     daemon=True).start()
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
