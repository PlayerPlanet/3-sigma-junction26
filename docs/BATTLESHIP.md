# Rulebound Battleship: the wet lab with the domain swapped

A 6x6 board hides three ships (lengths 4, 3, 2). They were placed by one of six public
placement rules. The agent spends a budget of noisy shots and scans, then reports calibrated
beliefs about the rule and about every cell. It is a small, fully exact instance of the same
problem as the wet lab: identify a hidden mechanism and its parameters from a few expensive,
noisy experiments.

| Wet lab | Rulebound Battleship |
|---|---|
| hidden mechanism | hidden placement rule (6, uniform prior) |
| rate constants | exact ship positions (53,624 layouts) |
| running an experiment | `fire(row, col)` (cost 1) or `scan(axis, index)` (cost 2) |
| assay noise | fire reports flipped with p = 0.1; scan counts off by one with p = 0.3 |
| limited stock | budget of 20 |
| submitted posterior over mechanisms | probability for each rule + probability for each cell |

Files: `bayesenv/battleship.py` (engine, exact posterior, reference, policies, leak test),
`templates/battleship_task/` (Harbor task), `scripts/make_battleship_tasks.py`,
`scripts/battleship_calibrate.py`, `scripts/battleship_report.py`, `scripts/battleship_ui.py`,
`baselines/battleship_baselines.py`, `tests/test_battleship.py`,
`results/battleship_calibration.json`.

## The game, as `get_rules` gives it to the agent

Ships are horizontal or vertical and never overlap. The six rules (number of layouts that
satisfy each, out of 53,624):

| Rule | Definition | Layouts |
|---|---|---|
| `any` | no constraint | 53,624 |
| `no_touch` | no two ships touch, not even diagonally | 11,520 |
| `parallel` | all ships have the same orientation | 15,960 |
| `border` | every ship has a cell on the outer edge | 16,864 |
| `center_clear` | no ship covers the four centre cells | 19,208 |
| `clustered` | every ship touches at least one other ship (corners count) | 14,848 |

Generative model, disclosed in full: the rule is drawn uniformly; the layout is drawn
uniformly from the layouts that satisfy it; each action's noise is independent. Rules overlap
(a layout can satisfy several), so identifying the rule requires the size principle: a
restrictive rule that fits the data gains probability over `any`. `get_rules` also gives the
prior probability of every cell and the exact scoring formula. Nothing is withheld except the
drawn rule, the layout and the noise, so the "no withheld information" criterion holds by
construction.

## Everything is exact

The hidden state is (rule, layout), about 132,000 pairs, so the following are exact
(enumeration, no Monte Carlo), and each is checked against a brute-force computation in
`tests/test_battleship.py`:

* the posterior over rules and the probability of every cell, given any set of reports;
* the expected information gain of every action (equal to the mutual information computed
  directly, to 1e-9);
* the design / inference split of every agent's loss;
* the posterior predictive leak test.

## Reward: proper, prior = 0, public normalisers

With q the submission mixed with 0.1% of the public prior:

    rule_part = [log q(true rule) - log(1/6)] / log 6
    cell_part = sum over cells [log q_cell(true state) - log p0_cell(true state)] / 20.124
    score_raw = (rule_part + cell_part) / 2

20.124 nats is the total entropy of the prior cell probabilities. Both normalisers are public
constants that do not depend on the hidden state. That matters: dividing by a quantity that
depends on the truth (such as the per-episode value of knowing it) turns the log score into a
weighted score that is no longer proper. Here `score_raw` is an affine transform of the log
score, so:

* reporting the exact posterior maximises the expected score (tested against sharpened,
  flattened, prior and random reports);
* submitting the prior scores exactly 0, so doing nothing earns nothing;
* knowing the truth scores about 1 in expectation (tested exactly over the prior);
* confident mistakes score below 0.

**Per-trial clipping.** Harbor needs one number in [0, 1] per trial, so `reward.txt` is
`clip(score_raw, 0, 1)`. Clipping hides losses below 0, which favours gambling: a confident
guess loses nothing when wrong. The table below measures it: putting all probability on one
rule with no shots earns 0.096 on the clipped scale (against 0.540 for the reference) and
-1.460 unclipped. Two consequences:

* `scripts/eval.sh` runs a gamble baseline next to do-nothing and stop-early on battleship
  tasks, so judges see the attack already tried.
* `scripts/battleship_report.py` reports the unclipped mean with a confidence interval for
  every job. That is the number to compare agents on; the clipped mean understates how badly
  overconfident agents do (the noise-ignoring coder: 0.390 clipped, 0.085 unclipped).

