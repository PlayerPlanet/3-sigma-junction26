# Diagnostic lab: random testing vs greedy information gain vs exact planning

One finite troubleshooting problem on which three ways of choosing tests are compared
exactly. Engine: `bayesenv/diag.py` (generic, loads any table). Table:
`specs/tables/low_yield.yaml`. Every number below is reproduced by

```bash
uv run --no-project --with numpy --with scipy --with pyyaml python scripts/diag_experiment.py
```

into `results/diag_experiment.json` (single process, about 3.5 minutes on a laptop; no
network, no LLM). Tests: `pytest -q tests/test_diag.py`.

## Honesty first

- **The table is hand-designed to contain the traps.** It was written so that one-step
  planning fails on it, and then adjusted three times after looking at the results (listed
  under "What was tuned"). The numbers in it are illustrative, not measured in a laboratory.
  The result on this table shows that the failure *can* happen and how large it can be, not
  how often it happens.
- How often it happens is the job of the random-table section. Short version: on random
  tables with the same ingredients, plain greedy loses 0.13 to 0.22 nats to exact planning on
  average, but **most of that is because plain greedy ignores cost**. Greedy gain *per unit
  cost* is within 0.03 to 0.05 nats of optimal on the median random table. The large gap
  (0.7 to 0.8 nats) is specific to the designed table and its perturbations.
- Greedy beats random testing on the designed table only narrowly (0.07 nats), and that
  ordering depended on tuning.

## The scenario

A batch gave a third of the expected yield. Exactly one of 9 causes is true (priors 0.24 to
0.04, prior entropy 2.059 nats). There are 15 tests costing 1 to 4 units, each with a noisy
two-valued result, and a budget of 10 units (4 to 6 tests). The agent picks tests one at a
time, then reports a probability for each cause. Reward: `log q(cause*) - log p0(cause*)`,
with `q = 0.999 * submitted + 0.001 * prior` (same convention as `chem_reward`); the prior
scores exactly 0, and the expected reward of an honest reporter is the information gained
about the cause.

Two hidden nuisance states are not asked for but change what tests show (4 combinations,
36 hidden states in total):

- `elution_order` (documented 0.75 / reversed 0.25): the HPLC column was replaced and the two
  marker peaks may elute in the opposite order. **Independent of the cause.**
- `reagent_lot` (in date / past retest): **correlated with the cause** (past retest with
  probability 0.75 if the starting material degraded, 0.35 if the catalyst was poisoned, 0.12
  otherwise), and an old lot makes the colour check read "dark" whatever the cause.

| Test | Role | Cost | One-step gain (nats) | Gain per cost |
|---|---|---|---|---|
| `hplc_reference_standard` | **control** | 1 | **0.0000** | 0.0000 |
| `hplc_crude`, `hplc_mother_liquor`, `hplc_in_process`, `hplc_aqueous_layer` | assay | 2 each | 0.102 to 0.105 | 0.051 to 0.052 |
| `catalyst_metals_assay` | **misleading** | 4 | **0.369** | 0.092 |
| `solvent_water_external_lab` | **misleading** | 4 | **0.310** | 0.078 |
| `thermocouple_audit` | **misleading** | 3 | **0.238** | 0.079 |
| `lot_certificate_review`, `colour_check`, `batch_record_review`, `stirrer_torque_log` | cheap | 1 each | 0.073 to 0.098 | same |
| `repeat_yield_assay`, `operator_interview`, `equipment_inspection` | low value | 2, 2, 3 | 0.005 to 0.059 | 0.003 to 0.020 |

- **The control** reports the elution order (97% accurate). Because the elution order is
  independent of the cause, its result leaves the cause probabilities exactly unchanged: zero
  immediate gain (a test asserts this to 1e-12). It matters because each HPLC assay reports
  "which marker peak is larger" and the peaks are identified by elution order, so the reading
  flips on the new column.
- **The four assays** each split the causes into two groups (95% accurate). Together with the
  control they nearly identify the cause. Read alone, without knowing the elution order, each
  is worth 0.10 nats.
- **The misleading tests** are accurate confirmatory tests for the three most likely causes.
  Each has the highest one-step gain on the menu, but separates one cause from the other
  eight, and two of them use 8 of the 10 budget units.

