"""Lab-transfer design rows (bayesenv/lab_rows.py, docs/LAB_ROWS.md)."""

import json
import re
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bayesenv import chem_lab as CH  # noqa: E402
from bayesenv import dagnet as DN  # noqa: E402
from bayesenv import datagen  # noqa: E402
from bayesenv import diag as D  # noqa: E402
from bayesenv import lab_rows as L  # noqa: E402

SAMPLE = ROOT / "data" / "lab_transfer" / "sample_rows.jsonl"
ROW_KEYS = set(datagen.COMMON) | {"candidates", "eig"}
DIAG_KEYS = {"value", "greedy_choice", "dp_choice"}
EXACT = ("lab:chem", "lab:diag", "lab:dag")


@pytest.fixture(scope="module")
def fresh():
    """A few freshly generated rows per lab (small: the full set is not in the repository)."""
    rows = []
    for source in L.SOURCES:
        for depth in (0, 3, 9):
            rows += L.generate_cell("chem", source, depth, 2)
        for depth in (0, 2, 4):
            rows += L.generate_cell("diag", source, depth, 3)
        for depth in (0, 2):
            rows += L.generate_cell("dag", source, depth, 1)
    return rows


@pytest.fixture(scope="module")
def sample():
    return [json.loads(line) for line in SAMPLE.read_text(encoding="utf-8").splitlines()]


def _check_schema(rows):
    for r in rows:
        datagen.validate_row(r)
        assert r["kind"] == "design" and r["split"] == "lab_transfer" and r["instance"] == -1
        assert r["spec"] in L.SPECS and r["env"] == f"{r['spec']}@{r['spec_hash']}"
        assert len({json.dumps(c) for c in r["candidates"]}) == 6          # six distinct candidates
        assert max(r["eig"]) >= L.MIN_EIG - 1e-5
        assert sum(m["role"] == "assistant" for m in r["prompt"]) == r["depth"]
        assert set(r) == ROW_KEYS | (DIAG_KEYS if r["spec"] == "lab:diag" else set())


def test_schema(fresh, sample):
    _check_schema(fresh)
    _check_schema(sample)
    assert len(sample) == 12 and {r["spec"] for r in sample} == set(L.SPECS)
    assert {r["depth"] for r in fresh} >= {0, 2, 3, 4, 9}
    assert {r["source"] for r in fresh} == set(L.SOURCES)


def test_validator_is_backwards_compatible(fresh):
    toy = ROOT / "data" / "sample_rows.jsonl"
    if toy.exists():
        for line in toy.read_text(encoding="utf-8").splitlines():
            datagen.validate_row(json.loads(line))
    diag = next(r for r in fresh if r["spec"] == "lab:diag")
    for bad in ({k: v for k, v in diag.items() if k != "dp_choice"}, {**diag, "dp_choice": 6},
                {**diag, "value": diag["value"][:5]}, {**diag, "hidden": "x"}, {**diag, "theta": 1}):
        with pytest.raises(ValueError):
            datagen.validate_row(bad)


def test_design_reward_works_unchanged(fresh, sample):
    for r in fresh + sample:
        eig = np.maximum(np.array(r["eig"]), 0)
        for c, e in zip(r["candidates"], eig):
            got = datagen.design_reward(r, f"I pick this one. <observe>{json.dumps(c)}</observe>")
            assert got == pytest.approx(e / eig.max(), abs=1e-12)
        best = r["candidates"][int(np.argmax(eig))]
        assert datagen.design_reward(r, f"<observe>{json.dumps(best)}</observe>") == 1.0
        assert datagen.design_reward(r, "<observe>[123456]</observe>") == 0.0
        assert datagen.design_reward(r, "no tag") == 0.0
        assert L.chance(r) == pytest.approx(np.mean(eig / eig.max()))


