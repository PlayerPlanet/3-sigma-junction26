"""Declarative task specs: safe expressions, determinism, equivalence, reward sanity, row schema."""

import copy
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bayesenv import datagen  # noqa: E402
from bayesenv.envs import ENVS  # noqa: E402
from bayesenv.llm_agent import parse_predictions  # noqa: E402
from bayesenv.policies import bayes_oracle, do_nothing, random_design  # noqa: E402
from bayesenv.spec import Spec, SpecError, compile_expr, load_spec, resolve, spec_names  # noqa: E402
from bayesenv.task import Task, bayes_reward  # noqa: E402


# ---- safe expressions -----------------------------------------------------------------

@pytest.mark.parametrize("src", [
    "x.__class__",                         # attribute access
    "x.real",
    "np.exp(x)",                           # attribute call / unknown module
    "__import__('os').system('echo hi')",  # call outside the whitelist
    "open('secrets')",
    "eval('1')",
    "getattr(x, 'shape')",
    "foo + 1",                             # unknown name
    "__builtins__",
    "x[0]",                                # subscript
    "[x, a]",
    "lambda: 1",
    "x if a else 1",
    "(x := 2)",
    "'text'",                              # non-numeric constant
    "True",
    "exp(x, 2)",                           # wrong arity
    "exp(x=1)",                            # keyword argument
    "exp(*x)",
    "x and a",
    "x == a",                              # only ordering comparisons
    "1 < x < 2",
    "x // 2",
    "x; a",
    "",
    "x +" + " 1 +" * 300 + " 1",           # too long
])
def test_unsafe_or_invalid_expressions_are_rejected(src):
    with pytest.raises(SpecError):
        compile_expr(src, ["x", "a"])


def test_safe_expression_matches_numpy():
    x, a = np.linspace(0.1, 3, 7)[None, :], np.array([0.5, 2.0])[:, None]
    f = compile_expr("where(x < 1, exp(-a * x), maximum(x, 2) ** 2 / pi) + Phi(a) - sigmoid(x) + abs(-x) % 1"
                     .replace(" % 1", ""), ["x", "a"])
    from scipy.special import expit, ndtr
    want = np.where(x < 1, np.exp(-a * x), np.maximum(x, 2) ** 2 / np.pi) + ndtr(a) - expit(x) + np.abs(-x)
    assert np.allclose(f({"x": x, "a": a}), want)
    assert f({"x": x, "a": a}).shape == (2, 7)


def test_huge_powers_do_not_build_big_integers():
    assert np.isinf(compile_expr("9 ** 9 ** 9", [])({}))


# ---- spec validation ------------------------------------------------------------------

def _dose() -> dict:
    return copy.deepcopy(load_spec(ROOT / "specs/dose_response.yaml").d)


@pytest.mark.parametrize("mutate, msg", [
    (lambda d: d["params"]["ec50"].update(prior="cauchy"), "prior"),
    (lambda d: d["params"]["ec50"].update(low=-1), "low > 0"),
    (lambda d: d["model"].update(p="2 * dose"), "leaves"),
    (lambda d: d["model"].update(p="ec50.real"), "disallowed"),
    (lambda d: d["model"].update(p="1 / (1 + ec5 / dose)"), "unknown name"),
    (lambda d: d.update(model={"mean": "dose"}), "exactly the key"),
    (lambda d: d.update(extra=1), "unknown top-level"),
    (lambda d: d["design"]["dose"].update(low=0), "log scale"),
    (lambda d: d["randomize"]["priors"].update({"ec50.nope": [1, 2]}), "randomize.priors"),
    (lambda d: d["randomize"]["priors"].update({"ec50.high": [0.01, 300]}), "low < high"),
    (lambda d: d["text"].update(story="{nobody} appears"), "placeholder"),
    (lambda d: d["text"]["names"].update(dose=["exp"]), "identifiers"),
    (lambda d: d.update(noise={"sd": 1}), "gaussian"),
])
def test_invalid_specs_give_clear_errors(mutate, msg):
    d = _dose()
    mutate(d)
    with pytest.raises(SpecError, match=msg):
        Spec(d)