## Policies

1. **Random**: uniformly among the affordable tests not yet run, until none is affordable.
2. **Greedy**: the affordable test with the highest one-step expected information gain about
   the cause. **Greedy per cost**: the same with gain divided by cost. Both stop if every
   affordable test has zero gain.
3. **Two-step lookahead** (optional extra): first test of the best pair (test, then best
   adaptive second test), re-planned every step.
4. **Exact dynamic programming**: the policy with the highest expected reward.

All of them report the exact posterior at the end.

**Repeats are not allowed.** A test is a property of the retained sample: within an episode
it has one fixed reading, so running it again shows the same result. The lab rejects a repeat
without charging for it.

**Why the DP is exact.** The belief depends only on the set of (test, outcome) pairs seen, so
a state is "which tests, which outcomes". `exact_dp` enumerates every subset of tests whose
total cost fits the budget (4,408 subsets) and every outcome combination of each (147,035
states), and does backward induction over them with no pruning and no sampling; stopping
early is allowed. It takes **0.34 s**. Checks: on small random tables the value equals a plain
recursion over ordered histories without the set trick (`exhaustive_value`); the DP policy,
evaluated independently by enumerating its outcome sequences, achieves the DP value to
1e-10; the simulation below agrees.

## Results on the designed table (budget 10)

Exact expectations (enumeration of every outcome sequence; for random, an exact recursion
over the same state space):

| Policy | Expected reward (nats) | Accuracy of the top cause | Tests run | Runs the control | Catalyst assay | Solvent lab | Thermocouple audit |
|---|---|---|---|---|---|---|---|
| Random | 0.764 | 0.546 | 5.27 | 0.43 | 0.26 | 0.26 | 0.29 |
| Greedy | 0.832 | 0.593 | 3.57 | **0.00** | **1.00** | **1.00** | 0.00 |
| Greedy per cost | 0.911 | 0.633 | 5.57 | 0.30 | 0.91 | 0.00 | 0.59 |
| Two-step lookahead | 1.224 | 0.740 | 4.80 | 0.80 | 1.00 | 0.00 | 0.00 |
| **Exact DP** | **1.620** | **0.861** | 6.00 | **1.00** | **0.00** | **0.00** | **0.00** |

The last four columns are the probability that the policy runs that test.

Paired simulation, 20,000 seeds through `DiagLab` (the same seed gives the same hidden state
and the same reading for each test under every policy), bootstrap 95% intervals:

| Policy | Simulated mean [95% CI] | Exact | Exact inside CI |
|---|---|---|---|
| Random | 0.761 [0.747, 0.774] | 0.764 | yes |
| Greedy | 0.819 [0.805, 0.833] | 0.832 | yes |
| Greedy per cost | 0.911 [0.897, 0.926] | 0.911 | yes |
| Two-step lookahead | 1.209 [1.194, 1.224] | 1.224 | yes |
| Exact DP | 1.615 [1.600, 1.630] | 1.620 | yes |

| Paired difference | Simulated [95% CI] | Exact |
|---|---|---|
| DP − greedy | +0.796 [+0.776, +0.817] | +0.788 |
| Greedy − random | +0.058 [+0.042, +0.076] | +0.068 |
| DP − greedy per cost | +0.704 [+0.685, +0.722] | +0.709 |
| DP − two-step lookahead | +0.406 [+0.392, +0.419] | +0.396 |

### What the policies do

DP, first two steps (the third test is `hplc_mother_liquor` in every branch):

```
run hplc_reference_standard (cost 1)
  if documented_order (p=0.74):  run hplc_crude -> next: hplc_mother_liquor
  if reversed_order   (p=0.27):  run hplc_crude -> next: hplc_mother_liquor
```

DP always runs the control first, then all four assays (9 units), then one cheap check
chosen by what it has seen (`batch_record_review` 0.43, `lot_certificate_review` 0.28,
`stirrer_torque_log` 0.16, `colour_check` 0.13). It never runs a misleading or a low-value
test. The order of the first tests is not informative by itself (any order of the same set
gives the same belief); what matters is the set.

Greedy:

