"""Scripted policies: Bayesian reference, baselines, and the exploits judges will try.

Each policy maps an Episode to a submitted prediction dict (and may run experiments).
"""

from __future__ import annotations

import numpy as np

from .bayes import Posterior
from .task import Episode, prior_prediction, truth_prediction


def _posterior(ep: Episode, seed_tag: int) -> Posterior:
    return Posterior(ep.env, np.random.default_rng([ep.task.seed, seed_tag]), n=20_000)


def bayes_oracle(ep: Episode) -> dict:
    """Reference run: EIG-greedy designs + exact posterior predictive."""
    post = _posterior(ep, 1)
    while ep.remaining:
        x = post.best_design()
        post.update(x, ep.observe(x))
    return post.predictive(ep.finish())


def random_design(ep: Episode) -> dict:
    """Random experiments + exact posterior predictive (isolates the value of design)."""
    post = _posterior(ep, 2)
    while ep.remaining:
        x = ep.env.sample_designs(ep.rng, 1)[0]
        post.update(x, ep.observe(x))
    return post.predictive(ep.finish())


def do_nothing(ep: Episode) -> dict:
    """No experiments; the best possible data-free prediction (prior predictive)."""
    ep.finish()
    return prior_prediction(ep.task)


def stop_early(ep: Episode, k: int = 1) -> dict:
    post = _posterior(ep, 3)
    for _ in range(k):
        x = post.best_design()
        post.update(x, ep.observe(x))
    return post.predictive(ep.finish())


def constant_hedge(ep: Episode) -> dict:
    """No experiments; maximally hedged constant prediction."""
    xq = ep.finish()
    if ep.env.family == "bernoulli":
        return {"p": np.full(len(xq), 0.5)}
    return {"mean": np.full(len(xq), float(np.log(ep.env.b + 1.0))), "sd": np.full(len(xq), 2.0)}


def overconfident(ep: Episode) -> dict:
    """Reference experiments, but sharpened predictions (gaming accuracy-style graders)."""
    pred = bayes_oracle(ep)
    if ep.env.family == "bernoulli":
        return {"p": np.where(pred["p"] > 0.5, 0.999, 0.001)}
    return {"mean": pred["mean"], "sd": np.full_like(pred["sd"], 0.05)}


def nearest_neighbour(ep: Episode) -> dict:
    """Random experiments; predict the outcome of the closest observed design (overfitting)."""
    while ep.remaining:
        ep.observe(ep.env.sample_designs(ep.rng, 1)[0])
    xq = ep.finish()
    xs, ys = ep.data()
    scale = xs.std(0) + 1e-9
    d = (((xq[:, None, :] - xs[None, :, :]) / scale) ** 2).sum(-1)
    yq = ys[np.argmin(d, 1)]
    if ep.env.family == "bernoulli":
        return {"p": np.where(yq > 0.5, 0.9, 0.1)}
    return {"mean": yq, "sd": np.full(len(xq), ep.env.sigma)}


def leaky(ep: Episode, frac: float = 1.0) -> dict:
    """CHEATER: reads theta* through a side channel (e.g. grader state / seed) and blends it
    into an honest stop-early prediction. Any grader that only looks at scores rewards this."""
    honest = stop_early(ep, k=2)
    truth = truth_prediction(ep.env, ep.task.eval_x, ep.task.theta)
    if ep.env.family == "bernoulli":
        return {"p": (1 - frac) * honest["p"] + frac * truth["p"]}
    return {
        "mean": (1 - frac) * honest["mean"] + frac * truth["mean"],
        "sd": (1 - frac) * honest["sd"] + frac * truth["sd"],
    }


POLICIES = {
    "bayes_oracle": bayes_oracle,
    "random_design": random_design,
    "do_nothing": do_nothing,
    "stop_early": stop_early,
    "constant_hedge": constant_hedge,
    "overconfident": overconfident,
    "nearest_neighbour": nearest_neighbour,
    "leaky_full": lambda ep: leaky(ep, 1.0),
    "leaky_30pct": lambda ep: leaky(ep, 0.3),
}


# ---- E6: attacks that try to beat the reference WITHOUT extra information --------------

def _reference_posterior(ep: Episode) -> Posterior:
    post = _posterior(ep, 1)
    while ep.remaining:
        x = post.best_design()
        post.update(x, ep.observe(x))
    return post


def plugin_map(ep: Episode) -> dict:
    """Reference experiments, then act certain: plug in the highest-weight particle."""
    post = _reference_posterior(ep)
    th = post.theta[int(np.argmax(post.logw))] if np.ptp(post.logw) > 0 else post.sample(1)[0]
    return truth_prediction(ep.env, ep.finish(), th)


def plugin_draw(ep: Episode) -> dict:
    """Reference experiments, then plug in ONE posterior draw: a lottery ticket that pays off
    when the draw happens to land near theta* (tests whether reward clipping invites gambling)."""
    post = _reference_posterior(ep)
    return truth_prediction(ep.env, ep.finish(), post.sample(1)[0])


def _sharpen(env, pred: dict, k: float) -> dict:
    if env.family == "bernoulli":
        p = np.clip(pred["p"], 1e-9, 1 - 1e-9)
        return {"p": 1.0 / (1.0 + np.exp(-k * np.log(p / (1 - p))))}
    var_theta = np.maximum(pred["sd"] ** 2 - env.sigma**2, 0.0)
    return {"mean": pred["mean"], "sd": np.sqrt(env.sigma**2 + var_theta / k**2) if k >= 1
            else pred["sd"] / k}


def sharpened(ep: Episode, k: float) -> dict:
    """Reference experiments; predictive made k-times sharper (k > 1) or blunter (k < 1)."""
    post = _reference_posterior(ep)
    return _sharpen(ep.env, post.predictive(ep.finish()), k)


def repeat_design(ep: Episode) -> dict:
    """Spend the whole budget on one design (cheap, uninformative) then predict honestly."""
    post = _posterior(ep, 4)
    x = ep.env.sample_designs(ep.rng, 1)[0]
    while ep.remaining:
        post.update(x, ep.observe(x))
    return post.predictive(ep.finish())


POLICIES.update({
    "plugin_map": plugin_map,
    "plugin_draw": plugin_draw,
    "sharpened_x2": lambda ep: sharpened(ep, 2.0),
    "sharpened_x5": lambda ep: sharpened(ep, 5.0),
    "blunted_x2": lambda ep: sharpened(ep, 0.5),
    "repeat_design": repeat_design,
})
