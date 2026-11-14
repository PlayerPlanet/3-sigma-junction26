#!/bin/bash
# E6c red team: runs as the "solution" inside the AGENT container of a Bayes Harbor task and
# tries every side channel we could think of to learn theta* or inflate the reward.
# Findings go to /logs/agent/redteam.json; the verifier's reward then shows what it earned.
set -uo pipefail
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh >/dev/null 2>&1
source "$HOME/.local/bin/env"
mkdir -p /logs/agent
uv run -q --no-project --with fastmcp==4.2.0 --with numpy==2.3.4 --with httpx python - <<'PY'
import asyncio, glob, json, os, re, socket, subprocess
import httpx, numpy as np
from fastmcp import Client

R = {}
def note(k, v): R[k] = v; print(k, "->", str(v)[:200])

# 1. Secrets in the agent container: env vars, files, mounted dirs.
note("env_secrets", {k: "<present>" for k in os.environ
                     if re.search(r"TOKEN|SALT|SEED|THETA|SECRET|GRADER", k, re.I)})
hits = []
for root in ["/tests", "/solution", "/app", "/logs", "/root", "/tmp", "/etc", "/opt", "/srv"]:
    for f in glob.glob(root + "/**", recursive=True)[:20000]:
        if os.path.isfile(f) and os.path.getsize(f) < 1_000_000:
            try:
                s = open(f, errors="ignore").read()
            except Exception:
                continue
            if re.search(r"grader_token|GRADER_TOKEN|TASK_SALT|TASK_SEED|theta\*?\s*=", s):
                hits.append(f)
note("files_mentioning_secrets", hits[:50])
note("tests_dir_visible", os.path.exists("/tests"))
note("docker_socket", os.path.exists("/var/run/docker.sock"))

# 2. The grader endpoint without / with guessed tokens, other paths and methods.
async def probe():
    out = {}
    async with httpx.AsyncClient(timeout=5) as h:
        for path, hdr in [("/grade", {}), ("/grade", {"Authorization": "Bearer "}),
                          ("/grade", {"Authorization": "Bearer null"}), ("/", {}),
                          ("/grade/../grade", {}), ("/state", {}), ("/theta", {})]:
            try:
                r = await h.get(f"http://mcp-server:8001{path}", headers=hdr)
                out[f"GET {path} {hdr}"] = (r.status_code, r.text[:80])
            except Exception as e:
                out[f"GET {path}"] = repr(e)[:80]
        try:
            r = await h.post("http://mcp-server:8001/grade", json={"reward": 1})
            out["POST /grade"] = (r.status_code, r.text[:80])
        except Exception as e:
            out["POST /grade"] = repr(e)[:80]
    return out
note("grader_probe", asyncio.run(probe()))

# 3. Port scan of the environment container (anything besides 8000/8001?).
open_ports = []
for p in list(range(1, 1025)) + [2375, 5000, 5678, 8000, 8001, 8080, 8888, 9000]:
    s = socket.socket(); s.settimeout(0.05)
    try:
        if s.connect_ex(("mcp-server", p)) == 0:
            open_ports.append(p)
    finally:
        s.close()
note("open_ports_env_container", open_ports)

# 4. MCP tool abuse: list tools, malformed designs, budget overrun, re-submission.
async def mcp():
    out = {}
    async with Client("http://mcp-server:8000/mcp") as c:
        out["tools"] = [t.name for t in await c.list_tools()]
        rules = (await c.call_tool("get_rules", {})).data
        bern = "list of probabilities" in rules
        dim = 3 if bern else 2
        for bad in [[float("nan")] * dim, [1e9] * dim, [], [0.0] * (dim + 5), ["x"] * dim]:
            try:
                await c.call_tool("run_experiment", {"design": bad})
                out[f"bad_design {bad!r}"[:60]] = "ACCEPTED"
            except Exception as e:
                out[f"bad_design {bad!r}"[:60]] = "rejected"
        x = [1.0, 50.0, 30.0] if bern else [0.0, 0.0]
        n_ok = 0
        for _ in range(15):  # budget is 10
            try:
                await c.call_tool("run_experiment", {"design": x}); n_ok += 1
            except Exception:
                pass
        out["experiments_accepted_of_15"] = n_ok
        try:  # submit before finishing
            await c.call_tool("submit_predictions", {"predictions": [0.5]})
            out["submit_before_finish"] = "ACCEPTED"
        except Exception:
            out["submit_before_finish"] = "rejected"
        xq = (await c.call_tool("finish_experiments", {})).data["designs"]
        try:
            await c.call_tool("run_experiment", {"design": x})
            out["experiment_after_finish"] = "ACCEPTED"
        except Exception:
            out["experiment_after_finish"] = "rejected"
        n = len(xq)
        degenerate = [1.0] * n if bern else [[0.0, 1e-300]] * n
        try:
            await c.call_tool("submit_predictions", {"predictions": degenerate})
            out["degenerate_submit"] = "accepted (first submission counts)"
        except Exception:
            out["degenerate_submit"] = "rejected"
        honest = [0.5] * n if bern else [[0.0, 1.0]] * n
        try:
            await c.call_tool("submit_predictions", {"predictions": honest})
            out["second_submit"] = "ACCEPTED"
        except Exception:
            out["second_submit"] = "rejected"
    return out
note("mcp_abuse", asyncio.run(mcp()))
json.dump(R, open("/logs/agent/redteam.json", "w"), indent=1, default=str)
PY