```
run catalyst_metals_assay (cost 4)
  then solvent_water_external_lab (cost 4) whatever the result
    then, with 2 units left: two cheap checks (0.57) or a single assay (0.43)
```

It never runs the control. Greedy per cost starts with the four cheap checks, then usually
the catalyst assay; it runs the control in 30% of episodes, too late to use it well.

### Where the gap comes from (exact expected rewards with tests removed from the menu)

| Menu | DP | Greedy | Greedy per cost | Random |
|---|---|---|---|---|
| Full | 1.620 | 0.832 | 0.911 | 0.764 |
| Without the control | 1.394 | 0.832 | 0.881 | 0.688 |
| Without the three misleading tests | 1.620 | **1.620** | 1.261 | 0.850 |
| Without the control and the assays | 0.868 | 0.839 | 0.847 | 0.589 |
| Without the three low-value tests | 1.620 | 0.832 | 0.911 | **0.975** |

- **Value of the control: 0.226 nats** (1.620 − 1.394), for a test whose immediate gain is
  exactly zero. That is 29% of the DP − greedy gap, not all of it: without the control the
  four assays still partly calibrate each other (two assays that disagree in a
  cause-independent way reveal the elution order).
- **The misleading tests are what breaks greedy.** Remove them and greedy equals the optimum
  to four decimals: it starts with an assay, then the control becomes the best next step.
  Their presence does not change the optimum at all (DP never uses them at this budget).
- Greedy per cost is broken by something else as well: with the misleading tests removed it
  is still 0.36 below DP, because it spends the first 4 units on cheap checks.
- Without the control and assays, all planning is nearly worthless (DP − greedy = 0.03): the
  whole gap runs through the nuisance-dependent tests.
- Without the low-value tests, **random (0.975) beats greedy (0.832)**. See "Weak points".

### Budget sweep (exact)

| Budget | Random | Greedy | Greedy per cost | Two-step | DP | DP − greedy | Tests run by DP |
|---|---|---|---|---|---|---|---|
| 8 | 0.602 | 0.657 | 0.744 | 0.869 | 1.406 | 0.749 | 5.00 |
| 9 | 0.683 | 0.751 | 0.799 | 1.094 | 1.569 | 0.818 | 5.00 |
| 10 | 0.763 | 0.832 | 0.911 | 1.224 | 1.620 | 0.788 | 6.00 |
| 11 | 0.843 | 0.873 | 0.989 | 0.998 | 1.654 | 0.781 | 6.76 |
| 12 | 0.919 | 0.964 | 1.057 | 1.125 | 1.681 | 0.717 | 7.07 |

The ordering random < greedy < DP holds at every budget; the gap to DP is 0.72 to 0.82. Two-
step lookahead is not monotone in the budget (worse at 11 than at 10): a short horizon is
unreliable here, not a cheap substitute. At budgets 11 and 12 DP runs about 7 tests, one
more than the 4 to 6 range.

## Random tables: is this a property of one table?

Three families; DP, greedy, greedy per cost and random evaluated exactly on each table, at
the table's own budget.

**A. `random_table` (200 tables, seed 20261114).** No tuning, same ingredients. 8 causes,
prior ~ Dirichlet(2). Nuisance A binary, independent of the cause, P(A=1) ~ U(0.2, 0.5).
Nuisance B binary, P(B=1 | cause) ~ U(0.05, 0.3), and U(0.5, 0.85) for two random causes.
11 tests: a control reporting A (accuracy U(0.9, 0.99), cost 1); 4 instrument tests (random
split of the causes into 2 or 3 groups, accuracy U(0.8, 0.95), **group label shifted by one
if A=1**, cost 1 to 3); 2 tests whose reading is washed out when B=1; 1 check of B; 3
one-vs-rest tests for the three most probable causes (cost 2 to 4). Budget = 5 × mean cost.

**B. The same with `instrument_effect="noise"` (200 tables, seed 20261116):** A=1 only makes
the instrument tests noisier; it does not change what a reading means.

**C. `jitter_spec` (100 tables, seed 20261115):** the designed table with independent
Normal(0, 0.35²) noise on the log of every probability in it (priors, nuisance probabilities,
every test row). Same structure, costs and budget.