def test_all_shipped_specs_load_and_are_vectorised():
    assert len(spec_names()) >= 8
    rng = np.random.default_rng(0)
    for name in spec_names():
        for env in (resolve(f"spec:{name}"), resolve(f"spec:{name}#3")):
            th, x = env.sample_prior(rng, 11), env.sample_designs(rng, 5)
            assert th.shape == (11, env.dim) and x.shape == (5, env.design_dim)
            assert np.all(np.isfinite(env.log_prior(th)))
            f = env.prob if env.family == "bernoulli" else env.mean
            assert f(x, th).shape == (11, 5)
            y = env.simulate(x, th[0], rng)
            assert env.loglik(y, x, th).shape == (11, 5) and np.all(np.isfinite(env.loglik(y, x, th)))
            for xi in x:
                assert np.array_equal(env.validate(xi), xi)
            with pytest.raises(ValueError):
                env.validate(env.xhigh * 2 + 1)
            assert "{" not in env.describe() + env.model_card()


# ---- instance identity ----------------------------------------------------------------

def test_instances_are_deterministic_and_distinct():
    a = resolve("spec:dose_response#7")
    resolve.cache_clear()
    b = resolve("spec:dose_response#7")
    assert a is not b
    assert a.name == b.name and a.priors == b.priors and a.model_card() == b.model_card()
    assert a.describe() == b.describe()
    cards = {resolve(f"spec:dose_response#{k}").model_card() for k in range(8)}
    assert len(cards) == 8
    assert resolve("spec:dose_response").priors[0]["high"] == 100  # base instance: file values
    t1, t2 = Task("spec:dose_response#7", 5), Task(a.name, 5)      # short and hash-pinned names
    assert np.array_equal(t1.theta, t2.theta) and np.array_equal(t1.eval_x, t2.eval_x)
    assert not np.array_equal(t1.theta, Task("spec:dose_response#7", 6).theta)
    assert not np.array_equal(t1.theta, Task("spec:dose_response#7", 5, salt="s").theta)


def test_stale_hash_and_bad_names_fail_loudly():
    with pytest.raises(KeyError, match="hash"):
        resolve("spec:dose_response@000000000000#1")
    for bad in ("spec:../secrets", "spec:nope", "spec:dose_response#x", "nope"):
        with pytest.raises(KeyError):
            Task(bad, 0)


def test_hand_written_tasks_are_unchanged():
    t = Task("hyperbolic", 3)
    assert (t.budget, t.n_eval, t.env) == (10, 30, ENVS["hyperbolic"])
    assert Task("hyperbolic", 3, 4).budget == 4
    assert Task("spec:hyperbolic", 3).budget == 10


def test_unit_rescaling_is_consistent():
    base = resolve("spec:dose_response")
    inst = next(e for e in (resolve(f"spec:dose_response#{k}") for k in range(40)) if e.unit["dose"][0] == "ug")
    rng = np.random.default_rng(1)
    th, x = inst.sample_prior(rng, 9), inst.sample_designs(rng, 6)
    assert x.max() > 1000 and "ug" in inst.describe() and "/ 1000)" in inst.model_card()
    assert np.allclose(inst.prob(x, th), base.prob(x / 1000.0, th))
    osc = next(e for e in (resolve(f"spec:damped_oscillation#{k}") for k in range(40)) if e.unit["y"][0] == "mm")
    th, x = osc.sample_prior(rng, 9), osc.sample_designs(rng, 6)
    ns = osc.natural(th)
    want = 10 * ns["amp"][:, None] * np.exp(-ns["decay"][:, None] * x[None, :, 0]) * np.cos(ns["omega"][:, None] * x[None, :, 0])
    assert np.allclose(osc.mean(x, th), want) and np.isclose(osc.sigma, 10 * osc.sigma / osc.yfactor)


# ---- spec vs hand-written -------------------------------------------------------------

def test_hyperbolic_spec_matches_hand_written_env():
    hand, spec = ENVS["hyperbolic"], resolve("spec:hyperbolic")
    rng = np.random.default_rng(0)
    th, x = hand.sample_prior(rng, 500), hand.sample_designs(rng, 40)
    assert np.allclose(spec.prob(x, th), hand.prob(x, th), rtol=1e-12, atol=1e-14)
    y = (rng.random(40) < 0.5).astype(float)
    assert np.allclose(spec.loglik(y, x, th), hand.loglik(y, x, th), rtol=1e-10, atol=1e-12)
    # same prior: identical draws from the same RNG stream, and the same log density up to a constant
    assert np.allclose(spec.sample_prior(np.random.default_rng(5), 100), hand.sample_prior(np.random.default_rng(5), 100))
    from bayesenv.bayes import log_prior
    lp_hand = -0.5 * ((th[:, 0] + 4.25) / 0.5) ** 2 - 0.5 * (th[:, 1] / 2.0) ** 2
    assert np.allclose(log_prior(spec, th), lp_hand)
    for xi in spec.sample_designs(rng, 50):
        hand.validate(xi)  # every spec design is a legal hand-written design


