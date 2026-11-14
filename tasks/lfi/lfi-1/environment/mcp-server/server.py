"""MCP server for the LFI lab task, plus the verifier's grader.

Ports:
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only
        GET /table (Bearer SOLUTION_TOKEN): the public FSP tables, for the oracle only

Episode flow: get_rules -> run_assay (within the cell budget) -> finish_experiments (reveals
the queries; no more assays) -> submit_predictions (once; ends the episode).
Reward: expected log score of the submitted distributions under the TRUE rate constants, minus
the prior predictive's, divided by a fixed constant (bayesenv.lfilab.LfiLab.score). Only the
FSP of the hidden hypothesis is needed for that; the 10,000-hypothesis tables (built into the
image) are loaded in the background and used only for the reporting fields of /grade.
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

from bayesenv import lfilab as L

TOKEN = os.environ.get("GRADER_TOKEN", "")
SOLUTION_TOKEN = os.environ.get("SOLUTION_TOKEN", "")
if not TOKEN or not SOLUTION_TOKEN:
    sys.exit("GRADER_TOKEN / SOLUTION_TOKEN not set; refusing to start without protection")

# The code is public and the seed is in the task name, so an unsalted task's hidden constants
# could be recomputed. The salt lives only in this container: random per trial by default.
SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
lab = L.LfiLab(tables=False)
lab.reset(int(os.environ["TASK_SEED"]), SALT)
lock = threading.Lock()
model_ready = threading.Event()
mcp = FastMCP("lfi-lab")


def _load_model() -> None:
    try:
        if L.table_path().exists():
            L.model(True)
    finally:
        model_ready.set()


threading.Thread(target=_load_model, daemon=True).start()


@mcp.tool()
def get_rules() -> dict:
    """The full generative model (reactions, conditions, extrinsic noise, capture), the prior
    over the four hidden rate constants, the simulator in your container, the assay menu and
    cell budget, how queries are drawn, and the scoring."""
    return L.rules()


@mcp.tool()
def run_assay(condition: str, time: float, cells: int) -> dict:
    """Induce `cells` fresh cells at time 0 in `condition`, measure them at `time` and return
    the captured mRNA count of every cell. condition: "standard" or "low_inducer"; time: one of
    0.5, 1, 2, 4, 8; cells >= 10 and within the remaining cell budget."""
    with lock:
        try:
            obs = lab.step({"condition": condition, "time": time, "cells": cells})
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return {**obs["result"], "cells_remaining": obs["cells_remaining"],
                "assays_remaining": obs["assays_remaining"]}


@mcp.tool()
def finish_experiments() -> dict:
    """End the experiment phase and reveal the queries, each with its bins and its prior
    predictive. No more assays can be run afterwards. Calling it again returns the same
    queries."""
    with lock:
        return lab.finish()


@mcp.tool()
def submit_predictions(distributions: list[list[float]]) -> str:
    """Submit one probability distribution per query, in query order, each over that query's
    bins (as listed by finish_experiments) and summing to 1. Ends the episode; only one
    submission is accepted."""
    with lock:
        if lab.result is not None:
            raise ToolError("already submitted")
        try:
            lab.submit(distributions)
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return "submitted"


def grade() -> dict:
    """The verifier's breakdown. No submission = the prior predictive = 0."""
    with lock:
        r = lab.result
        out = {"submitted": 0.0 if r is None else 1.0, "n_assays": float(len(lab.history)),
               "cells_used": float(lab.cells_used), "score": 0.0, "reward_raw": 0.0,
               "norm": L.constants()["C"]}
        if r is not None:
            out.update({k: float(r[k]) for k in ("score", "reward_raw", "gain", "gain_truth",
                                                "raw_knowing_truth")})
        out["hidden_theta"] = lab.theta
        out["queries"] = [list(q) for q in lab._queries]
        out["assays"] = [{k: h[k] for k in ("condition", "time", "cells")} for h in lab.history]
        history = list(lab.history)
    # Reporting only (the score above depends on nothing but the truth and the submission):
    # exact inference on the agent's own data, and the reference on the same hidden constants.
    if r is not None and model_ready.wait(timeout=400) and L.table_path().exists():
        try:
            b = L.Belief()
            for h in history:
                b.add(L.DESIGNS.index((h["condition"], h["time"])), h["counts"])
            own = lab.score(b.predict(lab._queries))["reward_raw"]
            ref = L.run_policy("reference", lab.seed, lab.salt).result["reward_raw"]
            out.update(exact_on_own_data_raw=float(own), reference_raw=float(ref),
                       gap_to_reference=float(r["reward_raw"] - ref),
                       inference_gap=float(r["reward_raw"] - own), design_gap=float(own - ref))
        except Exception as e:  # never let reporting break grading
            out["reporting_error"] = repr(e)
    return out


class Grade(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        given = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if self.path == "/grade" and hmac.compare_digest(given, TOKEN):
            body = json.dumps(grade()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/table" and hmac.compare_digest(given, SOLUTION_TOKEN) \
                and L.table_path().exists():
            p = L.table_path()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(p.stat().st_size))
            self.end_headers()
            with open(p, "rb") as f:
                while chunk := f.read(1 << 20):
                    self.wfile.write(chunk)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *a) -> None:
        pass


if __name__ == "__main__":
    grade_port = int(os.environ.get("GRADE_PORT", "8001"))
    mcp_port = int(os.environ.get("MCP_PORT", "8000"))
    threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", grade_port), Grade).serve_forever,
                     daemon=True).start()
    mcp.run(transport="streamable-http", host="0.0.0.0", port=mcp_port)