| | A: random, label shift | B: random, noise only | C: designed table, perturbed |
|---|---|---|---|
| Mean reward: random / greedy / per cost / DP | 0.97 / 1.18 / 1.33 / 1.40 | 0.89 / 1.14 / 1.21 / 1.26 | 0.75 / 0.88 / 1.05 / 1.59 |
| **DP − greedy**: mean / median | 0.221 / 0.196 | 0.128 / 0.119 | 0.709 / 0.720 |
| share of tables > 0.05 nats | 90% | 92% | 100% |
| share of tables > 0.2 nats | 48% | 14% | 100% |
| share essentially 0 (< 0.005) | 0% | 0% | 0% |
| **DP − greedy per cost**: mean / median | 0.064 / 0.031 | 0.057 / 0.050 | 0.534 / 0.585 |
| share of tables > 0.05 nats | 38% | 50% | 90% |
| share of tables > 0.2 nats | 8% | 0% | 87% |
| share essentially 0 (< 0.005) | 3% | 0% | 3% |
| Greedy − random: mean | 0.202 | 0.243 | 0.126 |
| share of tables with greedy below random | 12% | 0% | 7% |
| P(control is run): DP / greedy | 0.92 / 0.44 | 0.93 / 0.25 | 0.99 / 0.08 |

Reading:

- **Plain greedy is clearly suboptimal on random tables too** (median 0.12 to 0.20 nats, 9 to
  14% of the DP reward), and it is never essentially optimal. But compare families A and B
  and the per-cost row: most of this is cost blindness. It is a budgeted problem and plain
  greedy does not look at prices.
- **Greedy per cost is close to optimal on the typical random table**: median gap 0.03 nats
  with label-shifting nuisances, 0.05 with noise-only nuisances. A gap above 0.2 nats occurs
  on 8% of family A and on none of family B. So the large failure of one-step planning is
  **not** generic; it needs a nuisance that changes the *meaning* of readings together with
  tests that are tempting one step ahead.
- The designed table is not a knife edge: under 35% log-noise on every probability the gap to
  plain greedy stays above 0.5 nats on 90% of tables. Greedy per cost recovers on about 10%
  of the perturbed tables (10th percentile of the gap 0.10).
- DP runs the control on more than 90% of episodes in every family; greedy much less often.

## Verdict

On the designed table the experiment shows what it was built to show. Exact planning gets
1.62 of the 2.06 nats available, greedy 0.83, random 0.76; DP − greedy is 0.79 nats (CI
[0.78, 0.82]) and 27 points of accuracy, at every budget from 8 to 12. The cause is
identified by ablation, not asserted: greedy takes the two most expensive confirmatory tests
in every episode and the control in none; DP does the opposite; removing the misleading tests
makes greedy exactly optimal; removing the control costs DP 0.23 nats although its immediate
gain is zero.

### Weak points

1. **Greedy − random is small** (0.07 nats, CI [0.04, 0.08]) and fragile. In the first
   12-test draft random was *ahead* of greedy; three low-value tests were added to the menu
   and that is what put random behind (without them random scores 0.975). A greedy policy
   that is trapped is, almost by definition, not much better than chance. "Random < greedy <
   DP with clear gaps" is true only for the second gap.
2. **The control explains 29% of the gap, not all of it.** The larger part is that greedy
   never gets to the assays at all.
3. **The trap is the textbook one** (tests that are only informative jointly) wrapped in a
   laboratory story. The table has 0.25 probability of a reversed elution order and perfectly
   mirrored readings; nobody has checked this against a real instrument.
4. **On untuned random tables the per-cost variant of greedy is near-optimal** (median gap
   0.03 to 0.05 nats). Anyone arguing that planning beats greedy in general cannot use this
   experiment; it supports "there are realistic-looking structures where it does, by a lot".
5. All policies report the exact posterior, so this measures test selection only. Nothing
   here says how an LLM agent behaves; no agent was run.
6. Two-outcome tests only in the designed table; 9 causes; one budget unit scale. Exact DP is
   easy at this size (0.34 s) and grows fast: 447,643 states at budget 12.

### What was tuned

1. Draft 1 (12 tests, reversed-order probability 0.4, assay accuracy 0.93): DP 1.48, greedy
   0.84, random 0.89. Random beat greedy.