def test_location_spec_matches_hand_written_env():
    hand, spec = ENVS["location"], resolve("spec:location")
    rng = np.random.default_rng(0)
    th, x = hand.sample_prior(rng, 300), spec.sample_designs(rng, 40)
    assert np.allclose(spec.mean(x, th), hand.mean(x, th), rtol=1e-12)
    y = rng.normal(0, 1, 40)
    assert np.allclose(spec.loglik(y, x, th), hand.loglik(y, x, th), rtol=1e-12)
    assert spec.sigma == hand.sigma


# ---- reward sanity --------------------------------------------------------------------

def test_prior_scores_zero_and_reference_beats_random():
    ref, rnd = [], []
    for seed in range(6):
        name = f"spec:hyperbolic#{seed}"
        t = Task(name, seed)
        assert bayes_reward(t, do_nothing(t.episode()))["bayes_raw"] == 0.0
        ref.append(bayes_reward(t, bayes_oracle(t.episode()))["bayes_reward"])
        rnd.append(bayes_reward(t, random_design(t.episode()))["bayes_reward"])
    assert np.mean(ref) > 0.8
    assert np.mean(ref) > np.mean(rnd) + 0.1


def test_prior_scores_zero_gaussian():
    t = Task("spec:exp_decay#2", 2)
    assert bayes_reward(t, do_nothing(t.episode()))["bayes_raw"] == 0.0


# ---- training rows --------------------------------------------------------------------

@pytest.fixture(scope="module")
def rows():
    return datagen.instance_rows(resolve("spec:psychometric#9").name, 9000,
                                 heldout_families=("item_response",), ref_candidates=16)


def test_rows_follow_the_schema(rows):
    for r in rows:
        datagen.validate_row(r)
        json.dumps(r)
        assert r["spec"] == "psychometric" and r["instance"] == 9 and r["split"] == "heldout_instance"
        assert "theta" not in json.dumps(r)
        assert resolve(r["env"]).model_card() in r["prompt"][0]["content"]  # full-information prompt
    kinds = [(r["kind"], r.get("of")) for r in rows]
    assert kinds.count(("design", None)) == 4 and kinds.count(("demo", "design")) == 4
    assert kinds.count(("predict", None)) == 2 and kinds.count(("demo", "predict")) == 2
    assert {r["source"] for r in rows} == {"reference", "random"}
    assert datagen.split_of("item_response", 0, ("item_response",)) == "heldout_family"
    assert datagen.split_of("psychometric", 0, ("item_response",)) == "train"
    bad = dict(rows[0], theta=[1.0])
    with pytest.raises(ValueError):
        datagen.validate_row(bad)


def test_rows_carry_enough_to_recompute_rewards(rows):
    demos = {(r["source"], r["depth"], r["of"]): r["completion"] for r in rows if r["kind"] == "demo"}
    for r in rows:
        if r["kind"] == "design":
            comp = demos[(r["source"], r["depth"], "design")]
            assert datagen.design_reward(r, comp) == 1.0
            worst = r["candidates"][int(np.argmin(r["eig"]))]
            assert datagen.design_reward(r, f"<observe>{json.dumps(worst)}</observe>") < 1.0
            assert datagen.design_reward(r, "<observe>[123456]</observe>") == 0.0
            assert datagen.design_reward(r, "no tag") == 0.0
            assert len(r["prompt"]) == 2 + 2 * r["depth"]
        if r["kind"] == "predict":
            comp = demos[(r["source"], r["depth"], "predict")]
            task = Task(r["env"], r["seed"])  # exactly what train/grpo_predict.py does
            assert parse_predictions(task.env, comp, task.n_eval) is not None
            assert datagen.predict_reward(r, comp) == pytest.approx(min(1.0, r["reference_bayes_raw"]), abs=1e-3)
            assert datagen.predict_reward(r, "garbage") == -1.0
            assert json.dumps(datagen.fmt_design(task.eval_x[0])) in r["prompt"][-1]["content"]


def test_rows_are_deterministic(rows):
    again = datagen.instance_rows(rows[0]["env"], 9000, heldout_families=("item_response",), ref_candidates=16)
    assert json.dumps(again) == json.dumps(rows)


def test_committed_sample_rows_validate():
    path = ROOT / "data/sample_rows.jsonl"
    if not path.exists():
        pytest.skip("no sample file")
    sample = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines()]
    assert sample
    for r in sample:
        datagen.validate_row(r)