## Reference policy

Greedy: at every step it takes the affordable action with the largest expected information
gain about the hidden state per unit of budget, then submits the exact posterior. It is
myopic, so it is not the Bayes-optimal adaptive policy; an agent that plans ahead can beat it
(a positive gap is possible and allowed). The Harbor oracle (`solution/solve.sh`) plays it
through the same MCP tools as the agent, without access to the hidden state; run in-process
and through MCP it gives identical scores.

## Calibration (400 paired seeds, salt "calibration")

`python scripts/battleship_calibrate.py --seeds 400` (about 6 minutes on 2 cores) writes
`results/battleship_calibration.json`. All policies play the same 400 hidden boards; CIs are
bootstrap 95%. "Design" is the score of the exact posterior given the policy's own shots;
"inference" is its score minus that (0 for exact Bayes).

| Policy | What it does | Unclipped score [95% CI] | Harbor score | Rule acc. | Design | Inference | Reference minus policy [95% CI] | Leak flag (1 ep.) | Leak flag (30 ep.) |
|---|---|---|---|---|---|---|---|---|---|
| `reference` | greedy information per shot + exact posterior | 0.533 [0.509, 0.556] | 0.540 | 0.48 | 0.533 | 0.000 | 0.000 [0.000, 0.000] | 0.04 | 0.07 |
| `fires_only` | greedy, fires only + exact posterior | 0.394 [0.369, 0.420] | 0.412 | 0.42 | 0.394 | 0.000 | 0.139 [0.110, 0.167] | 0.04 | 0.06 |
| `random_design` | random actions + exact posterior | 0.294 [0.273, 0.313] | 0.305 | 0.36 | 0.294 | 0.000 | 0.239 [0.212, 0.265] | 0.04 | 0.09 |
| `hunter_design` | human hunt/target shots + exact posterior | 0.337 [0.315, 0.358] | 0.351 | 0.38 | 0.337 | 0.000 | 0.196 [0.171, 0.220] | 0.04 | 0.05 |
| `noise_ignoring_coder` | reference shots, treats reports as exact | 0.085 [-0.011, 0.173] | 0.390 | 0.41 | 0.533 | -0.448 | 0.448 [0.372, 0.532] | 0.03 | 0.06 |
| `no_occam_coder` | reference shots, every layout equally likely a priori | 0.490 [0.465, 0.513] | 0.500 | 0.17 | 0.533 | -0.043 | 0.043 [0.029, 0.057] | 0.05 | 0.03 |
| `naive_human` | human shots + treats reports as exact | -0.096 [-0.188, -0.000] | 0.282 | 0.38 | 0.337 | -0.433 | 0.629 [0.537, 0.715] | 0.06 | 0.04 |
| `do_nothing` | submit the prior | 0.000 [0.000, 0.000] | 0.000 | 0.16 | 0.000 | 0.000 | 0.533 [0.509, 0.556] | 0.04 | 0.06 |
| `stop_early` | one shot, then exact posterior | 0.035 [0.028, 0.042] | 0.047 | 0.21 | 0.035 | -0.000 | 0.498 [0.474, 0.521] | 0.04 | 0.06 |
| `gamble_one_rule` | no shots, all mass on one rule | -1.460 [-1.557, -1.363] | 0.096 | 0.19 | 0.000 | -1.460 | 1.993 [1.900, 2.091] | 0.07 | 0.06 |
| `overconfident` | reference, beliefs sharpened (power 3) | 0.363 [0.307, 0.420] | 0.484 | 0.48 | 0.533 | -0.169 | 0.169 [0.135, 0.206] | 0.05 | 0.04 |
| `hedge` | reference, beliefs flattened (power 0.5) | 0.472 [0.456, 0.487] | 0.473 | 0.48 | 0.533 | -0.061 | 0.061 [0.050, 0.071] | 0.04 | 0.05 |
| `act_certain_map` | reference, one-hot MAP rule and layout | -0.702 [-0.840, -0.566] | 0.333 | 0.48 | 0.533 | -1.235 | 1.235 [1.116, 1.356] | 0.05 | 0.06 |
| `cheat_blend_10pct` | posterior blended with 10% of the truth | 0.632 [0.616, 0.648] | 0.632 | 0.67 | 0.533 | 0.099 | -0.099 [-0.108, -0.091] | 0.68 | 1.00 |
| `cheat_5_hidden_shots` | 5 extra shots the grader never saw | 0.561 [0.539, 0.584] | 0.565 | 0.52 | 0.533 | 0.028 | -0.028 [-0.040, -0.017] | 0.10 | 0.66 |
| `cheat_full` | submits the truth | 0.999 [0.998, 1.000] | 0.995 | 1.00 | 0.533 | 0.466 | -0.466 [-0.491, -0.443] | 0.68 | 1.00 |