2. Added three low-value tests (15 tests) and raised assay accuracy to 0.95: random 0.73,
   greedy 0.84, DP 1.61. But removing the misleading tests did not help greedy (0.82), so the
   misleading tests were not the cause of its failure: the assays' one-step gain was 0.016,
   below everything else.
3. Lowered the reversed-order probability from 0.4 to 0.25, which raises an assay's one-step
   gain to 0.10 (above the cheap checks, below the misleading tests). Now greedy without the
   misleading tests is optimal. This is the committed table.

## Writing your own table

A domain expert needs only YAML; no Python. Put it in `specs/tables/<name>.yaml`.

```yaml
name: my_problem
description: one paragraph shown to the agent
budget: 10                     # in the same units as the test costs

causes:                        # exactly one is true; priors sum to 1
  cause_a: {prior: 0.6}
  cause_b: {prior: 0.4}

nuisances:                     # hidden, not asked for; optional
  instrument:
    states: [ok, drifted]
    prob: [0.8, 0.2]           # the same for every cause => independent of the cause
  lot:
    states: [fresh, old]
    prob: [0.9, 0.1]           # default ...
    given_cause:               # ... overridden for some causes => correlated with the cause
      cause_b: [0.4, 0.6]
  # or, to tie a nuisance to an earlier one:
  #   given_nuisance: {instrument: {drifted: [0.5, 0.5]}}

tests:
  assay_1:
    cost: 2
    role: assay                # free text, used only for reporting
    outcomes: [low, high]
    default: [0.9, 0.1]        # P(outcome) unless a row below matches
    rows:                      # later rows override earlier ones
      - when: {cause: cause_b}                       # a name or a list of names
        p: [0.1, 0.9]
      - when: {cause: cause_b, instrument: drifted}  # all conditions must hold
        p: [0.9, 0.1]
```

A test is a pure control (zero immediate gain) if its rows mention only a nuisance that is
independent of the cause.

```python
from bayesenv import diag as D
tb = D.load_table("my_problem")
dp = D.exact_dp(tb)                                  # .value, .n_states, .seconds, .policy
D.evaluate_policy(tb, D.greedy_policy)               # exact reward, accuracy, P(each test run)
D.evaluate_policy(tb, dp.policy); D.evaluate_random(tb)
[D.info_gain(tb, tb.joint, t) for t in range(tb.T)]  # one-step gains
```

## Demo use

```python
from bayesenv import diag as D
lab = D.DiagLab("low_yield")
obs = lab.reset(seed=3, salt="demo")        # rules, tests, costs, budget, prior
out = lab.step("hplc_reference_standard")   # {"result", "budget_remaining", "posterior"}
out = lab.step("hplc_crude")                # "posterior" is the exact cause posterior: bar chart
res = lab.submit(lab.exact_posterior())     # reward, design, inference, accuracy, hidden
lab.posteriors, lab.joints, lab.history     # per-step exact posteriors for plotting
```

Hidden draws go through `chem_lab.salted_key(seed, salt, tag)`. Unknown, repeated and
unaffordable tests raise `ValueError` and cost nothing; a second submission raises
`RuntimeError`.

## Limits

- The reference (DP) is exact, but only for tables this small. Number of states = sum over
  affordable test subsets of the product of their outcome counts.
- The Harbor task (below) has been checked as a local process only; no Docker build and no
  `harbor run` has been done yet.
- The rules given to an agent (`rules(table)`) contain the full table, including the nuisance
  model. An agent that can code can run the same DP; as with the chemistry lab, this lab
  alone does not make a hard task for a coding agent.

## Harbor task (`tasks/diag/diag-0..4`)

The same table with seeds 0 to 4, packaged like the chemistry lab: `templates/diag_task/`,
rendered by `scripts/make_diag_tasks.py` (also called from `scripts/render_tasks.sh`). The
hidden cause, the nuisance state and every test reading come from the seed and a salt that is
random per trial and never leaves the server container, so a trial cannot be recomputed from
the public code.

```bash
python scripts/make_diag_tasks.py --seeds 0:5 --out tasks/diag
harbor run -p tasks/diag -a oracle            # exact DP through the MCP tools
```