def test_prompt_follows_the_toy_layout(fresh, sample):
    for r in fresh + sample:
        system, last = r["prompt"][0]["content"], r["prompt"][-1]["content"]
        parts = system.split("\n\n")
        assert len(parts) == 5 and parts[0] == L.INTRO
        assert "Design an experiment by choosing [" in parts[1]
        assert parts[2].startswith("Exact generative model: ")
        assert parts[3].startswith("You may ")
        assert "Choose each one to learn as much as possible; you will then be asked" in parts[3]
        assert parts[4].startswith("To run an experiment, reply with your reasoning followed by "
                                   "exactly one tag, e.g. <observe>[")
        assert "To stop experimenting early, reply <done/>.\nIn the " in parts[4]
        assert r["prompt"][1]["content"].startswith(L.BEGIN)
        tail = ("Choose your next experiment from these candidate designs, picking the one you "
                "expect to be most informative:\n"
                + "\n".join(f"{i + 1}: {json.dumps(c)}" for i, c in enumerate(r["candidates"]))
                + "\nReply with exactly one tag, <observe>[design]</observe>.")
        assert last.endswith("\n" + tail)
        for m in r["prompt"][2:-1:2]:
            assert re.fullmatch(r"<observe>\[.*\]</observe>", m["content"])
        for m in r["prompt"][3::2]:
            assert m["content"].startswith("Result: ")


def test_candidates_message_is_the_toy_one():
    c = np.array([[2.741], [17.76], [13.8], [19.82], [18.93], [900.0]])
    assert L.candidates_message([datagen.fmt_design(x) for x in c]) == datagen.candidates_message(c)


def test_chem_labels_reproducible_from_the_row(fresh, sample):
    rows = [r for r in fresh + sample if r["spec"] == "lab:chem"]
    assert len(rows) >= 12
    for r in rows:
        # parse the prompt here, independently of lab_rows.parse_history
        xs = [json.loads(re.fullmatch(r"<observe>(.*)</observe>", m["content"]).group(1))
              for m in r["prompt"] if m["role"] == "assistant"]
        res = [re.match(r"Result: (\S+)\. Experiments remaining: (\d+)\.", m["content"])
               for m in r["prompt"][3::2]]
        ys = [float(m.group(1)) for m in res]
        assert len(xs) == len(ys) == r["depth"]
        assert [int(m.group(2)) for m in res] == [CH.BUDGET - k - 1 for k in range(r["depth"])]
        for x in xs + r["candidates"]:
            CH.validate(x)                                           # inside the lab's bounds
        p = CH.posterior(xs, ys)
        eig = CH.eig(p, np.array(r["candidates"], float), index=r["depth"])
        assert np.allclose(eig, r["eig"], atol=1e-5)
        assert np.allclose(L.chem_labels(r), r["eig"], atol=1e-5)


def test_chem_eig_matches_monte_carlo():
    """The quadrature labels against a plain Monte Carlo estimate of the same quantity."""
    r = L.chem_row(L.SEED_BASE["chem"], "reference", 3)
    p, i = L.chem_state(r)
    x = np.array(r["candidates"], float)
    rng = np.random.default_rng(0)
    n = 40_000
    h = rng.choice(CH.K, size=n, p=p)
    mu = CH.mean_yield(x, i)                                          # (K, C)
    y = mu[h] + CH.SIGMA * rng.standard_normal((n, len(x)))           # (n, C)
    w = p[:, None, None] * np.exp(-0.5 * ((y[None] - mu[:, None, :]) / CH.SIGMA) ** 2)
    post = w / w.sum(0)                                               # (K, n, C)

    def ent(q):
        return -np.where(q > 0, q * np.log(np.where(q > 0, q, 1.0)), 0.0).sum(0)
    mc = ent(p) - ent(post).mean(0)
    assert np.allclose(mc, r["eig"], atol=0.01)


@pytest.fixture(scope="module")
def diag_ctx():
    return L.context("diag")


def test_diag_planner_is_the_exact_dp(diag_ctx):
    table, _, planner = diag_ctx
    assert planner.value == pytest.approx(D.exact_dp(table).value, abs=1e-12)
    q, stop = planner.q_values(())
    assert max(q.values()) == pytest.approx(planner.value, abs=1e-12)
    assert stop == pytest.approx(0.0, abs=1e-9)
    # Q of a test = sum over its outcomes of P(outcome) * value of the next state
    obs = ((1, 1),)
    q, _ = planner.q_values(obs)
    w = D.joint_weights(table, obs)
    for t in (0, 5, 9):
        v = 0.0
        for o in range(table.lik[t].shape[2]):
            po = float((w * table.lik[t][:, :, o]).sum() / w.sum())
            q2, stop2 = planner.q_values(obs + ((t, o),))
            v += po * max([stop2] + list(q2.values()))
        assert q[t] == pytest.approx(v, abs=1e-10)


