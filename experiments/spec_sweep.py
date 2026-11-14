"""Reference sweep over the spec families (CPU only, local multiprocessing; no Modal).

    uv run --no-project --with numpy --with scipy --with pyyaml \
        python experiments/spec_sweep.py --seeds-gaussian 64 --seeds-bernoulli 200 --procs 8

For every family and paired seed s it runs, on the randomised instance `spec:NAME#s`:
  reference      EIG-greedy over 256 candidates + posterior predictive (policies.bayes_oracle)
  reference_c64  the same with 64 candidates (what scripts/gen_training_data.py uses)
  random_design  random experiments + posterior predictive
  stop_early     one EIG-greedy experiment
  do_nothing     prior predictive (0 by construction)
and, for the reference run, particle-posterior diagnostics:
  min_ess     smallest effective sample size seen before a rejuvenation (of 20,000 particles)
  min_unique  smallest fraction of distinct particles after a rejuvenation
  is_raw      score of an INDEPENDENT 200,000-particle importance-sampling posterior on the
              same data (no resampling, no MCMC); is_ess is its effective sample size
Writes results/spec_sweep.jsonl (one row per episode) and results/spec_sweep_summary.json.
"""

from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import argparse  # noqa: E402
import json  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from multiprocessing import Pool  # noqa: E402
from pathlib import Path  # noqa: E402

import numpy as np  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bayesenv.bayes import Posterior  # noqa: E402
from bayesenv.policies import POLICIES  # noqa: E402
from bayesenv.spec import resolve, spec_names  # noqa: E402
from bayesenv.task import Task, bayes_reward  # noqa: E402

N_PARTICLES = 20_000
N_IS = 200_000
POLICY_ORDER = ["reference", "reference_c64", "random_design", "stop_early", "do_nothing"]


class Tracked(Posterior):
    """Posterior that records how badly the weights collapsed before each rejuvenation."""

    min_ess = float(N_PARTICLES)
    min_unique = 1.0
    n_rejuv = 0

    def _rejuvenate(self, steps: int = 8) -> None:
        self.min_ess = min(self.min_ess, self.ess())
        super()._rejuvenate(steps)
        self.n_rejuv += 1
        self.min_unique = min(self.min_unique, len(np.unique(self.theta, axis=0)) / len(self.theta))


def _reference(task: Task, n_candidates: int):
    ep = task.episode()
    post = Tracked(task.env, np.random.default_rng([task.seed, 1]), n=N_PARTICLES)
    while ep.remaining:
        x = post.best_design(n_candidates)
        post.update(x, ep.observe(x))
    return ep, post, post.predictive(ep.finish())


def run_seed(job: tuple[str, int]) -> list[dict]:
    spec, seed = job
    task = Task(f"spec:{spec}#{seed}", seed)
    env = task.env
    rows = []

    def row(policy, pred, t0, **extra):
        rows.append({"spec": spec, "family": env.family, "seed": seed, "policy": policy,
                     **bayes_reward(task, pred), "secs": round(time.time() - t0, 2), **extra})

    t0 = time.time()
    ep, post, pred = _reference(task, 256)  # identical to policies.bayes_oracle
    xs, ys = ep.data()
    big = Posterior(env, np.random.default_rng([seed, 0x15]), n=N_IS)
    big.logw = env.loglik(ys, xs, big.theta).sum(1)
    row("reference", pred, t0, min_ess=round(post.min_ess, 1), min_unique=round(post.min_unique, 4),
        n_rejuv=post.n_rejuv, final_ess=round(post.ess(), 1), is_ess=round(big.ess(), 1),
        is_raw=bayes_reward(task, big.predictive(task.eval_x))["bayes_raw"])
    t0 = time.time()
    row("reference_c64", _reference(task, 64)[2], t0)
    for name in ("random_design", "stop_early", "do_nothing"):
        t0 = time.time()
        row(name, POLICIES[name](task.episode()), t0)
    return rows


def boot_ci(d: np.ndarray, rng: np.random.Generator, reps: int = 10_000) -> list[float]:
    m = d[rng.integers(0, len(d), (reps, len(d)))].mean(1)
    return [round(float(np.percentile(m, 2.5)), 4), round(float(np.percentile(m, 97.5)), 4)]


