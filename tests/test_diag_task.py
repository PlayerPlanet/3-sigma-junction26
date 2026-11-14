"""Harbor packaging of the diagnostic lab: disclosure, grader breakdown, and the rendered
server played through a real MCP client (skipped when fastmcp is not installed)."""

import asyncio
import json
import math
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
import pytest

from bayesenv import diag as D

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / "tasks" / "diag" / "diag-0"
TB = D.load_table("low_yield")
CONTROL = "hplc_reference_standard"


def rules_json() -> dict:
    """The rules exactly as an agent receives them: through JSON, nothing else."""
    return json.loads(json.dumps(D.task_rules(TB)))


# ---- disclosure --------------------------------------------------------------------------

def test_posterior_recomputed_from_the_rules_alone_matches_the_engine():
    r = rules_json()
    names = [c["name"] for c in r["causes"]]
    prior = np.array([c["prior"] for c in r["causes"]])
    p_n = np.array([r["p_nuisance_given_cause"][c] for c in names])
    tests = {t["name"]: t for t in r["tests"]}
    assert names == TB.causes and len(r["nuisance_states"]) == p_n.shape[1]
    rng = np.random.default_rng(0)
    for _ in range(200):
        k = int(rng.integers(0, TB.T + 1))
        obs = [(int(t), int(rng.integers(len(TB.outcomes[t]))))
               for t in rng.choice(TB.T, k, replace=False)]
        w = prior[:, None] * p_n                         # plain Bayes from the rules only
        for t, o in obs:
            lik = np.array(tests[TB.tests[t]]["p_outcome_given_cause_nuisance"])
            w = w * lik[:, :, tests[TB.tests[t]]["outcomes"].index(TB.outcomes[t][o])]
        if w.sum() == 0:
            continue
        np.testing.assert_allclose(w.sum(1) / w.sum(), D.posterior(TB, obs).sum(1), atol=1e-12)


def test_rules_state_costs_budget_protocol_and_scoring():
    r = rules_json()
    assert r["budget"] == TB.budget == 10
    assert [t["cost"] for t in r["tests"]] == TB.costs.tolist()
    assert [t["name"] for t in r["tests"]] == TB.tests
    assert [v["name"] for v in r["nuisance_variables"]] == ["elution_order", "reagent_lot"]
    assert abs(sum(c["prior"] for c in r["causes"]) - 1) < 1e-12
    for word in ("at most once", "one reading", "cost nothing", "stop at any time", "once"):
        assert word in r["protocol"], word
    assert "log q(true cause) - log prior(true cause)" in r["scoring"]
    assert str(r["epsilon"]) in r["scoring"] and "scores 0" in r["scoring"]


def test_table_rebuilt_from_rules_gives_the_same_dp():
    tb2 = D.table_from_rules(rules_json())
    a, b = D.exact_dp(TB), D.exact_dp(tb2)
    assert a.value == pytest.approx(b.value, abs=1e-12) and a.n_states == b.n_states
    assert a.value == pytest.approx(1.6196, abs=1e-3)


def test_rules_and_instruction_hide_the_tags_and_give_no_strategy_hints():
    text = json.dumps(D.task_rules(TB)).lower()
    roles = {r for r in TB.roles if r}
    assert {"control", "misleading"} <= roles          # the YAML does tag them
    for role in roles:                                 # no tag as a value anywhere ...
        assert f'"{role}"' not in text, role
    for word in ("control", "misleading", "role", "trap", "lookahead", "look ahead",
                 "dynamic programming", "greedy", "plan"):   # ... and these not even in prose
        assert word not in text, word
    for f in (ROOT / "templates/diag_task/instruction.md", TASK / "instruction.md"):
        ins = f.read_text(encoding="utf-8").lower()
        for word in ("plan", "lookahead", "look ahead", "dynamic programming", "greedy",
                     "control", "misleading"):
            assert word not in ins, (f, word)
        for word in ("python", "numpy", "scipy", "code", "budget"):
            assert word in ins, (f, word)


