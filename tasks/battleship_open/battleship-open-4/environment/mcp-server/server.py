"""MCP server for Rulebound Battleship, plus the verifier's grader.

Ports:
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only

Episode flow: get_rules -> fire / scan (until the shot budget is spent, or earlier) ->
submit_beliefs (once; ends the episode). The hidden rule and ships live only in this
container, drawn from (TASK_SEED, salt) with a salt that is random per trial, so they cannot be
recomputed from the public code. The grade includes the full trajectory, the exact posterior
after every action, the truth and the reference run, so runs can be replayed in the UI
(scripts/battleship_ui.py); none of that is reachable through MCP.
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

from bayesenv.battleship_worlds import load

WORLD = os.environ.get("BATTLESHIP_WORLD", "closed")   # closed | open | hard
B = load(WORLD)

TOKEN = os.environ.get("GRADER_TOKEN", "")
if not TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")

SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
SEED = int(os.environ["TASK_SEED"])
lab = B.BattleshipLab()
lab.reset(SEED, SALT)
lock = threading.Lock()
mcp = FastMCP("battleship")


@mcp.tool()
def get_rules() -> dict:
    """The board, the ships, the placement rules and how the hidden one was drawn, the noise of
    each action, the budget, the prior probability of every cell, and the scoring."""
    return B.rules()


def _act(action: dict) -> dict:
    with lock:
        try:
            rec = lab.step(action)
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return dict(rec)


@mcp.tool()
def fire(row: int, col: int) -> dict:
    """Fire at one cell (row and col 0-5). Costs 1. Returns result 1 (hit) or 0 (miss); the
    reported result is sometimes wrong (the error rate is in get_rules). Also returns
    budget_remaining."""
    return _act({"type": "fire", "row": row, "col": col})


@mcp.tool()
def scan(axis: str, index: int) -> dict:
    """Count the ship cells in one whole row (axis="row") or column (axis="col"), index 0-5.
    Costs 2. The reported count is off by -1 or +1 with probability 0.15 each (then clipped to
    0-6). Also returns budget_remaining."""
    return _act({"type": "scan", "axis": axis, "index": index})


@mcp.tool()
def submit_beliefs(rules: dict[str, float], occupancy: list[list[float]]) -> str:
    """Submit your final beliefs; ends the episode, only one submission is accepted.
    rules: probability for each rule name (normalised for you; missing names get 0).
    occupancy: 6 rows of 6 numbers in [0, 1], the probability that a ship covers each cell."""
    with lock:
        if lab.result is not None:
            raise ToolError("already submitted")
        try:
            lab.submit(rules, occupancy, reference=False)
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return "submitted"


_ref: dict = {}


def _reference() -> dict:
    if not _ref:
        r = B.run_policy("reference", "exact", SEED, SALT)
        _ref.update({"history": r.history, "snapshots": r.snapshots, "result": r.result})
    return _ref


SCALARS = ("score", "score_raw", "rule_part", "cell_part", "design", "inference", "accuracy",
           "ppc_p", "n_actions", "n_fires", "n_scans", "budget_used")


class Grade(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        given = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if self.path != "/grade" or not hmac.compare_digest(given, TOKEN):
            self.send_response(404)
            self.end_headers()
            return
        with lock:
            if lab.result is None:  # no submission = the prior = score 0
                rr = B.BattleshipLab()
                rr.reset(SEED, SALT)
                for h in lab.history:
                    rr.step({k: h[k] for k in ("type", "row", "col", "axis", "index") if k in h})
                rr.submit(B.RULE_PRIOR.tolist(), None, reference=False)
                res, submitted = rr.result, 0.0
            else:
                res, submitted = lab.result, 1.0
            ref = _reference()
            out = {k: float(res[k]) for k in SCALARS}
            out.update({
                "submitted": submitted,
                "reference_score_raw": float(ref["result"]["score_raw"]),
                "reference_score": float(ref["result"]["score"]),
                "gap_to_reference": float(res["score_raw"] - ref["result"]["score_raw"]),
                "hidden_rule": res["hidden_rule"],
                "trajectory": {
                    "history": lab.history, "snapshots": lab.snapshots,
                    "result": {k: v for k, v in res.items()}},
                "reference": ref,
            })
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a) -> None:
        pass


if __name__ == "__main__":
    B.geometry()  # enumerate the layouts before accepting connections
    threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", 8001), Grade).serve_forever,
                     daemon=True).start()
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