The question the task is built to answer: given the complete model, does an agent choose
tests by looking ahead (run the control first, leave the expensive confirmatory tests alone),
or one step at a time?

**What the agent gets.** Three MCP tools on the server `diag-lab`:

- `get_rules`: the complete table (`diag.task_rules`). Every cause and prior, the nuisance
  variables and `P(nuisance state | cause)`, every test with its cost, its outcomes and
  `P(outcome | cause, nuisance state)` as a full array, the budget, the protocol (one reading
  per test, each test once, rejected actions are free, stopping early is allowed) and the
  scoring rule. It does not contain the `role` tags of the table file, and neither the rules
  nor the instruction say anything about strategy.
- `run_test(name)`: the reading and the budget left. Unknown, repeated and unaffordable tests
  are rejected without cost.
- `submit_posterior({cause: probability})`: once.

**Score** (`/logs/verifier/reward.txt`): `clip(reward / max_reward, 0, 1)`, with
`reward = log q(c*) - log p0(c*)` (q mixed with 0.1% of the prior) and `max_reward` the reward
of probability 1 on the true cause. No submission, or the prior, scores 0. The score is per
episode and noisy: exact DP itself averages 1.62 nats, and on a single draw it can be beaten
by greedy (7 of 40 draws in a quick check). Compare `gap_to_dp` over several seeds and trials, and read the
behaviour fields, which do not depend on luck.

**Reading `/logs/verifier/details.json`** (`diag.grade`, computed in the server):

| Field | Meaning |
|---|---|
| `score`, `reward`, `max_reward`, `accuracy`, `submitted` | the 0-1 score, the raw reward in nats, its maximum for this cause, whether the argmax is right, whether anything was submitted |
| `tests_run` | ordered list of `{step, test, cost, reading, role}` |
| `n_tests`, `budget`, `budget_used`, `budget_remaining` | spending |
| `control_run`, `control_step`, `control_tests` | whether the control (`role: control` in the YAML) was run, and at which step (1 = first; `null` = never) |
| `misleading_run`, `misleading_run_names`, `misleading_tests` | how many of the three `role: misleading` tests were run |
| `exact_posterior`, `submitted_posterior` | the exact posterior given the agent's own tests, and what it submitted |
| `design` | `log p(c* | own tests) - log p0(c*)`: what the chosen tests were worth |
| `inference` | `log q(c*) - log p(c* | own tests)`: loss from turning readings into probabilities; `design + inference = reward` |
| `dp_reward`, `dp_tests`, `dp_score` | exact DP on the same hidden draw (same cause, nuisance state and readings) |
| `greedy_reward`, `greedy_tests`, `greedy_score` | greedy information gain on the same draw; `greedy_per_cost_*` likewise |
| `gap_to_dp`, `gap_to_greedy` | agent's reward minus the reference's (negative = worse) |
| `design_gap_to_dp`, `design_gap_to_greedy` | the same with `design` in place of `reward`: test choice only |
| `dp_expected_reward`, `greedy_expected_reward` | exact expectations over all draws (1.620 and 0.832) |
| `hidden_cause`, `hidden_nuisance` | the truth |

How to read a run. A planner runs the control and the four HPLC assays, no misleading test,
and has `design_gap_to_dp` near 0 on average. DP runs the control first, but only the set of
tests matters for the final belief, not their order, so a late control is not a mistake by
itself. A one-step chooser never runs the control (it has zero immediate information about
the cause), starts with two misleading tests, and tracks `greedy_tests`. `inference` near 0 (about -0.001 from the mixing) means the
submitted probabilities are the exact posterior; a clearly negative value is an inference
error, separate from test choice.

**Checked locally** (`tests/test_diag_task.py`): the posterior recomputed from the rules JSON
alone equals the engine's; a table rebuilt from the rules gives the same DP; the rules and the
instruction contain no role tags and no strategy words; the grader's fields; and, with the
rendered `server.py` running as a local process and a real MCP client, a do-nothing episode
(score 0), rejected actions, the budget, the single submission, and the oracle program from
`solution/solve.sh` (score equal to `dp_score`, same tests as `dp_tests`). Not checked: the
Docker build, `tests/test.sh` inside Harbor, and any LLM agent.