def test_diag_labels(fresh, sample, diag_ctx):
    table, _, planner = diag_ctx
    rows = [r for r in fresh + sample if r["spec"] == "lab:diag"]
    assert any(r["greedy_choice"] != r["dp_choice"] for r in rows)
    for r in rows:
        lab = L.diag_labels(table, planner, r)
        assert np.allclose(lab["eig"], r["eig"], atol=1e-5)
        assert np.allclose(lab["value"], r["value"], atol=1e-5)
        assert (lab["greedy_choice"], lab["dp_choice"]) == (r["greedy_choice"], r["dp_choice"])
        assert r["greedy_choice"] == int(np.argmax(r["eig"]))
        assert r["value"][r["dp_choice"]] >= max(r["value"]) - 1e-5
        # the best test for one-step gain and the best test for planning are both candidates
        obs = L.diag_obs(table, r)
        w = D.joint_weights(table, obs)
        used = {t for t, _ in obs}
        left = table.budget - sum(table.costs[t] for t in used)
        aff = D.affordable(table, obs, left)
        assert max(r["eig"]) == pytest.approx(max(D.info_gain(table, w, t) for t in aff), abs=1e-5)
        assert max(r["value"]) == pytest.approx(max(planner.q_values(obs)[0].values()), abs=1e-5)
        # candidates are unused tests that fit in the remaining budget
        assert all(c - 1 in aff for (c,) in r["candidates"])
        if r["depth"]:
            assert f"Budget remaining: {left:g}." in r["prompt"][-1]["content"]


def test_diag_prompt_states_the_whole_table(diag_ctx):
    """Every probability vector of the table is printed on the line of its test."""
    table, spec, _ = diag_ctx
    text = L.diag_system(table, spec)
    for c, p in zip(table.causes, table.prior):
        assert f"- {c} (prior {p:g})" in text
    for k, name in enumerate(table.tests):
        head = f"{k + 1}. {name} (cost {table.costs[k]:g})"
        line = next(x for x in text.split("\n") if x.startswith(head))
        vecs = {tuple(np.round(json.loads(v), 6)) for v in re.findall(r"\[[0-9., ]+\]", line)}
        want = {tuple(np.round(v, 6)) for v in table.lik[k].reshape(-1, table.lik[k].shape[2])}
        assert want <= vecs


def test_dag_labels_reproducible_from_the_row(fresh, sample):
    cfg = DN.DEFAULT
    rows = [r for r in fresh + sample if r["spec"] == "lab:dag"]
    menu = [L.dag_design(a) for a in DN.action_menu(cfg)]
    assert len(rows) >= 4
    for r in rows:
        assert all(c in menu for c in r["candidates"])
        assert np.allclose(L.dag_labels(cfg, r), r["eig"], atol=1e-5)
        full = L.dag_belief(cfg, r).eig("joint")
        assert max(r["eig"]) == pytest.approx(full.max(), abs=1e-5)   # the best action is a candidate


def test_wetlab_rows(sample):
    """Wet-lab labels are simulation-based estimates (not recomputed here); the designs are valid
    runs that the printed stock can pay for."""
    from bayesenv import wetlab as W
    rows = [r for r in sample if r["spec"] == "lab:wetlab"]
    assert len(rows) == 3
    for r in rows:
        designs, results = L.parse_history(r)
        stock = dict(W.STOCK)
        for d, res in zip(designs, results):
            a = L.wet_action(d)
            assert W.affordable(a, stock) and len(json.loads(res)) == 3
            for k, v in W.cost(a).items():
                stock[k] -= v
        if r["depth"]:
            assert f"Stock remaining: {L._wet_stock(stock)}." in r["prompt"][-1]["content"]
        for c in r["candidates"]:
            assert W.affordable(L.wet_action(c), stock) and L.wet_design(L.wet_action(c)) == c


def test_no_hidden_truth_in_rows(fresh, sample):
    for r in fresh + sample:
        assert set(r) <= ROW_KEYS | DIAG_KEYS
        assert not set(r) & {"theta", "hidden", "hidden_nuisance", "truth", "parents", "mechanism"}
    # the hidden draw is salted, so it is not the public unsalted episode of the same seed
    a, b = CH.ChemLab(), CH.ChemLab()
    a.reset(L.SEED_BASE["chem"] + 1, L.SALT)
    b.reset(L.SEED_BASE["chem"] + 1, None)
    assert not np.allclose(a._z, b._z)


def test_generation_is_deterministic():
    a = L.generate_cell("chem", "random", 2, 2)
    b = L.generate_cell("chem", "random", 2, 2)
    assert a == b and a[0]["seed"] != a[1]["seed"]
