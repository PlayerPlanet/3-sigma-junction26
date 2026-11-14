# LFI lab v2: two species, so the exact route is out of reach in the container

v1 (`docs/LFILAB.md`, tasks `tasks/lfi/lfi-0..2`) was solvable exactly: Opus built the 1-D
finite state projection for all 10,000 hypotheses in about 13 minutes and matched the
reference's inference, checking itself against the disclosed prior predictives. v2 changes
three things:

1. **The feedback acts through a protein**, so the master equation is two-dimensional
   (promoter x mRNA x protein, up to 62,000 states per solve). The grader solves it exactly
   for every hypothesis offline on Modal: 62,208 sparse FSP solves, **57,533 CPU-seconds
   (16 CPU-hours)**. The agent has 2 vCPU for 60 minutes (7,200 CPU-seconds).
2. **More hypotheses**: 24,576 (8 x 8 x 8 x 8 x 6, a disclosed grid with ratio sqrt(2)). After
   200 cells the posterior still spreads over thousands of them (median 2,488 hypotheses hold
   99% of the mass), so pruning to a few hundred loses most of it.
3. **The prior predictive is no longer shown** with the queries (it acted as a correctness
   check for the agent's pipeline). The score still subtracts it internally.

Code: `bayesenv/lfilab2.py`, `bayesenv/lfilab2_sim.py` (the shipped Gillespie simulator),
`bayesenv/lfilab2_constants.json` (internal p0 and C), `experiments/lfilab2_modal.py` (tables,
constants, tuning, calibration, cost analysis, tests), `tests/test_lfilab2.py`,
`templates/lfi2_task/` + `scripts/make_lfi2_tasks.py`, `tasks/lfi2/lfi2-0..2`,
`results/lfilab2_calibration.json`, `results/lfilab2_cost.json`.

## The model, as disclosed by `get_rules`

Only the five rate constants are hidden.

- **State.** Promoter g in {off, on}, mRNA m, protein p; at t = 0 every cell is off, m = p = 0.
- **Reactions.** off -> on at u * k_on / (1 + (p/K)^2); on -> off at k_off; m -> m+1 at
  k_tx * f while on; m -> m-1 at m; p -> p+1 at k_tl * m; p -> p-1 at 0.25 p.
- **Conditions.** standard (u = 1), low_inducer (u = 1/4), feedback_blocked and blocked_low (no
  Hill term). Only the first two can be assayed.
- **Extrinsic noise.** Per cell f = sqrt(2)^j, j = Binomial(4, 1/2) - 2 (as in v1).
- **Readouts.** An assay measures one readout of fresh cells: captured mRNA (each molecule
  with probability 0.2) or captured protein (probability 0.1).
- **Prior.** k_on, k_off in 0.25 * sqrt(2)^i (i < 8), K in 4 * sqrt(2)^i (i < 8, protein
  units), k_tx in sqrt(2)^i (i < 8), k_tl in 0.5 * sqrt(2)^i (i < 6); uniform, independent.
- **Assays.** `run_assay(condition, time, readout, cells)`, time in {1, 2, 4, 8, 16}, at most
  200 cells and 6 assays in total.
- **Queries.** 10 drawn from 192 = 4 conditions x 8 times {1, 2, 3, 4, 6, 8, 12, 16} x 2
  readouts x 3 kinds (one cell's captured count over 10 bins; how many of 100 cells have a
  count >= tau, tau = 1 or 4 for mRNA, 3 or 10 for protein, over 20 bins). Revealed by
  `finish_experiments` with their bins only.
- **Simulator.** `/app/lfisim.py`: `simulate(k_on, k_off, k_tx, K, k_tl, time, n_cells,
  condition, readout, seed)`, exact Gillespie. A 50-cell assay takes about 5 ms
  (overhead-bound); 10,000 cells in one call about 40 ms.

## Reward

As v1: S = mean_k sum_b p*_kb (log q_kb - log p0_kb), raw = S / C, C = 0.37510 (exact over
the grid and the 192 items), score = clip(raw, 0, 1). p* is exact; q is floored at 1e-4; p0 is
the (floored) prior predictive, now internal. No submission scores 0. The raw reward is
right-skewed (reference: 5th / 50th / 95th percentile 0.14 / 0.57 / 2.52; 22% of episodes clip
at 1).

## What is exact

- **Likelihood and truth.** Two-species FSP with scipy's `expm_multiply` on a step-1 time grid
  to t = 16. The mRNA bound is the rigorous Poisson bound of v1. The protein bound starts at a
  heuristic guess and is enlarged until the FSP certificate holds: the truncated solution is a
  lower bound of the true distribution and the missing mass is the leak. Largest leak over all
  62,208 solves: 3.6e-9 (limit 1e-6); largest captured-count mass outside the stored support:
  1.4e-32. The extrinsic factor and the low inducer land on an extended grid, as in v1.
- **Posterior.** Exact finite sum over the 24,576 hypotheses (log-likelihood floored at
  log 1e-37 per cell).
- **Server.** Draws cells from the exact captured-count distribution of the hidden hypothesis
  (the table), and scores against the exact truth from the same table.
- **Approximate:** the reference's design (greedy Monte Carlo information gain, 4 x 50 cells).

## Calibration

240 paired seeds (0 to 239, salt "calibration"; tuning used seeds 100000+ with salt "tune"),
Modal, 125 s wall, 4,700 container-seconds. Inference rows use the reference's data and are
given the EXACT forecasts of the hypotheses they keep (generous: they lose only through
inference). Paired bootstrap 95% intervals. Rows: `results/lfilab2_calibration.json`.

| Policy | raw | score | ref − policy, raw [95% CI] | ref − policy, score [95% CI] |
|---|---|---|---|---|
| Knowing the truth | 1.037 | 0.699 | −0.185 [−0.216, −0.156] | −0.097 [−0.117, −0.079] |
| **Reference**: information-gain design + exact 2-D FSP posterior | **0.852** | **0.602** | 0 | 0 |
| Good SBI: rejection ABC, 200,000 simulations, binned histograms of every assay, Hellinger distance, keep 1,000 | 0.803 | 0.591 | 0.049 [0.027, 0.077] | 0.011 [0.002, 0.019] |
| ABC, mean and variance (20,000 sims, keep 200) | 0.767 | 0.567 | 0.085 [0.058, 0.118] | 0.035 [0.022, 0.049] |
| ABC, mean, variance, zeros, 4 quantiles (20,000 sims) | 0.753 | 0.562 | 0.099 [0.068, 0.136] | 0.040 [0.024, 0.055] |
| Design: steady state (standard, t = 16, alternating readouts) + exact | 0.771 | 0.575 | 0.081 [0.045, 0.120] | 0.027 [0.005, 0.049] |
| Design: random + exact | 0.751 | 0.551 | 0.101 [0.065, 0.141] | 0.051 [0.030, 0.073] |
| Plug-in: exact likelihood, MAP hypothesis only | 0.661 | 0.514 | 0.191 [0.141, 0.244] | 0.088 [0.065, 0.112] |
| 1-D approximation (protein eliminated quasi-statically: exact 1-D mRNA CME with feedback through k_tl m / 0.25, protein Poisson given m), exact Bayes on the grid with it | 0.402 | 0.423 | 0.450 [0.330, 0.579] | 0.179 [0.144, 0.216] |
| Prior | 0 | 0 | 0.852 [0.722, 0.999] | 0.602 [0.564, 0.641] |

Diagnostics after the reference's 200 cells: effective number of hypotheses 872 (median 711);
hypotheses holding 99% of the mass: median 2,488; 99.9%: median 3,756; posterior probability
of the truth 0.005; MAP equal to the truth in 2% of episodes. The reference assays protein in
half of its assays and the low inducer in 16%.

What the table says:

- Every row is below the reference with an interval that excludes 0.
- **Getting the model wrong is the expensive mistake**: the natural "make it 1-D" shortcut
  (eliminate the protein) costs 0.45 raw / 0.18 score, more than any other row. A point
  estimate with the exact likelihood costs 0.19.
- **Good simulation-based inference comes close**: ABC with 200,000 simulations and the full
  binned histograms as summaries is 0.05 raw (0.01 clipped) below the exact reference, while
  ABC on moments loses 0.09 to 0.10. So an innovative agent that does excellent SBI and designs
  well can get within about 0.05 raw of the reference without solving the 2-D CME; clipping
  makes that gap small in the reported score. This row is generous (exact forecasts for the
  accepted hypotheses); an agent must also simulate its forecasts.
- **Design matters more than in v1**: random assays cost 0.10, steady state only 0.08.

## Cost of the exact route for the agent (2 vCPU x 60 min = 7,200 CPU-seconds)

Measured on Modal CPU (one core per solve, scipy `expm_multiply`): mean 0.92 s per solve,
median 0.28 s, 99th percentile 9.7 s, maximum 18.5 s (61,976 states).

| Route | CPU-seconds | vs. the budget |
|---|---|---|
| All 24,576 hypotheses, sharing solves across the extrinsic factor and the low inducer (the smartest full route; it requires noticing that the grids align) | 57,533 | 8.0x |
| Same without the sharing (one solve per hypothesis, extrinsic level and assayable condition: 245,760 solves instead of 55,296) | about 230,000 | about 32x |
| Exact on the 99% posterior set, IF the agent knew it (data conditions only / with the query conditions) | median 3,648 / 6,041; 90th pct 9,429 / 14,056 | 0.5 / 0.8x (median), 1.3 / 2.0x (p90) |
| The same for the 99.9% set | median 5,772 / 8,351 | 0.8 / 1.2x |
| Exact on the 99% set of a cheap first pass (the 1-D approximation, seconds of CPU) | median 2,520 / 3,930 | 0.35 / 0.55x |

But the cheap first pass misses the mass: the 1-D approximation's 99% set captures a median
79% (mean 62%) of the exact posterior; its 99.9% set a median 92% (mean 72%). So the pruned
exact route is feasible only with a first pass that is good enough not to drop the true
posterior region (for example good ABC on histograms, then iterative widening), a solver that
does not waste time, and a correct treatment of the extrinsic mixture, both readouts and the
four query conditions, inside 60 minutes with the agent's own thinking time. That is the
"real cleverness" route; a faster hand-written solver (uniformization or Krylov with reuse
across neighbouring hypotheses) might gain 2 to 3x, which still leaves the full route 3 to
4x over budget. Rows: `results/lfilab2_cost.json` (40 seeds,
`experiments/lfilab2_modal.py::cost`).

## Tuning record

Looked at once on tuning seeds 100000 to 100039 before the calibration (`::diag`): 4 x 50
cells (chosen) against 4 x 25. With 4 x 25 the plug-in gap grew (0.23) but the steady-state
design row became as good as the reference (gap 0.02), so 4 x 50 was kept. Grid, captures,
queries and budget were set before any result was looked at and not changed.

## Verification status

- `tests/test_lfilab2.py`: 12 tests, all passing on Modal with the tables (80 s); 7 run
  locally without them. FSP against the shipped simulator (30,000 cells, two conditions, two
  times, both readouts, extrinsic mixture, TV < 0.02); exact linear moments without feedback
  (1e-6); the truncation certificate enlarges a deliberately small protein bound; the 1-D
  approximation is exact for mRNA without feedback and wrong with it; tables against direct
  solves; determinism, invalid actions, budget, single submission, prior scores 0, no prior
  predictive shown; constants against the model; posterior against direct likelihoods;
  reference above ABC and the 1-D approximation on 4 seeds.
- Rendered server (`tasks/lfi2/lfi2-0`) run locally and driven by a fastmcp client: tools,
  three invalid assays, early submission, wrong tokens (404), the oracle end to end (fetched
  the 362 MB table byte-identical; 85 s), second submission and late assay rejected, `/grade`
  with oracle raw 0.685 = the server's replay of the reference.
- The exact table is NOT in git (362 MB): `experiments/lfilab2_modal.py::table` then `::fetch`
  writes `data/lfilab2_exact.npz`; `scripts/make_lfi2_tasks.py` hard-links it into each task's
  `environment/mcp-server/data/` (git-ignored). A fresh clone cannot build the v2 server
  image without it.

## Reproduce

```bash
R="uv run --no-project --with modal --with numpy --with scipy modal run --env 3-sigma-submission"
$R experiments/lfilab2_modal.py::table          # 62,208 solves, about 16 min wall on 250 containers
$R experiments/lfilab2_modal.py::constants
$R experiments/lfilab2_modal.py::tests
$R experiments/lfilab2_modal.py::calibrate --seeds 240 --chunk 2
$R experiments/lfilab2_modal.py::cost --seeds 40
$R experiments/lfilab2_modal.py::fetch          # data/lfilab2_exact.npz
python scripts/make_lfi2_tasks.py --seeds 0:3 --out tasks/lfi2
```
