# LFI lab: likelihood-free for the agent, exact for the grader

Single cells express one gene with a two-state (bursting) promoter and negative
autoregulation. Four rate constants are hidden. The agent measures snapshots of captured mRNA
counts in batches of cells (at most 200 cells) at chosen times after induction, then forecasts
10 held-out queries: the count distribution of one fresh cell, or how many of 100 fresh cells
exceed a threshold, in conditions that include a feedback-blocking drug and a deeper capture
protocol it cannot run.

The agent gets the exact stochastic simulator (`/app/lfisim.py`) and **no likelihood**. The
likelihood has no closed form; moment closures are wrong (the feedback is nonlinear); summary
ABC loses information and calibration. The grader, however, solves the chemical master
equation exactly by a finite state projection (FSP) for every one of the 10,000 prior
hypotheses, so the reference posterior, the true forecasts and the reward are all exact.

An agent can close the gap in two ways: realise that the likelihood is computable (the FSP of
a 2 x ~100-state chain, about 600 CPU-seconds for the whole prior, see "Cost" below), or build
genuinely good simulation-based inference. Shortcuts lose real reward (table below).

Code: `bayesenv/lfilab.py` (FSP, tables, exact posterior, information gain, reward, `LfiLab`,
policies and baselines), `bayesenv/lfilab_sim.py` (the shipped Gillespie simulator),
`bayesenv/lfilab_constants.json` (prior predictives and C), `experiments/lfilab_modal.py`
(tables, tuning, calibration, tests on Modal), `tests/test_lfilab.py`,
`templates/lfi_task/` + `scripts/make_lfi_tasks.py` (Harbor), `tasks/lfi/lfi-0..2`,
`results/lfilab_calibration.json`.

## The model, exactly as disclosed by `get_rules`

Only the four rate constants are hidden.

- **State.** Promoter g in {off, on}; mRNA copy number m. At t = 0 (induction) every cell is
  off with m = 0.
- **Reactions.** off -> on at u * k_on / (1 + (m/K)^2); on -> off at k_off; m -> m+1 at
  k_tx * f while on; m -> m-1 at rate m (degradation 1 per molecule sets the time unit).
- **Conditions.** standard (u = 1), low_inducer (u = 1/4), feedback_blocked (u = 1, no Hill
  term), blocked_low (u = 1/4, no Hill term). Only the first two can be assayed.
- **Extrinsic noise.** Per cell, fixed for life: f = sqrt(2)^j, j = Binomial(4, 1/2) - 2.
- **Measurement.** Each molecule is captured independently with probability 0.2; the reading is
  the captured count. Queries use capture 0.2 or 0.9.
- **Prior.** k_on, k_off in 0.25 * sqrt(2)^i, K in sqrt(2)^i, k_tx in 2 * sqrt(2)^i,
  i = 0..9, independently and uniformly (10,000 equally likely combinations).
- **Assays.** `run_assay(condition, time, cells)`, time in {0.5, 1, 2, 4, 8}, cells >= 10,
  total 200 cells, at most 6 assays. Returns every cell's captured count. Invalid requests are
  rejected and cost nothing.
- **Queries** (revealed by `finish_experiments`, with their bins and prior predictive): 10
  drawn uniformly without replacement from 224 = 4 conditions x 7 times {0.5, 1, 2, 3, 4, 8,
  16} x 2 captures x 4 kinds. Kind `null`: the captured count of one cell over 10 bins (0, 1,
  2, 3-4, 5-7, 8-11, 12-17, 18-25, 26-35, 36+). Kind tau in {1, 5, 15}: how many of 100 fresh
  cells have a captured count >= tau, over 20 bins of width 5.
- **Simulator.** `/app/lfisim.py`, numpy only, `simulate(k_on, k_off, k_tx, K, time, n_cells,
  condition, capture, seed)`: one Gillespie trajectory per cell, exact. A 50-cell assay takes
  about 1 ms, so 20,000 simulated 4-assay datasets cost about 100 CPU-seconds.

The rules describe the process; they do not say how to do inference with it (in particular
they do not say that the likelihood is computable). Working that out is the task.

## Reward

For query k with true bin distribution p*_k (exact, from the FSP of the hidden constants, no
sampled outcomes), submission q_k (every bin floored at 1e-4 and renormalised) and prior
predictive p0_k (floored the same way, shown with the query):

    S     = mean_k sum_b p*_kb (log q_kb - log p0_kb)
    raw   = S / C,            C = 0.81841
    score = min(1, max(0, raw))       -> /logs/verifier/reward.txt

