# Held-out D: Wetlab (stochastic kinetics, mechanism identification)

A second chemistry environment, built because the Virtual Chemistry Lab (`docs/CHEM_LAB.md`)
is solved by coding agents: with 7 discrete hypotheses, a closed-form Gaussian likelihood and
no nuisance parameters, an agent with a Python shell writes the exact Bayes update and matches
the reference. Here the hidden state is a reaction **mechanism plus continuous rate constants**,
the data are **time courses of a stochastic jump process at low molecule counts**, and runs
draw on a **finite stock**, so there is no closed-form posterior and a real cost trade-off.

Files: `bayesenv/wetlab.py` (engine, lab, inference, policies), `bayesenv/wetlab_reward.py`,
`bayesenv/wetlab_baselines.py` ("competent coder" proxies), `scripts/wetlab_calibrate.py`,
`experiments/wetlab_modal.py`, `tests/test_wetlab.py`, `templates/wetlab_task/`,
`scripts/make_wetlab_tasks.py`, `tasks/wetlab/wetlab-0..4`.

## Engine: our own Gillespie implementation

`wetlab.simulate(x0, rates, times, uniform, xp=np)` is our own implementation of the Gillespie
direct method (exact stochastic simulation algorithm), **batched**: one call advances many
independent vessels, each with its own mechanism, rate constants, initial counts and read-out
times, vectorised over the batch with finished vessels compacted away. About 0.04 ms per
trajectory in batches of a few thousand on a laptop core. It uses only generic array
operations with the array module passed as `xp`, so a torch backend for GPU rollouts should be
a small step; **that backend is not written and not tested**. The container image needs only
numpy.