# ---- grader ------------------------------------------------------------------------------

def test_no_submission_and_prior_score_zero():
    refs = D.reference_runs(TB, 0, "s")
    lab = D.DiagLab(TB)
    lab.reset(0, "s")
    g = D.grade(lab, refs)
    assert g["score"] == 0 and g["reward"] == 0 and g["submitted"] is False
    assert g["tests_run"] == [] and g["control_run"] is False and g["control_step"] is None
    lab.step(CONTROL)
    lab.submit(dict(zip(TB.causes, TB.prior)))
    g = D.grade(lab, refs)
    assert g["submitted"] is True and g["score"] == 0 and abs(g["reward"]) < 1e-12
    assert g["control_run"] is True and g["control_step"] == 1


def test_grade_records_order_control_misleading_and_the_split():
    refs = D.reference_runs(TB, 3, "s")
    lab = D.DiagLab(TB)
    lab.reset(3, "s")
    order = ["catalyst_metals_assay", "hplc_crude", CONTROL, "thermocouple_audit"]
    for n in order:
        lab.step(n)
    q = np.full(TB.C, 1 / TB.C)
    lab.submit(q.tolist())
    g = D.grade(lab, refs)
    json.dumps(g)                                        # serialisable as is
    assert [t["test"] for t in g["tests_run"]] == order
    assert [t["cost"] for t in g["tests_run"]] == [4, 2, 1, 3]
    assert [t["step"] for t in g["tests_run"]] == [1, 2, 3, 4]
    assert g["budget_used"] == 10 and g["budget_remaining"] == 0 and g["n_tests"] == 4
    assert g["control_tests"] == [CONTROL] and g["control_run"] and g["control_step"] == 3
    assert sorted(g["misleading_tests"]) == sorted(
        ["catalyst_metals_assay", "solvent_water_external_lab", "thermocouple_audit"])
    assert g["misleading_run"] == 2
    assert g["design"] + g["inference"] == pytest.approx(g["reward"], abs=1e-12)
    c = TB.causes.index(g["hidden_cause"])
    assert g["exact_posterior"][g["hidden_cause"]] == pytest.approx(lab.exact_posterior()[c])
    assert g["design"] == pytest.approx(math.log(lab.exact_posterior()[c] / TB.prior[c]))
    assert g["gap_to_dp"] == pytest.approx(g["reward"] - g["dp_reward"])
    assert g["gap_to_greedy"] == pytest.approx(g["reward"] - g["greedy_reward"])
    assert g["design_gap_to_dp"] == pytest.approx(g["design"] - g["dp_reward"])
    assert 0 <= g["score"] <= 1 and 0 <= g["dp_score"] <= 1 and 0 <= g["greedy_score"] <= 1


def test_score_is_clipped_share_of_the_certain_correct_answer():
    dp = D.exact_dp(TB)
    for seed in range(12):
        refs = D.reference_runs(TB, seed, "s", dp=dp)
        for kind in ("right", "wrong", "dp"):
            lab = D.DiagLab(TB)
            lab.reset(seed, "s")
            c = TB.causes.index(lab.hidden)
            if kind == "dp":
                lab = D.run_policy(TB, dp.policy, seed, "s") if seed < 6 else lab
                if lab.result is None:
                    continue
            else:
                q = np.zeros(TB.C)
                q[c if kind == "right" else (c + 1) % TB.C] = 1
                lab.submit(q.tolist())
            g = D.grade(lab, refs)
            assert 0.0 <= g["score"] <= 1.0
            assert g["max_reward"] == pytest.approx(
                math.log((1 - D.EPS) + D.EPS * TB.prior[c]) - math.log(TB.prior[c]))
            if kind == "right":
                assert g["score"] == pytest.approx(1.0) and g["accuracy"] == 1
            elif kind == "wrong":
                assert g["score"] == 0 and g["reward"] < -5
            else:
                assert g["score"] == pytest.approx(g["dp_score"]) and abs(g["gap_to_dp"]) < 1e-12