What it shows:

1. **Every honest policy and every attack that uses only legitimate information scores below
   the reference**, with confidence intervals that exclude 0, on both scales. No strategy that
   avoids the task comes close: do-nothing 0, stop-early 0.047, gamble 0.096 (clipped) against
   0.540.
2. **Both decisions matter, and the split says which one failed.** Design alone (exact
   inference, worse shots) costs 0.14 to 0.24. Inference alone (the reference's shots,
   mistaken updating) costs 0.04 to 1.24. Ignoring the stated noise is the costliest realistic
   bug: one flipped report rules out the true rule or the true ship, and the log score
   punishes the certainty (0.448 below the reference). Skipping the size principle costs 0.043
   in score but drops rule accuracy from 0.48 to 0.17.
3. **Scans are a real resource decision.** The same greedy rule restricted to fires scores
   0.139 lower: knowing when a row count is worth two shots is part of the skill.
4. **The leak test is calibrated and catches cheaters.** Honest and gaming policies are
   flagged at about the nominal 5% per episode and per batch. Any blend of the truth is
   flagged in every 30-episode batch; five hidden extra shots (worth only +0.028) in 66% of
   batches.

## Leak test (exact)

For a submission q made from data D, let T(state) = score(q, state) - score(p(.|D), state).
If q used only D, the true state is a draw from the exact posterior p(state | D), so
P(T(state) >= T(true state)) under that posterior is uniform. Ties are broken with an
independent U(0, 1) draw so the p-value is exactly uniform, not just approximately. The sum
over all (rule, layout) pairs is exact. Per episode it is reported as `ppc_p`; over a batch
`scripts/battleship_report.py` runs a two-sided KS test of the p-values against uniform,
which also catches cheaters who avoid small p-values on purpose (see RESULTS.md, E6b).

## Harbor task

```bash
python scripts/make_battleship_tasks.py --seeds 0:5 --out tasks/battleship
harbor run -p tasks/battleship -a oracle                     # reference
TASK=tasks/battleship SKIP_AGENT=1 ./scripts/eval.sh         # reference + do-nothing + stop-early + gamble
TASK=tasks/battleship MODEL=<provider/model> ./scripts/eval.sh
```

Tools: `get_rules`, `fire(row, col)`, `scan(axis, index)`, `submit_beliefs(rules, occupancy)`.
The board lives in the `mcp-server` container, salted per trial; the grader endpoint is behind
a per-task bearer token that is not in the agent's container. The grade (in
`/logs/verifier/details.json`) includes the full trajectory, the exact posterior after every
action, the truth and the reference run on the same board, for replay in the UI.

Checked locally without Docker (the sandbox could not pull images): the server, the oracle's
MCP play (identical score to the in-process reference), the verifier script, the stop-early and
gamble baselines, and MCP-level attacks (out-of-range and malformed actions, overspending the
budget, invalid or repeated submissions) are all rejected without consuming budget. A full
`harbor run` on Docker still needs to be done.

## UI

```bash
python scripts/battleship_ui.py      # http://localhost:8050
```

* **Play**: click cells to fire, arrows to scan, toggle the exact posterior (heat map and rule
  bars), let the reference move, then submit the exact posterior, a noise-ignoring belief, an
  overconfident one or the prior, and see the board, the score and its split.
* **Replay**: any Harbor trial under `jobs/` step by step next to the reference on the same
  board, or an offline demo (seed 39 is a good one: one flipped report makes the noise-ignoring
  player rule out the true rule entirely).

## Not done / open

* **No language-model agent has played this yet**, so the frontier gap is unmeasured. The
  proxies above say where agents can lose. A coding agent that enumerates layouts, models the
  noise, applies the size principle and picks actions by information gain including scans
  could match the reference. The first pilot: `TASK=tasks/battleship MODEL=... AGENT_RUNS=2
  ./scripts/eval.sh`.
* The reference is greedy, not optimal; the gap to an optimal planner is unknown.
* The open-world variant (a disclosed "other" rule outside the list) is not built yet; the
  machinery (exact posterior, proper score, leak test) supports it directly.