def summarise(rows: list[dict]) -> dict:
    out = {}
    rng = np.random.default_rng(0)
    for spec in sorted({r["spec"] for r in rows}):
        rs = [r for r in rows if r["spec"] == spec]
        seeds = sorted({r["seed"] for r in rs})
        by = {p: {r["seed"]: r for r in rs if r["policy"] == p} for p in POLICY_ORDER}
        col = lambda p, k: np.array([by[p][s][k] for s in seeds])
        ref = [by["reference"][s] for s in seeds]
        s = {"family": rs[0]["family"], "n": len(seeds), "budget": resolve(f"spec:{spec}").budget}
        for p in POLICY_ORDER:
            s[p] = round(float(col(p, "bayes_reward").mean()), 4)
            s[p + "_raw"] = round(float(col(p, "bayes_raw").mean()), 4)
        d = col("reference", "bayes_reward") - col("random_design", "bayes_reward")
        s["ref_minus_random"] = round(float(d.mean()), 4)
        s["ref_minus_random_ci95"] = boot_ci(d, rng)
        d64 = col("reference_c64", "bayes_reward") - col("reference", "bayes_reward")
        s["c64_minus_reference"] = round(float(d64.mean()), 4)
        s["c64_minus_reference_ci95"] = boot_ci(d64, rng)
        # particle-posterior diagnostics (reference runs)
        min_ess = np.array([r["min_ess"] for r in ref])
        is_ok = np.array([r["is_ess"] >= 200 for r in ref])
        gap = np.array([r["is_raw"] - r["bayes_raw"] for r in ref])
        s["diag"] = {
            "median_min_ess": round(float(np.median(min_ess)), 1),
            "frac_min_ess_below_50": round(float((min_ess < 50).mean()), 3),
            "median_min_unique": round(float(np.median([r["min_unique"] for r in ref])), 3),
            "mean_rejuvenations": round(float(np.mean([r["n_rejuv"] for r in ref])), 2),
            "median_is_ess": round(float(np.median([r["is_ess"] for r in ref])), 1),
            "frac_is_check_valid": round(float(is_ok.mean()), 3),
            # > 0 means an independent, larger posterior on the SAME data predicts better.
            "mean_is_minus_ref_raw": round(float(gap[is_ok].mean()), 4) if is_ok.any() else None,
            "p95_abs_is_minus_ref_raw": round(float(np.percentile(np.abs(gap[is_ok]), 95)), 4) if is_ok.any() else None,
        }
        flags = []
        if s["reference"] < 0.8:
            flags.append("reference_below_0.8")
        if s["ref_minus_random_ci95"][0] <= 0 or s["ref_minus_random"] < 0.05:
            flags.append("no_design_headroom")
        g = s["diag"]["mean_is_minus_ref_raw"]
        if s["diag"]["frac_min_ess_below_50"] > 0.1 or (g is not None and abs(g) > 0.02):
            flags.append("particle_degeneracy")
        s["flags"] = flags
        out[spec] = s
    return out


def table(summary: dict) -> str:
    lines = ["| family | lik. | budget | n | reference | ref. c64 | random | stop-early | do-nothing | ref - random [95% CI] | flags |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    for spec, s in summary.items():
        lo, hi = s["ref_minus_random_ci95"]
        lines.append(f"| {spec} | {s['family'][:5]} | {s['budget']} | {s['n']} | {s['reference']:.3f} | {s['reference_c64']:.3f} | "
                     f"{s['random_design']:.3f} | {s['stop_early']:.3f} | {s['do_nothing']:.3f} | "
                     f"{s['ref_minus_random']:+.3f} [{lo:+.3f}, {hi:+.3f}] | {', '.join(s['flags']) or '-'} |")
    return "\n".join(lines)


def main(a) -> None:
    specs = a.specs.split(",") if a.specs else spec_names()
    jobs = []
    for spec in specs:
        n = a.seeds_bernoulli if resolve(f"spec:{spec}").family == "bernoulli" else a.seeds_gaussian
        jobs += [(spec, s) for s in range(a.seed0, a.seed0 + n)]
    jobs.sort(key=lambda j: j[1])  # interleave families so progress is even
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    t0, rows = time.time(), []
    with Pool(a.procs) as pool, out.open("w") as f:
        for i, rs in enumerate(pool.imap_unordered(run_seed, jobs, chunksize=2)):
            rows += rs
            for r in rs:
                f.write(json.dumps(r) + "\n")
            if (i + 1) % 100 == 0:
                print(f"{i + 1}/{len(jobs)} seeds, {time.time() - t0:.0f}s", flush=True)
    summary = summarise(rows)
    meta = {"wall_seconds": round(time.time() - t0, 1), "procs": a.procs, "episodes": len(rows),
            "cpu_seconds": round(sum(r["secs"] for r in rows), 1), "n_particles": N_PARTICLES, "n_is": N_IS}
    Path(a.summary).write_text(json.dumps({"meta": meta, "families": summary}, indent=1))
    print(table(summary))
    print(meta)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--specs", default="")
    p.add_argument("--seeds-gaussian", type=int, default=64)
    p.add_argument("--seeds-bernoulli", type=int, default=200)
    p.add_argument("--seed0", type=int, default=0)
    p.add_argument("--procs", type=int, default=8)
    p.add_argument("--out", default="results/spec_sweep.jsonl")
    p.add_argument("--summary", default="results/spec_sweep_summary.json")
    main(p.parse_args())
