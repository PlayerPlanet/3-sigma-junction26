# Hierarchical lab

A population of 12 units, each with its own hidden threshold. The agent has 12 experiments;
each one chooses a unit **and** a design and returns a binary outcome. Afterwards it must give
predictive probabilities for held-out designs on (a) those 12 units and (b) **new** units it
could never test, which can only be predicted from what it learned about the population.

Code: `bayesenv/hier.py` (model, exact posterior, policies, `HierLab`),
`bayesenv/hier_reward.py` (reward), `templates/hier_task/` and `tasks/hier/hier-0..4` (Harbor),
`scripts/hier_calibrate.py`, `experiments/hier_modal.py`, `tests/test_hier.py`.

Two design rules, taken from what went wrong elsewhere in this repo:

1. **Full disclosure.** `get_rules` gives the complete generative model: structure, every
   prior and hyperprior, the link, every constant, the distribution of the queries, the
   scoring rule and its constants. The only hidden things are drawn values. The prior
   predictive (which scores 0) is computable from the disclosed model in a few lines.
2. **No closed form.** The Bernoulli-logistic likelihood is not conjugate to the Normal
   population, so the answer cannot be typed in as a formula. The correct predictive needs
   partial pooling with the hyperparameters integrated out.

## The model, exactly as disclosed

```
mu        ~ Uniform(-3, 3)
log(tau)  ~ Uniform(log 0.2, log 2.0)        (density of tau proportional to 1/tau on [0.2, 2])
theta_i   ~ Normal(mean = mu, sd = tau)      independently for every unit, known or new
y | unit i, design x ~ Bernoulli(p),   p = 1 / (1 + exp(-a_i (x - theta_i)))
```

- K = 12 known units with known slopes a = (0.5, 1, 2, 4, 0.5, 1, 2, 4, 0.5, 1, 2, 4).
- Designs x in [-8, 8]. Budget: 12 experiments, each `(unit, design)`; repeats allowed.
- Queries (revealed by `finish_experiments`): 16 of kind `known_unit` (unit uniform over the
  12, design uniform over [-8, 8]) and 16 of kind `new_unit` (a different new unit each, slope
  4, design uniform over [-8, 8]). Designs are rounded to 3 decimals.
- Submission: one probability P(y = 1) per query, once.

Hidden draws (mu, tau, the 12 thresholds, the queries, the noise uniforms) come from
`salted_key(seed, salt, tag)`; in a Harbor trial the salt is random inside the server
container, so nothing is recomputable from the public code and the task name. Experiment i
uses the i-th noise uniform whatever is asked (common random numbers across policies).

## Reward

Per query, with q the submitted probability clamped to [0.001, 0.999] and p* the true
probability,

```
s(q) = p* log q + (1 - p*) log(1 - q)          expected log score; no outcome is sampled
```

- `known_unit` query: p* = sigmoid(a_i (x - theta_i)) with the true theta_i.
- `new_unit` query: p* = ∫ Normal(theta; mu, tau) sigmoid(a (x - theta)) dtheta with the true
  (mu, tau), i.e. the expectation over the new unit's threshold as well. (Scoring against one
  sampled new threshold would add noise no agent can reduce.)

```
raw    = (mean s(q) - mean s(prior predictive)) / Z          over all 32 queries
raw_a  = the same over the 16 known-unit queries, divided by Z_a
raw_b  = the same over the 16 new-unit queries,  divided by Z_b
reward = clip(raw, 0, 1)                         -> /logs/verifier/reward.txt
```

Z_a = 0.11575 and Z_b = 0.11948 nats per query are the prior averages of
[s(clamped p*) - s(prior predictive)]: the expected gain of someone who knows mu, tau and every
threshold. They are estimated once for this configuration (2,000,000 prior draws, Monte Carlo
standard error about 0.1%) and stored in `hier_reward.py`; Z = (Z_a + Z_b) / 2 = 0.117615. They
are constants of the task, not per-episode quantities.

Properties: the prior predictive scores exactly 0 (and no submission scores 0); raw is an
affine function of a proper scoring rule, so for given data the exact posterior predictive
maximises its expectation; one probability of 0 or 1 costs at most log(0.001) on that query.
`details.json` keeps the unclipped `raw`, `raw_a`, `raw_b`, the score of the exact posterior on
the agent's own data (`design_raw`) and the difference (`inference_raw`), and the reference's
score on the same hidden draw.

## Reference

