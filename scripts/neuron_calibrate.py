"""Play the NeuronBench reference solver in-process against the lab (no Docker, no MCP).

    uv run --no-project --with numpy python scripts/neuron_calibrate.py \
        --src <neuronbench checkout at the pinned commit> --worlds z_rebound,ca_rebound

Per world it prints the score of: the reference solver (bayesenv.neuron_ref), the no-experiment
forecast (0 by construction), and the "public source" attack: forecasting with the family's
PUBLIC nominal mechanism from neuronbench.worlds.WORLDS, which an agent that fetches the
repository and guesses the family from the test protocols could do without any experiment.
One world takes a few minutes on one laptop core (the benchmark's simulator is the cost).
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def nominal_candidate(R, spec):
    alt = spec["alt"]
    d = dict(R.PLAIN, slow_na=float(alt["slow_na"]))
    for c in alt["extra"]:
        d.update(g=c.g, E=c.E, mvh=c.mvh, mk=c.mk, mtau=c.mtau, mpow=c.mpow,
                 has_h=float(c.hvh is not None), hvh=-80.0 if c.hvh is None else c.hvh,
                 hk=c.hk, htau=c.htau, hpow=c.hpow)
    return d


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--src", required=True, help="neuronbench checkout (pinned commit)")
    p.add_argument("--worlds", default="z_rebound")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--salt", default="calibration")
    p.add_argument("--per-family", type=int, default=40)
    p.add_argument("--particles", type=int, default=6)
    p.add_argument("--out", default="")
    a = p.parse_args()
    sys.path.insert(0, a.src)
    import neuronbench as nb
    from bayesenv import neuron as N
    from bayesenv import neuron_ref as R

    for world in a.worlds.split(","):
        t0 = time.time()
        lab = N.NeuronLab()
        rules = lab.reset(a.seed, a.salt, family=world)
        ref = R.Reference(rules, seed=a.seed, per_family=a.per_family, particles=a.particles)
        for run in R.plan(rules):
            t = time.time()
            obs = lab.step(run)
            t_run = time.time() - t
            ref.update(run, obs)
            print(f"  {run['protocol'][:44]:44s} x{run['reps']} -> {obs['spike_count']:.1f} spikes "
                  f"(lab {t_run:.1f}s, fit {time.time() - t - t_run:.1f}s)", flush=True)
        forecast = ref.forecast()
        t_solve = time.time() - t0
        fam = {k: round(v, 3) for k, v in ref.family_posterior().items()}
        # the public-source attack, scored with the same metric and targets
        nominal = R.stack([nominal_candidate(R, nb.worlds.WORLDS[world])])
        rng = np.random.default_rng(5)
        attack = {t["label"]: float(R.simulate_batch(t["segments"], nominal, 100, N.N_CHANNELS, rng)["count"].mean())
                  for t in rules["test_protocols"]}
        lab.submit(forecast)
        t = time.time()
        g = lab.grade()
        mse_attack = nb.evaluator.forecast_mse(attack, lab.targets())
        ok = g["mse_prior"] >= N.MIN_PRIOR_MSE
        row = {"world": world, "seed": a.seed, "score_reference": g["score"], "mse_reference": g["mse_agent"],
               "mse_prior": g["mse_prior"], "mse_public_nominal": mse_attack,
               "score_public_nominal": float(min(1, max(0, 1 - mse_attack / g["mse_prior"]))) if ok else 0.0,
               "family_posterior": fam, "per_protocol": g["per_protocol"], "attack": attack,
               "solve_sec": round(t_solve, 1), "grade_sec": round(time.time() - t, 1)}
        print(json.dumps(row), flush=True)
        if a.out:
            with open(a.out, "a", encoding="utf-8") as f:
                f.write(json.dumps(row) + "\n")
        lab.close()


if __name__ == "__main__":
    main()
