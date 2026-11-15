"""MCP server for the black-box credit task, plus the verifier's grader.

Ports:
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only

The score generator (locations, noise families, scales), the applicants' true segments, the seeds and the salt
stay in this container.
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

import credit_core as cc
import bbpub as P
import bblab as L

TOKEN = os.environ.get("GRADER_TOKEN", "")
if not TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")
SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
DESK = int(os.environ["TASK_DESK"])
SEEDS = [int(s) for s in os.environ["TASK_SEEDS"].split(",")]
VREF = float(os.environ["TASK_VREF"])
lab = L.Lab(DESK, SEEDS, SALT, VREF)
lock = threading.Lock()
mcp = FastMCP("credit-desk")


@mcp.tool()
def get_rules() -> dict:
    """The stated rules: segments and default probabilities, every applicant's prior, payoffs, costs and limits,
    score bands, and what is known about how check scores are generated."""
    return {
        "n_applicants": len(SEEDS),
        "segments": P.SEGMENTS,
        "default_probability": {P.SEGMENTS[t]: float(cc.PD[t]) for t in range(cc.K)},
        "applicant_priors": [L.applicant_prior(s) for s in SEEDS],
        "payoff": {"margin_if_repaid": cc.M, "loss_given_default": L.PR * cc.M, "decline": 0.0,
                   "approve_expected_value_for_segment": "(1 - PD) * 1000 - PD * 16000"},
        "live_check_cost": cc.COST, "max_checks_per_applicant": cc.T, "checks": P.CHECKS,
        "bands": L.bands(),
        "sandbox": {"price_per_draw": L.SIM_PRICE, "max_draws_per_call": L.SIM_MAX_PER_CALL,
                    "max_draws_per_episode": L.SIM_MAX_TOTAL},
        "score_model": "For each check kind: score = (a location that depends on the applicant's segment) + noise. "
                       "The noise distribution is specific to the check kind, symmetric around 0, and the same for "
                       "every segment and every applicant. Locations and noise distributions are not disclosed; "
                       "the sandbox draws from exactly the same generator. Every draw is independent.",
    }


@mcp.tool()
def simulate(segment: str, check: str, n: int = 1) -> dict:
    """Sandbox: n independent raw (unbanded) scores of `check` ('bureau', 'income' or 'bank') for synthetic
    applicants of the known `segment` ('S1'..'S6'). Costs $1 per draw (n <= 50 per call, 1000 per episode).
    Usable at any time; it does not affect the live applicants."""
    with lock:
        try:
            return lab.simulate(segment, check, n)
        except ValueError as e:
            raise ToolError(str(e)) from e


@mcp.tool()
def status() -> dict:
    """Current applicant, its prior, checks run on it so far and remaining, and money spent so far."""
    with lock:
        return lab.status()


@mcp.tool()
def run_check(check: str) -> dict:
    """Run one live check ('bureau', 'income' or 'bank') on the current applicant. Costs $20.
    Returns only the score band."""
    with lock:
        try:
            return lab.run_check(check)
        except ValueError as e:
            raise ToolError(str(e)) from e


@mcp.tool()
def decide(decision: str) -> dict:
    """Final decision on the current applicant: 'approve' or 'decline'. Irreversible; moves to the next
    applicant."""
    with lock:
        try:
            return lab.decide(decision)
        except ValueError as e:
            raise ToolError(str(e)) from e


class Grade(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        given = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if self.path != "/grade" or not hmac.compare_digest(given, TOKEN):
            self.send_response(404)
            self.end_headers()
            return
        with lock:
            out = lab.grade()
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a) -> None:
        pass


if __name__ == "__main__":
    threading.Thread(target=lab.precompute, daemon=True).start()   # true-model DP per applicant (~5 s each)
    threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", 8001), Grade).serve_forever, daemon=True).start()
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