- Submitting p0 (or nothing) scores exactly 0. p0 is a fixed point of the floor.
- C is the prior average of S for an answer equal to the truth, computed **exactly** as a sum
  over the 10,000 hypotheses and the 224 query items (no Monte Carlo), stored in
  `lfilab_constants.json`. A constant, not a per-episode maximum: raw can exceed 1 when the
  hidden constants make the queries informative (knowing the truth averages 1.02 raw, 0.79
  clipped; 26% of reference episodes clip at 1).
- The reward depends only on the hidden constants and the submission; it is maximised in
  expectation by the exact posterior predictive. `details.json` also carries the hidden
  constants, the reference's raw reward on the same constants, and exact inference on the
  agent's own data (design gap vs inference gap); these are for reporting only.

## What is exact, and what is not

- **Likelihood: exact up to a certified truncation.** For transcription rate r the projection
  keeps m <= M(r), the 1 - 1e-10 quantile of Poisson(r). This bound is rigorous: m is
  stochastically dominated by an always-on immigration-death process whose law at any time is
  Poisson with mean <= r. The leaked mass is also measured; the maximum over all 21,560 solves is
  8.4e-9 (limit 1e-6, asserted). Time evolution is expm(Q * 0.5) applied repeatedly; times
  are multiples of 0.5. Extrinsic noise is a disclosed 5-point distribution on the same sqrt(2)
  grid as k_tx, and the low inducer is k_on/4 = 4 grid steps, so the whole model needs the FSP
  on one extended grid: 19,600 solves with feedback and 1,960 without. Tables are float32.
- **Posterior: exact.** The prior is the discrete 10,000-point grid (disclosed), so the
  posterior is a finite sum. Log-likelihoods are floored at log(1e-37) per cell.
- **Truth and C: exact.** The server computes the truth by a direct FSP of the hidden
  hypothesis (the same function and arguments as the tables; agreement < 1e-5 is tested).
- **The server's cells are sampled from the exact FSP distribution** (extrinsic factor, then m
  from the FSP of that factor, then binomial capture), not by Gillespie. The two are the same
  process; the shipped simulator is checked against the FSP in `tests/test_lfilab.py`
  (total variation < 0.02 with 40,000 cells, three conditions, two times).
- **Approximate: the design.** The reference is greedy: 4 assays of 50 cells, each chosen by a
  Monte Carlo estimate (192 samples, common random numbers) of the information about the
  hypothesis of the next batch of 50. It ignores the query distribution and the option of
  uneven batches or more assays, so a better design is possible.

### Changes from the proposal, and why

| Proposal | Built | Why |
|---|---|---|
| Lognormal extrinsic factor, Gauss-Hermite in the grader | Disclosed 5-point Binomial(4, 1/2) on the sqrt(2) grid (sd of log f = 0.35) | exact, not quadrature; shares FSP solves with the k_tx grid |
| Log-uniform continuous prior, grid posterior | Discrete uniform prior on a disclosed 10^4 grid | the posterior is then exactly Bayes, not a quadrature of it |
| Cell budget ~2,000, capture as in scRNA-seq | 200 cells, capture 0.2 | with 400 cells and capture 0.3 the reference reached 99% of the truth and every shortcut was within 0.04 |
| Queries: binned single-cell distribution | Also population queries (how many of 100 cells exceed tau) and a 0.9 capture | single-cell queries are dominated by intrinsic noise; population queries are dominated by parameter uncertainty, which is what separates calibrated inference from shortcuts |
| Feedback-blocking drug as an optional assay | Query-only | forces mechanistic extrapolation |

## Calibration

300 paired seeds (0 to 299, salt "calibration", not used for tuning), Modal CPU, 53 s wall,
1,679 container-seconds. Every row uses the reference's own data except the design rows. All
inference rows other than "telegraph moments" are given the EXACT forecasts of the
hypotheses they keep, so they lose only through their inference (generous to them).
Intervals: paired bootstrap 95%. Full rows: `results/lfilab_calibration.json`.