def test_references_use_the_same_hidden_draw():
    refs = D.reference_runs(TB, 5, "salt-a")
    lab = D.run_policy(TB, D.greedy_policy, 5, "salt-a")
    assert refs["greedy_reward"] == pytest.approx(lab.result["reward"])
    assert refs["greedy_tests"] == [h["test"] for h in lab.history]
    assert refs["dp_expected_reward"] == pytest.approx(1.6196, abs=1e-3)
    assert refs["greedy_expected_reward"] == pytest.approx(0.8316, abs=1e-3)
    assert CONTROL in refs["dp_tests"] and CONTROL not in refs["greedy_tests"]


def test_rendered_tasks_are_current_and_keep_the_tags_out_of_the_solution():
    for seed in range(5):
        t = ROOT / "tasks" / "diag" / f"diag-{seed}"
        for name in ("chem_lab.py", "chem_reward.py", "diag.py"):
            for sub in ("environment/mcp-server/bayesenv", "solution/bayesenv"):
                assert (t / sub / name).read_bytes() == (ROOT / "bayesenv" / name).read_bytes()
        assert (t / "environment/mcp-server/specs/tables/low_yield.yaml").read_bytes() == \
            (ROOT / "specs/tables/low_yield.yaml").read_bytes()
        assert not list((t / "solution").rglob("*.yaml"))
        token = (t / "tests" / "grader_token").read_text().strip()
        compose = (t / "environment" / "docker-compose.yaml").read_text()
        assert len(token) >= 24 and f'GRADER_TOKEN: "{token}"' in compose
        assert f'TASK_SEED: "{seed}"' in compose and 'TASK_SALT: ""' in compose
        assert "__SEED__" not in compose + (t / "task.toml").read_text()


# ---- the rendered server, as a local process, through an MCP client -----------------------

