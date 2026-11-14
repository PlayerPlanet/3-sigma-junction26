# Held-out C: Virtual Chemistry Lab

A small sequential experimental-design task with an **exact** Bayesian reference. A reactor
runs A -> B; exactly one of 7 hypotheses about it is true (no fault, or one of six faults).
The agent has 10 experiments (temperature, time, concentration), sees a noisy yield after
each, and then submits a probability for every hypothesis. Because the hypothesis set is
finite and the noise Gaussian, the posterior is exact by enumeration, so we know exactly what
was learnable from the agent's own data, and we can split its reward into *design* (did it
run informative experiments?) and *inference* (did it turn the data into the right beliefs?).

Code: `bayesenv/chem_lab.py` (simulator, exact posterior, EIG, policies),
`bayesenv/chem_reward.py` (rewards), `scripts/chem_calibrate.py`, `tests/test_chem.py`,
`templates/chem_task/` + `scripts/make_chem_tasks.py` (Harbor), `tasks/chem/chem-0..4`.
Pure numpy/scipy, no network. One reference episode takes ~0.1-0.2 s (10 EIG searches over 252 candidates); 12,000 episodes (3 policies
x 4,000 seeds) take 73 s on 8 processes.

Prior art: Kriz et al. 2026, *Amortizing Sequential Experimental Design in Reasoning LLMs*,
arXiv:2610.20832, train LLM Bayesian experimental design with information-gain rewards on
Twenty Questions and test transfer to Medi-Q. This lab plays the role of a **held-out transfer
task**: same skill (choose informative queries, update beliefs over a discrete hypothesis set),
different surface (continuous lab conditions, a physical model, confounded faults).

## Model

Set conditions of experiment i (0-based, in run order): temperature T in [300, 380] K, time t
in [1, 120] min, co-reagent concentration c in [0.05, 1.0] M. Pseudo-first-order kinetics:

    T_act = T + dT_h
    c_act = max(scale_h * c - delta_h, 0)
    k     = A0 * exp(-Ea / (R * T_act)) * c_act * decay_h ** i
    y     = 1 - exp(-k t) + Normal(0, sigma^2)          (measured yield, not clipped)

Public constants: A0 = 5.0e6 M^-1 min^-1, Ea = 50 kJ/mol, R = 8.314, sigma = 0.06.

| Hypothesis | Prior | Effect | How to tell it apart |
|---|---|---|---|
| `nominal` | 0.250 | none | |
| `catalyst_mild` | 0.125 | rate x 0.95^i | slowdown grows with run index: repeat a condition late |
| `catalyst_severe` | 0.125 | rate x 0.85^i | same, faster |
| `temp_high` | 0.125 | T_act = T + 3 K | speed-up ~ exp(Ea dT / R T^2): larger at low T |
| `temp_low` | 0.125 | T_act = T - 3 K | slowdown larger at low T (x0.82 at 300 K, x0.88 at 380 K) |
| `stock_dilute` | 0.125 | c_act = 0.88 c | constant x0.88 slowdown at every T, c, i |
| `impurity` | 0.125 | c_act = c - 0.03 M | big slowdown at low c, negligible at high c |

Every fault acts through the rate constant, so at any single condition each looks like "a bit
slow" or "a bit fast" (confounded). They differ in how the effect varies with T, c and i. The
hardest pair is `temp_low` vs `stock_dilute`: identical near 380 K, separable only at low T,
where you must also pick t and c so the yield is not saturated. Conditions with yield near 0 or
1 are nearly useless (EIG ~ 0; see `test_eig_matches_monte_carlo`).

Exact posterior: p(h | D) ∝ p0(h) prod_i N(y_i; mu_h(x_i, i), sigma^2), over the 7 hypotheses.
EIG of a candidate x as experiment i: I(h; y) under the current posterior, computed with
12-point Gauss-Hermite quadrature over the noise (checked against Monte Carlo in the tests).

## API

```python
from bayesenv import chem_lab as C

lab = C.ChemLab()
obs = lab.reset(seed=0, salt="demo")          # rules, bounds, budget, hypotheses, prior
for i in range(C.BUDGET):
    x = C.eig_action(lab.exact_posterior(), i)    # or your own: {"temperature": 330, "time": 20, "concentration": 0.3}
    obs = lab.step(x)                              # obs["result"]["yield"], obs["posterior"]
    print(obs["result"], obs["posterior"])         # exact posterior {name: prob}: bar chart
res = lab.submit(lab.exact_posterior())            # or {name: prob} / list aligned with C.NAMES
print(lab.hidden, res["reward"], res["design"], res["inference"], res["accuracy"])
ref = C.reference_trajectory(0, "demo")            # reference's history + posteriors + result
```

* `reset(seed, salt=None) -> obs`: JSON-able rules (`C.rules()`), `budget`,
  `experiments_remaining`, current exact `posterior`. The hidden hypothesis is drawn from a
  salted key (`C.salted_key`, same scheme as `Task._key`); with a secret salt it cannot be
  recomputed from the seed and the public code. Noise is common random numbers: the i-th
  experiment gets noise sigma * z_i whatever its conditions, so policies compare paired.
* `step(action) -> obs`: action is `{"temperature", "time", "concentration"}` (exactly these
  keys) or `[T, t, c]`. NaN/inf, out-of-bounds, missing/extra keys, booleans and strings raise
  `ValueError`; over budget or after submit raise `RuntimeError`.
  Returns `{"result": {"index", "temperature", "time", "concentration", "yield"},
  "experiments_remaining", "posterior"}`.