| Policy | raw | score | ref − policy, raw [95% CI] | ref − policy, score [95% CI] |
|---|---|---|---|---|
| Knowing the truth | 1.021 | 0.793 | −0.140 [−0.153, −0.127] | −0.087 [−0.100, −0.076] |
| **Reference**: information-gain design + exact FSP posterior | **0.881** | **0.706** | 0 | 0 |
| Exact FSP but extrinsic noise ignored (otherwise exact) | 0.843 | 0.701 | 0.037 [0.022, 0.054] | 0.005 [0.001, 0.009] |
| Design: information gain, standard condition only | 0.863 | 0.698 | 0.018 [0.009, 0.028] | 0.008 [0.002, 0.015] |
| Design: random assays + exact | 0.835 | 0.673 | 0.046 [0.029, 0.063] | 0.034 [0.020, 0.048] |
| Plug-in: exact likelihood, MAP hypothesis only | 0.761 | 0.622 | 0.119 [0.093, 0.148] | 0.084 [0.066, 0.103] |
| Rejection ABC, mean + quantiles + zeros (20,000 sims, keep 1%) | 0.752 | 0.633 | 0.129 [0.108, 0.149] | 0.074 [0.059, 0.090] |
| Design: all assays at steady state (standard, t = 8) + exact | 0.741 | 0.632 | 0.139 [0.114, 0.164] | 0.075 [0.058, 0.092] |
| Rejection ABC, mean + variance (20,000 sims, keep 1%) | 0.735 | 0.624 | 0.146 [0.125, 0.170] | 0.082 [0.067, 0.099] |
| Moment matching, no-feedback telegraph closed form, plug-in | 0.164 | 0.382 | 0.717 [0.607, 0.834] | 0.325 [0.285, 0.364] |
| Prior predictive (or no submission) | 0 | 0 | 0.881 [0.810, 0.951] | 0.706 [0.679, 0.734] |

Diagnostics of the reference's posterior after 200 cells: effective number of hypotheses
314 on average (median 232), posterior probability of the true hypothesis 0.019, MAP equal to
the truth in 3.3% of episodes. The posterior does not concentrate; forecasting has to average.

What the table says:

- **Every shortcut is below the reference with an interval that excludes 0.** As in the DAG
  lab the gaps fall in groups. A misspecified mechanism (moment matching on the telegraph
  model, which cannot represent feedback and so predicts the blocked condition to be the same
  as standard) costs 0.72 raw / 0.33 score. Approximate inference with the right model costs
  0.12 to 0.15 raw: ABC on summaries, whether two or seven per assay, or the exact likelihood
  used for a point estimate. Ignoring the extrinsic noise costs 0.04 raw.
- **Design matters**: assaying only at steady state costs 0.14 raw (as much as ABC), random
  assays 0.05, giving up the low-inducer condition 0.02.
- **Clipping compresses the gaps** (0.04 raw becomes 0.005 for the no-extrinsic row): many
  episodes clip at 1 for the reference and the near-exact rows alike. The clipped score is
  what Harbor reports; the raw values in `details.json` are better for analysis.

## Cost of exact inference in a small container

- The full table (21,560 FSP solves with `scipy.linalg.expm` at dt = 0.5, adaptive
  truncation) takes **596 CPU-seconds on one laptop core** (28 ms per solve on average, 0.17 s
  for the largest, N = 318 states). On the agent's 2 vCPU that is **about 5 minutes**, plus
  about 1 minute to assemble the likelihood and query tables. Builds: 116 s wall on 18 local
  processes; the mcp-server image builds it at `docker build` time.
- An agent that does not exploit the grid alignment (one FSP per hypothesis, extrinsic level
  and assayed condition, 10,000 x 5 x 2 = 100,000 solves) needs about 2,800 CPU-seconds,
  **about 25 minutes on 2 vCPU**; adding all four query conditions for every hypothesis
  doubles it. Computing query forecasts only for the posterior support (a few hundred
  hypotheses) avoids that. So exact inference fits in the 60-minute limit, but only for an
  agent that recognises it and implements it with some care (truncation, the extrinsic
  mixture, the binomial capture, the discrete prior).
- The reference episode itself (4 information-gain steps and the forecasts, tables loaded)
  takes about 2 s.

## Tuning record

Results were looked at on tuning seeds 100000 to 100047 (salt "tune") with
`experiments/lfilab_modal.py::diag` (per-query gains on all items), in this order:

| Configuration | Reference / truth | ABC mean+var gap | Plug-in gap | Telegraph gap | Random design gap |
|---|---|---|---|---|---|
| 400 cells, capture 0.3, single-cell queries, coarse bins | 0.99 | 0.03 | 0.003 | 0.09 | 0.01 |
| same, fine bins, query capture 0.9 | 0.99 | 0.03 | 0.004 | 0.11 | 0.01 |
| 100 cells, capture 0.3 | 0.94 | 0.06 | 0.026 | 0.19 to 0.23 | 0.00 |
| 400, 200 or 100 cells, capture 0.1 | 0.87 to 0.96 | 0.04 to 0.06 | 0.01 to 0.05 | 0.25 to 0.45 | 0.00 to 0.01 |
| + population queries, 400 cells, capture 0.3 | 0.94 | 0.13 | 0.04 | 0.46 | 0.03 |
| + population queries, 400 cells, capture 0.2 | 0.90 | 0.10 | 0.06 | 0.43 | 0.03 |
| **+ population queries, 200 cells, capture 0.2 (chosen)** | 0.85 | 0.11 | 0.13 | 0.57 | 0.03 |