def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Server:
    def __init__(self, salt: str):
        self.token = "test-token-" + salt
        self.mcp_port, self.grade_port = _free_port(), _free_port()
        env = {**os.environ, "GRADER_TOKEN": self.token, "TASK_SEED": "0", "TASK_SALT": salt,
               "MCP_PORT": str(self.mcp_port), "GRADE_PORT": str(self.grade_port),
               "BIND_HOST": "127.0.0.1"}
        self.proc = subprocess.Popen([sys.executable, "server.py"],
                                     cwd=TASK / "environment" / "mcp-server", env=env,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.url = f"http://127.0.0.1:{self.mcp_port}/mcp"

    def __enter__(self):
        deadline = time.time() + 60
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError("server exited at startup")
            try:
                socket.create_connection(("127.0.0.1", self.mcp_port), timeout=0.5).close()
                socket.create_connection(("127.0.0.1", self.grade_port), timeout=0.5).close()
                return self
            except OSError:
                time.sleep(0.2)
        self.proc.kill()
        raise RuntimeError("server did not start")

    def __exit__(self, *a):
        self.proc.kill()
        self.proc.wait(timeout=10)

    def grade(self, token=None) -> dict:
        req = urllib.request.Request(f"http://127.0.0.1:{self.grade_port}/grade", headers={
            "Authorization": f"Bearer {self.token if token is None else token}"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())


def _verifier_score(details: dict) -> float:
    """The same arithmetic as tests/test.sh applies to details.json."""
    s = float(details["score"])
    return min(1.0, max(0.0, s)) if math.isfinite(s) else 0.0


def test_server_do_nothing_and_invalid_actions_through_mcp():
    fastmcp = pytest.importorskip("fastmcp")
    from fastmcp.exceptions import ToolError

    async def play(url):
        async with fastmcp.Client(url) as c:
            assert {t.name for t in await c.list_tools()} == {
                "get_rules", "run_test", "submit_posterior"}
            r = (await c.call_tool("get_rules", {})).data
            assert json.loads(json.dumps(r)) == rules_json()      # the wire carries all of it
            for bad in ("no_such_test", ""):
                with pytest.raises(ToolError):
                    await c.call_tool("run_test", {"name": bad})
            return r

    with Server("nothing") as s:
        asyncio.run(play(s.url))
        with pytest.raises(urllib.error.HTTPError):
            s.grade(token="wrong")
        g = s.grade()
        assert g["submitted"] is False and g["tests_run"] == [] and g["budget_used"] == 0
        assert g["reward"] == 0 and _verifier_score(g) == 0
        assert g["dp_reward"] != 0 and "greedy_reward" in g


def test_server_budget_repeats_and_single_submission_through_mcp():
    fastmcp = pytest.importorskip("fastmcp")
    from fastmcp.exceptions import ToolError

    async def play(url):
        async with fastmcp.Client(url) as c:
            a = (await c.call_tool("run_test", {"name": "catalyst_metals_assay"})).data
            assert a["budget_remaining"] == 6 and a["cost"] == 4
            assert a["reading"] in ("negative", "positive")
            with pytest.raises(ToolError, match="already run"):
                await c.call_tool("run_test", {"name": "catalyst_metals_assay"})
            b = (await c.call_tool("run_test", {"name": "solvent_water_external_lab"})).data
            assert b["budget_remaining"] == 2
            with pytest.raises(ToolError, match="budget"):
                await c.call_tool("run_test", {"name": "thermocouple_audit"})
            with pytest.raises(ToolError):
                await c.call_tool("submit_posterior", {"posterior": {"not_a_cause": 1.0}})
            d = (await c.call_tool("run_test", {"name": "hplc_crude"})).data
            assert d["budget_remaining"] == 0                     # rejections cost nothing
            assert (await c.call_tool("submit_posterior", {
                "posterior": {n: 1.0 for n in TB.causes}})).data == "submitted"
            with pytest.raises(ToolError, match="already submitted"):
                await c.call_tool("submit_posterior", {"posterior": {TB.causes[0]: 1.0}})
            with pytest.raises(ToolError):
                await c.call_tool("run_test", {"name": "colour_check"})

    with Server("budget") as s:
        asyncio.run(play(s.url))
        g = s.grade()
        assert [t["test"] for t in g["tests_run"]] == [
            "catalyst_metals_assay", "solvent_water_external_lab", "hplc_crude"]
        assert g["budget_used"] == 10 and g["misleading_run"] == 2 and not g["control_run"]
        assert g["submitted"] is True and 0 <= _verifier_score(g) <= 1
        assert g["design"] + g["inference"] == pytest.approx(g["reward"], abs=1e-12)


def test_server_oracle_solution_plays_the_dp_policy_through_mcp():
    pytest.importorskip("fastmcp")
    sh = (TASK / "solution" / "solve.sh").read_text(encoding="utf-8")
    code = re.search(r"<<'PY'\n(.*)\nPY\n", sh, re.S).group(1)   # the oracle's own program
    with Server("oracle") as s:
        out = subprocess.run([sys.executable, "-c", code], cwd=TASK / "solution",
                             env={**os.environ, "MCP_URL": s.url}, capture_output=True,
                             text=True, timeout=120)
        assert out.returncode == 0, out.stderr[-2000:]
        assert "submitted" in out.stdout
        g = s.grade()
        assert g["submitted"] is True
        assert [t["test"] for t in g["tests_run"]] == g["dp_tests"]
        assert abs(g["gap_to_dp"]) < 1e-9 and abs(g["inference"]) < 2e-3   # O(EPS) mixing
        assert _verifier_score(g) == pytest.approx(g["dp_score"]) and 0 < g["score"] <= 1
        assert g["control_run"] is True and g["budget_used"] <= 10
        print("oracle", g["score"], g["reward"], g["dp_tests"])
