"""MCP server for the NeuronBench task, plus the verifier's grader.

Ports:
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only

Episode flow: get_rules -> run_experiment (while budget lasts) -> submit_forecasts (once).
The hidden cell is a private world built from (TASK_SEED, salt) in bayesenv.neuron; the
public neuronbench worlds, `discriminator()` and the truth are never exposed. Scoring targets
and the no-experiment forecast do not depend on the agent and are computed in a background
thread at start-up (about a minute of one core).
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

from bayesenv import neuron as N

TOKEN = os.environ.get("GRADER_TOKEN", "")
if not TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")

# The salt lives only in this container: random per trial by default, or pinned via TASK_SALT
# for a private fixed set.
SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
SEED = int(os.environ["TASK_SEED"])
FAMILY = os.environ.get("NEURON_WORLD") or None
lab = N.NeuronLab()
lab.reset(SEED, SALT, family=FAMILY)
lock = threading.Lock()
mcp = FastMCP("neuron")


def _precompute() -> None:
    try:
        lab.targets()
        lab.prior_forecast()
    except Exception as e:  # noqa: BLE001  (/grade retries it and fails closed)
        print(f"precompute failed: {e!r}", file=sys.stderr)


pre_thread = threading.Thread(target=_precompute, daemon=True)


@mcp.tool()
def get_rules() -> dict:
    """The task: prior description of the cell, reference model, protocol pool, blockers,
    budget, the held-out test protocols to forecast, and the scoring."""
    return lab.rules()


@mcp.tool()
def run_experiment(protocol: str | None = None, amplitude: float | None = None,
                   duration_ms: float | None = None, blockers: list[str] | None = None,
                   reps: int = 1) -> dict:
    """Record from the cell. Give EITHER `protocol` (a pool label copied verbatim from
    get_rules) OR a custom step (`amplitude` in uA and `duration_ms`). `blockers` is a list
    from TTX, TEA, Cd, XE991. Costs `reps` budget units. Returns the mean test-window spike
    count over the repeats, one noisy sub-sampled voltage recording (first repeat) and the
    remaining budget. Invalid or unaffordable runs are rejected and cost nothing."""
    action: dict = {"reps": reps, "blockers": blockers or []}
    if protocol is not None:
        action["protocol"] = protocol
    if amplitude is not None:
        action["amplitude"] = amplitude
    if duration_ms is not None:
        action["duration_ms"] = duration_ms
    with lock:
        try:
            return lab.step(action)
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e


@mcp.tool()
def submit_forecasts(forecasts: dict[str, float]) -> str:
    """Submit the forecast mean test-window spike count for every test protocol label
    ({"T1": 12.3, ...}). Ends the episode; only one submission is accepted. An invalid
    submission is rejected and does not use up the submission."""
    with lock:
        try:
            lab.submit(forecasts)
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return "submitted"


class Grade(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        given = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if self.path != "/grade" or not hmac.compare_digest(given, TOKEN):
            self.send_response(404)
            self.end_headers()
            return
        pre_thread.join(timeout=500)
        try:
            with lock:
                out = lab.grade()
        except Exception as e:  # noqa: BLE001  fail closed
            out = {"score": 0.0, "error": repr(e)}
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a) -> None:
        pass


if __name__ == "__main__":
    pre_thread.start()
    threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", 8001), Grade).serve_forever,
                     daemon=True).start()
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
