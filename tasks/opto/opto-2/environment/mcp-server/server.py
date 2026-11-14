"""MCP server for the optogenetics lab ("Light switch"), plus the verifier's grader.

Ports:
  8000  MCP (streamable-http): the agent's only interface
  8001  GET /grade (Bearer GRADER_TOKEN): verifier only

Episode flow: get_rules -> record_activity / express_opsin / light_session (until the budget is
spent or the agent stops) -> finish_experiments (reveals the queries; no more experiments) ->
submit_predictions (once; ends the episode).
Reward: expected log score of the submitted probabilities under the TRUE circuit, minus the
prior predictive's, divided by a fixed constant (bayesenv.optolab.OptoLab.score).
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

from bayesenv import optolab as O

TOKEN = os.environ.get("GRADER_TOKEN", "")
if not TOKEN:
    sys.exit("GRADER_TOKEN is not set; refusing to start without a protected grader")

# The code is public and the seed is in the task name, so an unsalted task's hidden circuit
# could be recomputed. The salt lives only in this container: random per trial by default, or
# pinned via TASK_SALT for a private fixed set.
SALT = os.environ.get("TASK_SALT") or secrets.token_hex(16)
lab = O.OptoLab()
lab.reset(int(os.environ["TASK_SEED"]), SALT)
lock = threading.Lock()
mcp = FastMCP("opto-lab")
COLUMNS = list(O.NAMES)


def _step(action: dict) -> dict:
    with lock:
        try:
            out = lab.step(action)
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        rec = dict(out["result"])
        if "samples" in rec:
            rec["columns"] = COLUMNS
        rec["budget_remaining"] = out["budget_remaining"]
        return rec


@mcp.tool()
def get_rules() -> dict:
    """The complete generative model (circuit prior, LEVER gate, opsins, expression levels,
    efficacy curve, heating artefact), the actions and their costs, the budget, how the queries
    are drawn, and the scoring."""
    return O.rules()


@mcp.tool()
def get_status() -> dict:
    """Budget remaining and the animals you have created (id, opsin, populations)."""
    with lock:
        return lab.status()


@mcp.tool()
def record_activity() -> dict:
    """Passive imaging of a naive animal (no light). Returns natural trials; each row lists
    VTA, NAc, PFC, BLA, LEVER (0/1) in that order."""
    return _step({"action": "record"})


@mcp.tool()
def express_opsin(opsin: str, populations: list[str]) -> dict:
    """Create a new animal expressing opsin "ChR2" (excite) or "ArchT" (silence) in one or two
    populations, e.g. populations=["VTA"] or ["NAc", "BLA"]. Returns the animal id."""
    return _step({"action": "express", "opsin": opsin, "populations": populations})


@mcp.tool()
def light_session(animal: int, intensity: float) -> dict:
    """Run a light session on one of your animals at an allowed intensity (mW/mm^2, see the
    rules). Returns the trials; each row lists VTA, NAc, PFC, BLA, LEVER (0/1) in that order."""
    return _step({"action": "light", "animal": animal, "intensity": intensity})


@mcp.tool()
def finish_experiments() -> dict:
    """End the experiment phase and reveal the queries. Each asks for P(target = 1) under an
    ideal intervention; each comes with its prior predictive value. No more experiments can be
    run afterwards. Calling it again returns the same queries."""
    with lock:
        return lab.finish()


@mcp.tool()
def submit_predictions(probabilities: list[float]) -> str:
    """Submit one probability per query, in query order (P that the target is 1). Ends the
    episode; only one submission is accepted."""
    with lock:
        if lab.result is not None:
            raise ToolError("already submitted")
        try:
            lab.submit(probabilities)
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from e
        return "submitted"


def grade() -> dict:
    """The verifier's breakdown. No submission = the prior predictive = 0."""
    with lock:
        r = lab.result
        out = {"submitted": 0.0 if r is None else 1.0, "spent": float(lab.spent),
               "n_animals": float(len(lab.animals)), "score": 0.0, "reward_raw": 0.0,
               "norm": O.norm_constant()}
        if r is not None:
            out.update({k: float(r[k]) for k in ("score", "reward_raw", "log_score",
                                                "log_score_prior", "log_score_truth",
                                                "raw_knowing_truth")})
            # Exact inference on the agent's own data, and the reference on the same circuit:
            # gap to reference = design part + inference part. Reporting only: the score above
            # depends on nothing but the hidden truth and the submission.
            own = lab.score(lab.belief.predict(lab._queries))["reward_raw"]
            ref = O.run_policy("reference", lab.seed, lab.salt).result["reward_raw"]
            out.update(exact_on_own_data_raw=float(own), reference_raw=float(ref),
                       gap_to_reference=float(r["reward_raw"] - ref),
                       inference_gap=float(r["reward_raw"] - own), design_gap=float(own - ref))
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
    # Ports are fixed in the container; the overrides exist only for local testing.
    grade_port = int(os.environ.get("GRADE_PORT", "8001"))
    mcp_port = int(os.environ.get("MCP_PORT", "8000"))
    threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", grade_port), Grade).serve_forever,
                     daemon=True).start()
    mcp.run(transport="streamable-http", host="0.0.0.0", port=mcp_port)