Single-cell count distributions were too easy: they are dominated by intrinsic noise, which
any approximately right parameter reproduces. Adding population queries (dominated by
parameter uncertainty) and a smaller budget gave the headroom. The reaction network, the prior
grid and the extrinsic noise were fixed before tuning (so the FSP tables never changed); the
capture, the budget and the queries were tuned.

## Limits

- Per-episode rewards are noisy (10 random queries, one hypothesis): the per-seed SD of the
  reference's raw reward is large (5th to 95th percentile 0.30 to 2.12). Paired gaps are less
  noisy; the ABC and plug-in gaps (0.12 to 0.15 raw) need roughly 20 to 40 paired trials to
  resolve, the 0.04 rows a few hundred.
- A strong agent that builds the exact FSP posterior matches the reference's inference; what
  is left is the design (0.02 to 0.14). That is by design: the point is to see whether agents
  find the exact route at all.
- The reference design is greedy and targets the parameters, not the queries.
- Not tried: continuous priors, more conditions, time-series (non-destructive) measurements.

## Verification status

- `tests/test_lfilab.py`: 22 tests (19 without the tables, 34 s on Modal with them): FSP vs
  the shipped Gillespie simulator (3 conditions, 2 times, 40,000 cells); FSP moments vs the
  exact linear moment equations without feedback (1e-6); truncation bound and leak; feedback
  lowers expression; population-query binomial; simulator extrinsic and capture; determinism
  under seed and salt; seven invalid actions rejected without cost; budget, assay limit,
  reveal order, single submission; prior scores 0, truth scores most; rules JSON; tables vs
  direct FSP (1e-5) and stored constants vs tables; posterior vs direct likelihood on four
  hypotheses; reference beats ABC and the telegraph shortcut on 6 seeds.
- The rendered server (`tasks/lfi/lfi-0/environment/mcp-server/server.py` with its vendored
  `bayesenv`) was run as a local process and driven by a `fastmcp` client: tool list, three
  invalid assays rejected, submission before the reveal rejected, `/grade` and `/table` with a
  wrong token (404), the oracle `solution/play_reference.py` end to end (it fetched the table
  with the solution token, byte-identical to the local one; 48 s), a second submission and an
  assay after the end rejected, `/grade` with the right token (oracle raw 0.917, equal to the
  reference replayed by the server; gap 0).
- Harbor runs: see `docs/RESULTS.md` / the run log once they finish (tmux session `e21` on
  the Harbor VM, jobs `e8-lfi-oracle` and `e8-lfi-opus`).

## Demo use

```python
from bayesenv import lfilab as L

lab = L.LfiLab()                                  # needs data/lfilab_fsp.npz (built on first use)
lab.reset(seed=0, salt="demo")
lab.step({"condition": "standard", "time": 2, "cells": 50})["result"]["counts"]
lab.belief.weights()                              # exact posterior over the 10,000 hypotheses
qs = lab.finish()["queries"]
res = lab.submit(lab.belief.predict(lab.queries))
lab.theta, lab.truth                              # hidden constants and true query answers
```

## Reproduce

```bash
PY="uv run --no-project --with numpy --with scipy --with pytest python"
LFILAB_TABLE=/nonexistent $PY -m pytest -q tests/test_lfilab.py   # fast tests, no tables
R="uv run --no-project --with modal --with numpy --with scipy modal run --env 3-sigma-submission"
$R experiments/lfilab_modal.py::table            # FSP tables -> data/ and the Modal volume
$R experiments/lfilab_modal.py::constants        # bayesenv/lfilab_constants.json
$R experiments/lfilab_modal.py::tests            # all tests, with the tables
$R experiments/lfilab_modal.py::calibrate --seeds 300 --chunk 4    # the table above
$R experiments/lfilab_modal.py::diag --seeds 48 --chunk 4 --set '{"REF_CELLS": 100}'
python scripts/make_lfi_tasks.py --seeds 0:3 --out tasks/lfi
```