* `submit(belief, with_reference=True) -> result`: belief is a dict name -> prob (missing = 0)
  or a list aligned with `C.NAMES`; validated and normalised. Once per episode; allowed before
  the budget is used (`n_experiments` is reported).
* For demos: `lab.history`, `lab.posteriors` (exact posterior after 0..n experiments, arrays
  aligned with `C.NAMES`), `lab.hidden`, `C.reference_trajectory(seed, salt)`,
  `C.run_policy("reference" | "random" | "prior", seed, salt)`, `C.eig(p, X, i)`,
  `C.mean_yield(X, i)` (K x m noise-free yields, for plotting the hypotheses' curves).

The MCP server does not expose the posterior, the hidden hypothesis or the reference.

## Reward (`bayesenv/chem_reward.py`)

q = 0.999 * submitted + 0.001 * p0 (mixing with the **prior**, so submitting the prior scores
exactly 0 and a confident wrong answer stays finite: at worst log(0.001) ≈ -6.9).

| Quantity | Definition |
|---|---|
| `reward` (primary) | log q(h\*) - log p0(h\*): log score relative to the prior (proper) |
| `design` | log p(h\* \| D) - log p0(h\*): how informative the agent's own experiments D were |
| `inference` | log q(h\*) - log p(h\* \| D): how well it turned D into beliefs (≈ 0 if exact) |
| identity | `reward = design + inference` |
| `reward_norm` | reward / 1.60 (calibrated mean reference reward): 0 = prior, ~1 = reference |
| `reference_reward`, `gap_to_reference` | the Bayes reference on the same (seed, salt) |
| `accuracy` | argmax q == h\* |
| `n_experiments`, `max_reward` | experiments used; log(1/p0(h\*)) (one-hot on the truth) |

E[design] is the mutual information between h and the data, so it is maximised by good design;
E[inference] <= 0 with equality for exact Bayesian updating. The prior mixing makes the exact
optimum (p - 0.001 p0)/0.999 instead of p, which costs < 1e-3 nats. Alternatives (Brier,
spherical, EIG shaping, per-step realised information, accuracy-only) are listed in the module
docstring for experiments; only the primary + decomposition are implemented.

## Calibration (4,000 paired seeds, salt "calibration")

`uv run --no-project --with numpy --with scipy python scripts/chem_calibrate.py --seeds 4000`
(output: `results/chem_calibration.json`).

| Policy | Mean reward [95% CI] | design | inference | Accuracy |
|---|---|---|---|---|
| **Reference** (greedy EIG + exact posterior) | **1.599** [1.579, 1.619] | 1.600 | -0.0007 | **0.866** |
| Random designs (uniform) + exact posterior | 0.976 [0.949, 1.003] | 0.976 | -0.0003 | 0.620 |
| Prior (no experiments) | 0 (exactly) | 0 | 0 | 0.249 (= P(nominal)) |

Paired difference reference - random: **+0.623 [0.601, 0.645]** nats (bootstrap 95% CI),
accuracy +0.246; the reference has the higher reward on 93% of seeds. Reference accuracy by
true hypothesis: nominal 0.92, catalyst_mild 0.95, catalyst_severe 1.00, temp_high 0.95,
temp_low 0.71, stock_dilute 0.49, impurity 1.00 (random: 0.78 / 0.75 / 1.00 / 0.70 / 0.43 /
0.11 / 0.40). So the reference is good but not perfect (the confounded pair caps it), and the
gap to random designs is large and comes from design, not inference.

Tuning: noise sd 0.04 with faults (±5 K, x0.8, 0.06 M, decay 0.90/0.75) gave reference accuracy
0.985 (too easy); sd 0.08 / ±4 K / x0.85 / 0.04 M gave 0.86; we kept sd 0.06 with the weaker
faults above (0.87).

## Harbor task

```bash
python scripts/make_chem_tasks.py --seeds 0:5 --out tasks/chem      # renders chem-0..4
harbor run -p tasks/chem/chem-0 -a oracle -y                       # reference via MCP
```

`templates/chem_task/` mirrors `templates/bayes_task/`: the lab runs in a separate
`mcp-server` container (MCP on 8000: `get_rules`, `run_experiment(temperature, time,
concentration)`, `submit_posterior(posterior: {name: prob})`; grader on 8001 behind a per-task
bearer token). `TASK_SALT` empty = a random salt per trial (a fresh hidden fault each run, not
recomputable from the task name). The verifier (`tests/test.sh`) fetches `/grade` and writes
`/logs/verifier/reward.txt` (one score in [0, 1]) and `/logs/verifier/details.json` with `reward`, `reward_norm`, `design`, `inference`, `accuracy`,
`n_experiments`, `reference_reward`, `gap_to_reference`, `submitted` (no submission = the
prior = reward 0). `solution/solve.sh` plays the reference through the MCP tools without access
to the hidden state. The instruction tells the agent it has a shell with Python, numpy and
scipy and that writing code is allowed. Re-render after changing `chem_lab.py` or
`chem_reward.py` (they are vendored into the task).

Verified locally (Docker Desktop, Harbor): `oracle` on chem-0 -> reward 2.014, accuracy 1,
gap_to_reference 0.000 (random per-trial salt); `nop` on chem-1 -> reward 0.0. No LLM agent has
been run on these tasks yet.