GillesPy2 (https://github.com/StochSS/GillesPy2) is the reference implementation of this
algorithm family and is **not used at run time and not a dependency**. Its pure-Python
`NumPySSASolver` installs and runs on Python 3.12 / numpy 2.5 here, but takes about 5 ms per
trajectory, roughly 100x too slow for the reference and grader. `tests/test_wetlab.py` has an
optional cross-check (skipped unless `gillespy2` is installed) comparing means and standard
deviations of the reversible network against it; it passed locally with GillesPy2 1.8.3.

## Model (everything here is public; `get_rules` returns it)

Species: S substrate, P product (the only species the assay sees), C active catalyst, I
intermediate, X dead catalyst, SC substrate-catalyst complex. A vessel starts with S = S0,
C = C0, P = P0 (spike), everything else 0. Stochastic mass-action kinetics: a reaction with
constant k and reactants A (+ B) fires with propensity k * #A (* #B).

| Mechanism (prior 1/6 each) | Reactions | Hidden constants (log-uniform at 300 K) |
|---|---|---|
| `first_order` | S + C -> P + C (k1) | k1 in [0.005, 0.05] |
| `intermediate` | S + C -> I + C (k1); I -> P (k2) | k1; k2 in [0.15, 2] /min |
| `reversible` | S + C -> P + C (k1); P + C -> S + C (k1 * Kr) | k1; Kr in [0.03, 0.4] |
| `autocatalytic` | S + C -> P + C (k1); S + P -> 2P (ka) | k1; ka in [3e-5, 4e-4] |
| `deactivation` | S + C -> P + C (k1); C -> X (kd) | k1; kd in [0.005, 0.08] /min |
| `saturation` | S + C -> SC (k1); SC -> P + C (kcat) | k1; kcat in [1, 20] /min |

k1 and ka are per molecule per minute. Every alternative tends to `first_order` at one end of
its prior range, so some episodes are intrinsically ambiguous. Temperature multiplies each
rate constant by exp(Ea/R * (1/300 - 1/T)) with public activation energies (kJ/mol): catalysis
50, S->I 50, I->P 80, reverse 90, autocatalysis 30, deactivation 120, binding 20, turnover 50.

**Run (action)**: `{"substrate": 20..200, "catalyst": 1..6, "product_spike": 0..40,
"temperature": 285..315 K, "sample_times": 1-6 strictly increasing times in [0.5, 40] min}`
(counts are whole molecules; `product_spike` may be omitted). **Observation**: reading(t) =
P(t) + Normal(0, 8^2) at each sampling time, all from the same trajectory. **Stock**: substrate
600, catalyst 16, product standard 60, assay kits 12, vessels 5; a run costs S0, C0, P0, one
kit per reading and one vessel. Invalid runs (NaN, out of range, wrong keys, non-integer
counts, bad times) and unaffordable runs are rejected and consume nothing. The agent may
submit at any time, once.

**Hidden**: the mechanism and its constants, drawn from `(seed, salt)` with the same
`salted_key` scheme as `chem_lab` (separate streams for mechanism, constants and each run's
trajectory + assay noise), so without the salt nothing can be recomputed from the public code.

## Reward

`reward = log q(h*) - log p0(h*)`, `q = 0.999 * submitted + 0.001 * p0`
(`wetlab_reward.py`). Submitting the prior scores exactly 0, the worst case is log 0.001 =
-6.91, the best is about log 6 = 1.79. **The reward depends only on the true mechanism**, not
on any approximate posterior. Also reported: `accuracy` (argmax), `n_runs`, `n_samples`,
`budget_used` (mean fraction of the five stocks consumed), and from the grader
`reference_reward`, `reference_accuracy`, `gap_to_reference` on the same seed + salt.
`WetLab.submit(..., diagnostics=True)` adds `approx_posterior`, `approx_design`,
`approx_inference`, which use the approximate reference posterior on the agent's own data;
they are diagnostics only and are not served by the Harbor grader.

## Reference policy (approximate)

There is no exact posterior here. The reference (`run_policy("reference")`, also the Harbor
oracle) is:

* **Inference** (`Belief`): 384 rate-constant particles per mechanism. For a run with readings
  y, each particle's likelihood is the Monte-Carlo estimate mean over 8 fresh SSA trajectories
  of prod_t Normal(y_t | P(t), sigma^2) (unbiased for the true likelihood). Per-mechanism
  evidence is accumulated run by run; particles are resampled when the effective sample size
  halves and jittered with a Liu-West kernel (no MH correction, a source of bias).
* **Design** (`eig`, `reference_action`): greedy. 40 random affordable candidates from a
  162-point grid (S0 40/100/200, C0 1/3/6, spike 0/40, T 288/300/312 K, three 3-point time
  sets), with a fair-share rule so early runs do not eat the stock; the candidate with the
  highest nested Monte-Carlo estimate of the expected information gain about the mechanism
  (48 simulations per mechanism) is run. The reference therefore always does 4 runs of 3
  readings; it never uses 1-2 or 4-6 readings per run and is myopic.

It is **not** the Bayes-optimal agent: an agent can in principle beat it (positive
`gap_to_reference`). Cost per episode: 4.7 s on a 2-CPU Modal container; 8.6 s mean (max
12.3 s) on a laptop running 8 episodes in parallel.

## Calibration (300 paired seeds, salt "calibration")

`uv run --no-project --with numpy --with scipy python scripts/wetlab_calibrate.py --seeds 300`
-> `results/wetlab_calibration.json` (run locally, 8 processes); the `coder_adaptive` rows come
from `modal run --env 3-sigma-submission experiments/wetlab_modal.py --seeds 300` (ephemeral
Modal CPU app, same seeds and salt; per-seed rows in `results/wetlab_adaptive.jsonl`, summary in
`results/wetlab_calibration_adaptive.json`). The reference reproduced exactly on Modal (1.352,
0.817). Bootstrap 95% CIs.

| Policy | Design | Inference | Mean reward [95% CI] | Accuracy [95% CI] |
|---|---|---|---|---|
| **reference** | greedy EIG (SBI) | SBI | **1.352** [1.269, 1.430] | **0.817** [0.773, 0.860] |
| coder_adaptive | greedy EIG (ODE surrogate) | ODE grid marginal, sigma^2 + binomial variance | 1.060 [0.882, 1.223] | 0.743 [0.693, 0.793] |
| coder_marg | fixed 4-run plan | ODE grid marginal, sigma^2 + binomial variance | 0.936 [0.827, 1.041] | 0.660 [0.607, 0.713] |
| fixed | fixed 4-run plan | SBI | 0.920 [0.813, 1.025] | 0.653 [0.600, 0.707] |
| coder_bic | fixed 4-run plan | ODE least squares + BIC, known sigma | 0.841 [0.707, 0.974] | 0.650 [0.597, 0.703] |
| coder_bic_s | fixed 4-run plan | ODE least squares + BIC, fitted sigma | 0.808 [0.680, 0.933] | 0.627 [0.573, 0.680] |
| random | uniform random runs | SBI | 0.651 [0.559, 0.746] | 0.527 [0.470, 0.583] |
| prior | none | none | 0 (exactly) | 0.170 (= frequency of `first_order`) |

Paired differences in reward, reference minus the other policy:

| vs | Mean [95% CI] | Accuracy difference [95% CI] | Reference better on |
|---|---|---|---|
| random | +0.701 [0.594, 0.808] | +0.290 [0.223, 0.353] | 87% of seeds |
| fixed (SBI) | +0.433 [0.318, 0.548] | +0.163 [0.103, 0.223] | 78% |
| coder_marg | +0.416 [0.307, 0.527] | +0.157 [0.100, 0.213] | 77% |
| coder_bic | +0.511 [0.381, 0.645] | +0.167 [0.107, 0.230] | 74% |
| coder_bic_s | +0.544 [0.415, 0.679] | +0.190 [0.127, 0.250] | 80% |
| coder_adaptive | +0.292 [0.123, 0.476] | +0.073 [0.013, 0.133] | 44% (many near-ties at the maximum) |

Reference accuracy by true mechanism: first_order 0.71, intermediate 0.83, reversible 0.86,
autocatalytic 0.64, deactivation 0.92, saturation 1.00.

What the numbers say, plainly:

* The three fixed-plan coder proxies (what the brief asked for: sensible fixed designs,
  deterministic ODE fits, BIC or grid marginalisation) are clearly below the reference; all
  paired CIs exclude 0.
* **That gap is a design gap, not an inference gap.** On the *same* fixed-plan data, SBI minus
  coder_marg is -0.017 [-0.055, +0.023]: the ODE curve with a binomial variance term,
  marginalised over a parameter grid, is as good as simulation-based inference at these
  settings. Intrinsic noise does not by itself defeat a deterministic surrogate here.
* `coder_adaptive` is the strongest thing we could write without stochastic simulation: the
  same candidate grid and stock rule as the reference, but design and inference both use the
  ODE surrogate. It reaches 1.060 / 0.743 and is still below the reference by +0.292
  [0.123, 0.476]. Here the split is different: the SBI posterior on the coder's own adaptive
  data would have scored 1.259 [1.167, 1.348], so its designs cost about +0.093 [-0.004, 0.191]
  (reference minus that, paired), not clearly different from 0, and its **inference** costs
  -0.199 [-0.350, -0.073]. The surrogate is adequate on the tame fixed plan but overconfident on
  the informative runs the design picks (few catalyst molecules, where trajectories are far
  from the ODE curve): 4% of its episodes score below -2, against 1% for the reference. Its
  median reward (1.70) is close to the reference's (1.75); the difference is in the tail.
* So the honest summary is: a fixed-plan ODE coder loses about 0.4-0.5 nats, an adaptive ODE
  coder about 0.3 nats, and the second gap is only moderately clear (lower CI bound 0.12).

The proxies are code written by us (`wetlab_baselines.py`); **no LLM agent has been run on
this environment**, so whether Claude or GPT with a shell actually falls short of the
reference is not known.

Tuning history: the first version (sigma 6, stock 1200/60/100/24 kits/8 vessels, wider
constant ranges, catalyst up to 15) gave reference accuracy 1.00 on 64 seeds, too easy. The
current constants (half the vessels and kits, sigma 8, 1-6 catalyst molecules, alternatives
closer to first order) were the second setting tried and were kept; no further tuning was done.

## Demo API

```python
from bayesenv import wetlab as W

lab = W.WetLab()                                   # track_reference=True: posterior each step
obs = lab.reset(seed=0, salt="demo")               # rules + obs["stock_remaining"]
run = {"substrate": 200, "catalyst": 3, "product_spike": 0, "temperature": 300,
       "sample_times": [4, 12, 35]}
obs = lab.step(run)                                # ~1 s (updates the reference posterior)
obs["result"]["readings"]                          # noisy product counts at 4, 12, 35 min
obs["stock_remaining"], obs["can_run"]             # what is left on the bench
obs["reference_posterior"]                         # {mechanism: prob}, for a bar chart
traj = W.simulate_trajectories("autocatalytic", {"k1": 0.01, "ka": 2e-4}, run, n=20)
traj["t"], traj["P"]                               # 80 time points, 20 trajectories per species
truth = lab.true_trajectories(run, n=20)           # the hidden mechanism, for the reveal
res = lab.submit(obs["reference_posterior"], reference=False)
res["reward"], res["accuracy"], res["hidden"], res["hidden_params"], res["budget_used"]
ref = W.reference_trajectory(0, "demo")            # reference on the same episode (~10 s):
ref["history"], ref["posteriors"], ref["result"]   # its runs, posterior after each, score
```

`lab.history` (runs with readings), `lab.posteriors` (reference posterior after each run),
`lab.hidden`, `lab.hidden_params` are available for plots. `simulate_trajectories(mechanism,
None, run)` draws the constants from the prior per trajectory (prior-predictive fan).
`WetLab(track_reference=False)` skips the posterior and makes `step` take milliseconds.

## Harbor task

```bash
python scripts/make_wetlab_tasks.py --seeds 0:5 --out tasks/wetlab   # renders wetlab-0..4
harbor run -p tasks/wetlab/wetlab-0 -a oracle -y                     # reference via MCP
```

`templates/wetlab_task/` mirrors `templates/chem_task/`: the lab runs in a separate
`mcp-server` container (MCP on 8000: `get_rules`, `run_experiment(substrate, catalyst,
temperature, sample_times, product_spike=0)`, `submit_posterior(posterior)`; grader on 8001
behind a per-task bearer token written to the compose file and `tests/grader_token`, same
practice as the chem and bayes tasks). `TASK_SALT` empty = a random salt per trial, held only
in that container; no salt is committed. The server never returns the reference posterior to
the agent. The reference episode for `gap_to_reference` is computed in a background thread at
container start and the grader waits for it. `/grade` returns `reward`, `accuracy`,
`submitted`, `n_runs`, `n_samples`, `budget_used`, `reference_reward`, `reference_accuracy`,
`gap_to_reference`; no submission = the prior = reward 0. The instruction says a shell with
Python, numpy and scipy is available and that writing code is allowed. Re-render after
changing `wetlab.py` or `wetlab_reward.py` (they are vendored into the task).

Run once locally (Docker 28.2.2, Harbor 0.25.0, while a calibration was using the CPU; to be
repeated on the Harbor VM):
`oracle` on wetlab-0 -> reward 1.791, accuracy 1, reference_reward 1.791, 1 min 32 s total;
`nop` on wetlab-1 -> reward 0.0, reference_reward 1.791, 30 s total.

## Prior art

* GillesPy2 (StochSS): the reference implementation of Gillespie SSA / tau-leaping in Python;
  used here only as an optional cross-check.
* ChemGymRL (arXiv 2305.14177): RL benches for chemistry; the vessel / reagent / bench
  vocabulary is borrowed from it, no code.
* Kriz et al. (arXiv 2610.20832).
* Olympus was considered and not used (optimisation benchmarks, stale dependencies).

## Not done / open

* No LLM agent run; no torch backend; tau-leaping not implemented (exact SSA was fast enough).
* The reference is approximate and myopic; its accuracy is a lower bound on what is achievable.
* Calibration used one salt and 300 seeds; `coder_adaptive` reuses the reference's candidate
  grid, which favours it relative to an agent that has to invent its own candidates. It has no
  unit test (its ODE table takes minutes to build); it was exercised only in the Modal run.
* An agent that codes its own SSA-based inference (the model is fully disclosed and the
  simulator is ~40 lines) could match or beat the reference. Nothing here prevents that.