Exact posterior. Units are independent given phi = (mu, tau):

```
p(phi | D) ∝ p(phi) prod_i m_i(phi),      m_i(phi) = ∫ Normal(theta; mu, tau) L_i(theta) dtheta
```

phi sits on a 48 x 32 Gauss-Legendre grid in (mu, log tau), where the hyperprior is flat; theta
on a uniform grid of step 0.1 over [-15, 15] (trapezoid rule). This is quadrature, not Monte
Carlo. Checks: against an independent brute force (midpoint sums in a different
parametrisation) the predictive agrees to 2e-5, and that difference shrinks 4x when the brute
force is refined; against the reference itself on a grid twice as fine in every direction the
difference is 2e-13.

Experiment choice: greedy, one step ahead, maximising the expected gain in the **scored**
quantity. For an experiment outcome y and a query outcome y_q, the expected improvement of the
posterior predictive's log score on that query is the mutual information I(y; y_q). The queries
are unknown during the experiments but their distribution is disclosed, so the utility of
(unit, design) is that information averaged over 16 known-unit and 16 new-unit queries, over 33
candidate designs. It is one step ahead, not optimal.

Cost: one reference episode takes 0.44 s on one laptop core. Grading a submission takes 4 ms
(0.04 ms for the score itself, the rest for the exact posterior on the agent's data); the
`/grade` endpoint also plays the reference once (0.4 s).

## Calibration

1,000 paired seeds (same hidden draws and noise stream for every row), Modal CPU,
`experiments/hier_modal.py::calibrate`, `results/hier_calibration.json`. Intervals are
bootstrap 95%. Rows named `reference+X` use the reference's own experiments (identical data)
and only replace the inference by shortcut X.

| policy | raw | (a) known units | (b) new units | clipped (reward.txt) | raw > 1 | raw < 0 | reference - policy, raw | (a) | (b) | clipped |
|---|---|---|---|---|---|---|---|---|---|---|
| `reference` | 0.843 | 0.807 | 0.877 | 0.638 | 32% | 3% |  |  |  |  |
| `reference+plugin` | 0.796 | 0.795 | 0.797 | 0.611 | 32% | 6% | +0.047 [+0.039, +0.055] | +0.012 [+0.007, +0.017] | +0.080 [+0.068, +0.094] | +0.027 [+0.022, +0.032] |
| `reference+no_pooling` | 0.237 | 0.481 | 0.000 | 0.239 | 2% | 12% | +0.606 [+0.573, +0.636] | +0.326 [+0.302, +0.350] | +0.877 [+0.828, +0.925] | +0.400 [+0.382, +0.419] |
| `reference+complete_pooling` | 0.565 | 0.600 | 0.531 | 0.520 | 26% | 19% | +0.278 [+0.246, +0.311] | +0.207 [+0.167, +0.251] | +0.346 [+0.309, +0.384] | +0.119 [+0.105, +0.133] |
| `random` | 0.518 | 0.479 | 0.555 | 0.470 | 22% | 17% | +0.325 [+0.294, +0.357] | +0.328 [+0.293, +0.363] | +0.322 [+0.285, +0.361] | +0.168 [+0.152, +0.183] |
| `random_unit_eig_design` | 0.762 | 0.703 | 0.819 | 0.591 | 29% | 6% | +0.081 [+0.066, +0.096] | +0.104 [+0.083, +0.126] | +0.058 [+0.043, +0.075] | +0.047 [+0.038, +0.057] |
| `round_robin_eig_design` | 0.769 | 0.713 | 0.823 | 0.593 | 29% | 5% | +0.074 [+0.059, +0.089] | +0.094 [+0.072, +0.118] | +0.055 [+0.040, +0.069] | +0.045 [+0.036, +0.054] |
| `eig_unit_random_design` | 0.588 | 0.557 | 0.618 | 0.499 | 24% | 16% | +0.254 [+0.228, +0.281] | +0.249 [+0.218, +0.282] | +0.259 [+0.232, +0.289] | +0.139 [+0.125, +0.153] |
| `no_pooling` | 0.248 | 0.503 | 0.000 | 0.248 | 2% | 10% | +0.595 [+0.562, +0.628] | +0.304 [+0.278, +0.330] | +0.877 [+0.828, +0.926] | +0.391 [+0.373, +0.408] |
| `complete_pooling` | 0.549 | 0.558 | 0.541 | 0.515 | 25% | 21% | +0.293 [+0.258, +0.330] | +0.249 [+0.204, +0.299] | +0.336 [+0.300, +0.375] | +0.124 [+0.109, +0.138] |
| `prior` | 0.000 | 0.000 | 0.000 | 0.000 | 0% | 0% | +0.843 [+0.802, +0.886] | +0.807 [+0.761, +0.854] | +0.877 [+0.830, +0.926] | +0.638 [+0.617, +0.658] |

What the policies are:

- `reference`: greedy expected gain over (unit, design) + exact hierarchical posterior.
- `random`: uniform random unit and design + exact posterior.
- `no_pooling`: every unit fitted on its own data with the hyperprior's marginal as its prior;
  designs maximise I(y; theta_unit) under that model; new units get the prior predictive.
- `complete_pooling`: all units share one threshold; units in turn, design by information
  about that one threshold; new units get the same threshold posterior.
- `reference+plugin`: empirical Bayes on the reference's data. (mu, tau) are set to the
  maximiser of the exact marginal likelihood, then every prediction is made as if they were
  known. Known units still get a proper per-unit posterior under that point estimate.
- `random_unit_eig_design`, `round_robin_eig_design`, `eig_unit_random_design`: ablations of
  the reference's two choices, all with exact inference.

Reading the table:

- **No pooling** and **complete pooling** are far below the reference, on both kinds of
  queries, whether they pick their own experiments or use the reference's.
- **Plug-in is below the reference, but by little**: 0.047 raw (6% of the reference), 0.080
  on new units, 0.027 in the clipped score. The interval excludes 0 with 1,000 seeds, and the
  reference is better in only 56% of episodes. The plug-in estimate of tau is below the truth
  in 70% of episodes and at the lower bound 0.2 in 37%, which is the classic overconfidence,
  but the log-score cost of it is small here. An agent that does everything else right and
  plugs in point hyperparameters loses about 0.03 of the final score.
- **Allocation across units is a quarter of the reference-minus-random gap**: reference minus
  random is 0.325 [0.294, 0.357]; replacing only the reference's choice of unit by a random
  unit costs 0.081 [0.066, 0.096] (25%), and choosing the design at random given the unit
  accounts for 0.244 [0.214, 0.276]. Round robin over units costs 0.074. The reference tests
  5.8 of the 12 units on average, with 3.3 / 2.7 / 2.2 / 1.8 / 1.2 / 0.8 experiments on its
  most to least tested ones, and prefers steep units.
- **Clipping matters.** The normaliser is a per-task constant, so an episode whose hidden draw
  is far from the prior has more than Z to gain: the reference's raw score exceeds 1 in 32% of
  episodes and its clipped mean (0.638) is well below its raw mean (0.843). All gaps roughly
  halve in the clipped score. The raw value is in `details.json` and is the one to analyse.

## What was tuned

Everything below was chosen by looking at calibration runs
(`results/hier_tuning_sweep.json`, `experiments/hier_modal.py::sweep`; 100 seeds for round 1,
200 for round 2). Entries are reference minus policy in raw score with 95% intervals;
`tau3` = tau up to 3, `tau01` = tau down to 0.1, `new4` = new-unit queries all at slope 4
(otherwise slopes 0.5/1/2/4), `slope2`/`steep` = known-unit slopes all 2 / alternating 2 and 4.

| configuration | seeds | reference raw | ref - plug-in | ref - round robin | ref - random | ref - complete pooling | ref - no pooling |
|---|---|---|---|---|---|---|---|
| K8_B32 | 100 | 0.897 | +0.017 [+0.009, +0.026] | +0.016 [-0.001, +0.034] | +0.133 [+0.093, +0.179] | +0.257 [+0.159, +0.380] | +0.511 [+0.413, +0.620] |
| K4_B16 | 100 | 0.820 | +0.057 [+0.033, +0.087] | +0.019 [+0.001, +0.037] | +0.201 [+0.150, +0.259] | +0.195 [+0.136, +0.267] | +0.448 [+0.358, +0.545] |
| K6_B18 | 100 | 0.864 | +0.038 [+0.022, +0.056] | +0.003 [-0.022, +0.027] | +0.262 [+0.187, +0.350] | +0.181 [+0.120, +0.256] | +0.459 [+0.362, +0.560] |
| K6_B24 | 100 | 0.895 | +0.021 [+0.011, +0.032] | +0.004 [-0.016, +0.025] | +0.169 [+0.126, +0.219] | +0.194 [+0.126, +0.274] | +0.483 [+0.384, +0.589] |
| K12_B24 | 100 | 0.890 | +0.008 [+0.001, +0.015] | +0.004 [-0.026, +0.031] | +0.197 [+0.144, +0.254] | +0.229 [+0.135, +0.348] | +0.526 [+0.430, +0.631] |
| K12_B36 | 100 | 0.916 | +0.006 [+0.002, +0.011] | +0.004 [-0.019, +0.025] | +0.170 [+0.130, +0.215] | +0.247 [+0.154, +0.366] | +0.524 [+0.430, +0.626] |
| K16_B24 | 100 | 0.881 | +0.007 [+0.002, +0.014] | +0.054 [+0.029, +0.080] | +0.230 [+0.176, +0.288] | +0.250 [+0.168, +0.342] | +0.570 [+0.466, +0.683] |
| K8_B32_tau3 | 100 | 0.859 | +0.021 [+0.012, +0.031] | +0.025 [+0.002, +0.047] | +0.155 [+0.114, +0.198] | +0.474 [+0.324, +0.651] | +0.469 [+0.370, +0.581] |
| K6_B24_tau3 | 100 | 0.864 | +0.019 [+0.009, +0.031] | +0.016 [-0.006, +0.039] | +0.214 [+0.158, +0.282] | +0.419 [+0.294, +0.565] | +0.437 [+0.343, +0.538] |
| K6_B24_slope2 | 100 | 0.904 | +0.012 [+0.006, +0.019] | +0.001 [-0.019, +0.020] | +0.146 [+0.105, +0.189] | +0.208 [+0.145, +0.276] | +0.398 [+0.326, +0.477] |
| K4_B16_new4 | 200 | 0.878 | +0.077 [+0.054, +0.101] | +0.026 [+0.007, +0.045] | +0.218 [+0.178, +0.263] | +0.284 [+0.214, +0.357] | +0.492 [+0.427, +0.560] |
| K5_B20_new4 | 200 | 0.903 | +0.047 [+0.031, +0.063] | +0.003 [-0.011, +0.017] | +0.228 [+0.182, +0.279] | +0.267 [+0.206, +0.331] | +0.476 [+0.412, +0.541] |
| K6_B18_new4 | 200 | 0.912 | +0.044 [+0.027, +0.062] | +0.021 [+0.006, +0.037] | +0.261 [+0.218, +0.310] | +0.258 [+0.204, +0.319] | +0.511 [+0.446, +0.580] |
| K5_B20_new4_tau01 | 200 | 0.933 | +0.034 [+0.022, +0.046] | +0.017 [+0.004, +0.029] | +0.242 [+0.195, +0.295] | +0.215 [+0.159, +0.275] | +0.552 [+0.484, +0.624] |
| K6_B18_new4_tau01 | 200 | 0.929 | +0.027 [+0.016, +0.038] | +0.016 [+0.000, +0.033] | +0.258 [+0.212, +0.310] | +0.204 [+0.152, +0.262] | +0.586 [+0.512, +0.664] |
| K5_B15_new4_tau01 | 200 | 0.908 | +0.047 [+0.030, +0.065] | +0.012 [-0.009, +0.030] | +0.261 [+0.202, +0.328] | +0.203 [+0.145, +0.266] | +0.547 [+0.477, +0.624] |
| K6_B18_steep | 200 | 0.940 | +0.028 [+0.020, +0.037] | -0.003 [-0.017, +0.011] | +0.250 [+0.208, +0.292] | +0.379 [+0.299, +0.463] | +0.431 [+0.374, +0.489] |
| **K12_B12_new4 (chosen)** | 200 | 0.863 | +0.050 [+0.033, +0.069] | +0.066 [+0.035, +0.099] | +0.324 [+0.257, +0.393] | +0.273 [+0.210, +0.345] | +0.590 [+0.513, +0.670] |
| K16_B16_new4_tau01 | 200 | 0.889 | +0.028 [+0.019, +0.039] | +0.064 [+0.040, +0.090] | +0.255 [+0.205, +0.307] | +0.209 [+0.157, +0.264] | +0.699 [+0.613, +0.791] |
| K12_B18_new4_tau01 | 200 | 0.935 | +0.016 [+0.009, +0.023] | +0.086 [+0.062, +0.112] | +0.290 [+0.242, +0.340] | +0.239 [+0.181, +0.307] | +0.663 [+0.588, +0.742] |

Tuned, in order:

1. **K and the budget** (first guess: 8 units, 32 experiments). With several experiments per
   unit the plug-in shortcut is nearly free (0.006 to 0.02) and round robin over units matches
   the reference. The plug-in gap grows with fewer units; the allocation gap appears only when
   there are more units than the budget can cover. 12 units with 12 experiments is the one
   configuration tried where both are clearly positive.
2. **Slope of the new-unit queries** (first guess: 0.5/1/2/4, now always 4). A shallow new
   unit's response hardly depends on tau, so getting tau wrong cost nothing; sharp new units
   make the population spread matter. The plug-in gap went from 0.057 to 0.077 with 4 units and
   from 0.038 to 0.044 with 6 (different seed counts, overlapping intervals).
3. **Range of tau**: upper bound 3 instead of 2 doubles the complete-pooling gap and does
   nothing for plug-in; lower bound 0.1 instead of 0.2 makes plug-in slightly *less* costly.
   Kept at [0.2, 2].
4. **Known-unit slopes**: mixed 0.5/1/2/4 kept; equal or steeper slopes did not enlarge any
   gap.

Not tuned: the range of mu, the design range, the number of queries (16 + 16), the clamp
(0.001), the quadrature grids, the one-step-ahead utility.

The honest summary of the tuning: no pooling and complete pooling were far below the reference
in every configuration. The plug-in gap never exceeded 0.08 raw (4 units, 16 experiments) and
is 0.047 in the chosen one. It could not be made large without making the task about 4 units.

## Limits

- **Plug-in is a small trap, not a large one.** See above. The environment separates agents
  that pool correctly from those that do not pool or pool completely; it only weakly separates
  full Bayes from a careful empirical Bayes.
- **A strong coding agent can probably match the inference.** The exact predictive is a few
  dozen lines of numpy: a (mu, log tau) grid, a theta grid, a product over units of per-unit
  marginal likelihoods. Nothing is hidden, so an agent that writes this gets `inference_raw`
  = 0. What is left is the choice of experiments: 0.074 between round robin with good designs
  and the reference, 0.325 between random and the reference. The task tells an agent that it
  may write code; whether frontier agents actually integrate over (mu, tau) instead of fitting
  them, and whether they plan the allocation, has not been tested: no LLM has been run on it.
- **The reference is greedy**, one step ahead, on 33 candidate designs. A better planner
  could beat it; `gap_to_reference` can be positive.
- **Raw scores above 1 are common** (32% for the reference), so the clipped score compresses
  differences between good agents. Dividing by a larger constant would avoid this at the price
  of a reference well below 1; the definition asked for was kept.
- **High variance per episode**: the standard deviation of the reference's raw score across
  hidden draws is about 0.7. Five tasks say little; compare agents with the paired
  `gap_to_reference` over many trials.
- The hyperprior's hard bounds are part of the model. A point estimate at the bound tau = 0.2
  is the main way plug-in fails.

## Verified, and not

Verified: `tests/test_hier.py` (22 tests, 25 s): exact posterior and prior predictive against
the brute force; prior scores exactly 0; determinism under seed and salt; hidden draws follow
the disclosed distributions; invalid actions rejected without using budget; budget, phase and
single submission enforced; score in [0, 1]; the reference beats random, no pooling, complete
pooling and plug-in on 40 seeds. The rendered `tasks/hier/hier-0` server was started as a local
process and played through a FastMCP client twice: once with the oracle `solution/solve.py`
(its `/grade` output equals the in-process reference, `gap_to_reference` = 0), once with
invalid, over-budget, early, short and repeated calls (all rejected), and `/grade` without the
token returns 404.

Not verified: the Docker build, the compose file, `tests/test.sh` and `solution/solve.sh`
inside Harbor (no Docker on the development machine; they are copies of the chemistry lab's
with the names changed), and any LLM agent.

## Use

```bash
PY="uv run --no-project --with numpy --with scipy --with pytest python"
$PY -m pytest -q tests/test_hier.py
$PY scripts/hier_calibrate.py --seeds 40          # small local run
$PY scripts/make_hier_tasks.py --seeds 0:5        # re-render tasks/hier after any change
harbor run -p tasks/hier -a oracle
```

```python
from bayesenv import hier as H
lab = H.HierLab(); lab.reset(seed=0, salt="demo")
lab.step({"unit": 3, "design": 0.0})
queries = lab.finish()
lab.submit(lab.exact_predictive())      # or any list of 32 probabilities
```
