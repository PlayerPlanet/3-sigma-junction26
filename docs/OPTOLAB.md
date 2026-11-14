# Light switch: map a hidden neural circuit with optogenetics

The 2026 Nobel Prize in Physiology or Medicine went to Deisseroth, Hegemann and Nagel for
channelrhodopsin and optogenetics. Before optogenetics, brain mapping could correlate activity
with behaviour but could not prove causal relationships; optogenetics lets you switch a chosen
cell population on or off. This lab turns that into an RL task. A hidden circuit over four
neuron populations and a behavioural readout is drawn from a fully disclosed prior. Under a cost
budget the agent records passively, expresses opsins in chosen populations of new animals and
runs light sessions, with the imperfections of real optogenetics: light efficacy follows a Hill
curve in intensity with a hidden per-animal expression level, and strong light heats tissue and
makes the animal press the lever. It then forecasts the effect of IDEAL interventions,
including combined silencing of pairs it may never have silenced together. Everything is exact,
by enumeration.

It is the DAG lab (`bayesenv/dagnet.py`, `docs/DAGNET.md`) with optogenetics semantics on top:
same DAG enumeration, Beta-Bernoulli tables, salted seeds, exact posterior predictive, reward
convention and Harbor packaging.

Code: `bayesenv/optolab.py`, `scripts/optolab_calibrate.py`, `tests/test_optolab.py`,
`templates/opto_task/` + `scripts/make_opto_tasks.py` (Harbor), `tasks/opto/opto-0..4`,
`results/optolab_calibration.json`.

## The model, exactly as disclosed by `get_rules`

Only the particular circuit, its tables and the animals' expression levels are hidden.
`get_rules` returns this JSON verbatim (from `bayesenv.optolab.rules()`):

- **Nodes.** VTA, NAc, PFC, BLA (populations) and LEVER (lever press), binary per trial.
- **Population graph.** Uniform over all 543 DAGs on the 4 labelled populations.
- **Population tables.** theta[i, c] = P(i active | inputs = c) ~ Beta(0.5, 0.5), independent
  per input configuration.
- **LEVER inputs.** LEVER has no outputs; each population is an input independently with
  probability 1/2 (16 equally likely input sets), independent of the population graph.
- **LEVER table.** No inputs: P(press) ~ Beta(0.5, 0.5). At least one input: with probability
  0.7 an OR gate, P(press) = 0.95 if any input is active and 0.02 if none is; otherwise a free
  table with Beta(0.5, 0.5) entries.
- **record** (cost 1): passive imaging of a naive animal, 4 natural trials, all 5 nodes seen.
- **express** (cost 3 for one population, 4 for two): a new animal with ChR2 (clamps to 1) or
  ArchT (clamps to 0) in one or two populations (same opsin). At most 5 animals. No data.
- **light** (cost 1): 4 trials on one of your animals at intensity I in {1, 3, 10, 30} mW/mm^2;
  all 5 nodes seen, including the illuminated ones.
- **Expression level** of every injection: low / medium / high with prior 0.3 / 0.4 / 0.3,
  independent across injections, fixed for the animal's life.
- **Efficacy.** On each light trial each illuminated population is independently clamped with
  probability e = I^2 / (I^2 + K^2), K = 10 (low), 3 (medium), 1 (high); otherwise it follows
  its table. The rules include the table of e. The agent never sees whether a clamp took.
- **Heating artefact.** On each light trial, independently, with probability h(I) LEVER reads
  1 whatever its inputs: h = 0, 0, 0.3, 0.7 at I = 1, 3, 10, 30. Populations are not affected.
- **Budget** 12. Invalid actions are rejected and cost nothing.
- **Queries** (revealed by `finish_experiments`, each with its prior predictive value), drawn
  independently of the circuit and the experiments: 6 of the 8 P(LEVER | do(P = v)), all 6
  combined-silencing P(LEVER | do(P = 0, Q = 0)), 4 of the 24 P(T | do(P = v)) and 4 of the 48
  P(T | do(P = v, Q = w)) with T a population. do() is an ideal clamp.

The trade-offs the agent faces: records are cheap but only correlational; an animal is
expensive and its expression level is unknown; weak light rarely takes control (low expression
needs I = 10 or 30 for e >= 0.5), strong light makes LEVER data mostly artefact (I = 30: 70%
of trials); single silencing of one OR-gate input shows little when another input is active.
As in the DAG lab, the rules state the generative process in full and say nothing about how to
do inference with it.

## Reward

Same convention as the DAG lab, with the prior predictive q0 in place of 0.5 (LEVER queries
have prior predictive values other than 0.5 because of the OR gate; population queries are
exactly 0.5):

    G    = mean_k [ p*_k (log q_k - log q0_k) + (1 - p*_k) (log(1 - q_k) - log(1 - q0_k)) ]
    raw  = G / C,           C = 0.26397
    score = min(1, max(0, raw))          -> /logs/verifier/reward.txt

p*_k is computed exactly from the hidden tables (sum over the 16 population states), q and q0
are clamped to [0.001, 0.999]. Submitting q0, or nothing, scores exactly 0. C is the prior
average of G when submitting the truth, from 4,000,000 prior draws (standard error 0.00005),
stored in `optolab.NORMS`. The expected score is maximised by the exact posterior predictive.
`details.json` adds the reference on the same circuit and exact inference on the agent's own
data (design gap and inference gap), for reporting only.

## Exact inference

- **Factorisation.** The likelihood is a product of node terms and LEVER is a sink, so the
  posterior over (population DAG, LEVER input set + gate) is a product of a posterior over the
  543 population DAGs and one over the 31 LEVER models.
- **A population node's term** for a given parent set and a given assignment of expression
  levels to the injections in that node is a product over parent configurations of Beta
  integrals of a polynomial in theta. A light trial in which X = v (the clamp value) contributes
  theta + e (1 - theta) (ChR2) or (1 - theta) + e theta (ArchT): clamp took, or natural; a trial
  contradicting the clamp contributes (1 - e) theta^x (1 - theta)^(1 - x). Expanding the product
  of binomials gives a finite sum of Beta functions. Expression levels are summed out exactly
  (3^k assignments for k injections in a node; independent across nodes, which keeps the node
  terms separate).
- **LEVER** is the same polynomial with e = h(I) known (free table), or a closed-form product
  for the OR gate, mixed with the gate prior.
- **Posterior predictive** of an ideal intervention = weighted sum over population DAGs and
  LEVER models of the query computed with posterior-mean tables. Exact: within one joint state
  every node contributes one table entry, and nodes are independent given the structure. (Within
  a node the entries are coupled through the shared expression level, but a joint state uses
  only one entry per node.)
- **Verified** against an independent brute force (`tests/test_optolab.py`): every population
  node's marginal likelihood and posterior-mean table under all parent sets by numerical
  integration with an explicit sum over expression levels, after a design with records, a
  single ChR2 animal and a dual ArchT animal at four intensities (agreement 1e-7); every LEVER
  model's likelihood with heat; and the predictive against importance sampling from the prior
  (1,000,000 draws).

**Reference design** (approximate; inference is exact): two stages per step. Stage 1 scores
every affordable action (record; a session on each animal at each intensity; a new animal with
either opsin in each of the 10 population sets plus its first session at each intensity) by the
exact information gain of one trial about the structure (population DAG and LEVER model), per
unit cost. Stage 2 takes the top 6 and scores each by exact preposterior analysis of one trial
(all 32 outcomes): the expected increase of the query-weighted expected log score of the exact
predictive, times trials per unit cost. A new animal is valued as if it gets 2 sessions. It is
greedy and one trial ahead. One reference episode takes about 12 s on one core (Modal); the reference through MCP took 35 s on the laptop; the `/grade`
call replays it.

## Calibration

400 paired seeds (0 to 399, salt "calibration", not used for tuning) on Modal CPU
(`experiments/optolab_modal.py::calibrate`, 1 CPU per seed, 372 s wall, 28,753
container-seconds). `raw` is the unclipped reward, `score` the clipped one; intervals are paired
bootstrap 95% intervals of reference − policy. Design rows use exact inference on their own
data; "inference" rows reuse the reference's data; **bold** rows are full shortcut strategies
(a restricted design followed by the inference such an agent would use). Full rows and the
OR / non-OR split: `results/optolab_calibration.json`.

| Policy | raw | score | reference − policy, raw [95% CI] | reference − policy, score [95% CI] |
|---|---|---|---|---|
| Knowing the truth | 1.014 | 0.848 | -0.176 [-0.189, -0.163] | -0.113 [-0.127, -0.100] |
| **Reference**: lookahead design + exact inference | 0.839 | 0.735 | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| Design: always I = 10 + exact | 0.834 | 0.733 | 0.004 [-0.005, 0.014] | 0.002 [-0.006, 0.010] |
| Design: records + single ArchT only + exact | 0.842 | 0.740 | -0.003 [-0.011, 0.004] | -0.005 [-0.011, 0.001] |
| Design: no two-population animals + exact | 0.846 | 0.740 | -0.007 [-0.014, -0.002] | -0.005 [-0.010, -0.000] |
| Inference: light = perfect clamp, heat modelled (reference data) | 0.837 | 0.734 | 0.001 [-0.002, 0.004] | 0.001 [-0.002, 0.004] |
| Design: always I = 1 + exact | 0.816 | 0.727 | 0.023 [0.009, 0.037] | 0.008 [-0.003, 0.018] |
| Design: always I = 30 + exact | 0.813 | 0.721 | 0.025 [0.011, 0.040] | 0.013 [0.002, 0.025] |
| Design: records only + exact | 0.795 | 0.719 | 0.044 [0.029, 0.058] | 0.016 [0.004, 0.026] |
| **Min light** + perfect clamp, no heat | 0.802 | 0.717 | 0.037 [0.021, 0.054] | 0.018 [0.006, 0.030] |
| Inference: no OR gates in the prior (reference data) | 0.782 | 0.702 | 0.056 [0.047, 0.065] | 0.033 [0.026, 0.040] |
| **Single silencing** + no OR prior | 0.789 | 0.709 | 0.050 [0.039, 0.061] | 0.026 [0.017, 0.035] |
| **Single silencing** + perfect clamp, no heat | 0.771 | 0.696 | 0.067 [0.050, 0.085] | 0.039 [0.026, 0.052] |
| Inference: heat ignored (reference data) | 0.771 | 0.693 | 0.068 [0.053, 0.084] | 0.042 [0.031, 0.054] |
| Inference: light = perfect clamp, heat ignored (reference data) | 0.769 | 0.693 | 0.069 [0.054, 0.086] | 0.042 [0.030, 0.054] |
| **Max light** + perfect clamp, no heat | 0.640 | 0.599 | 0.199 [0.168, 0.231] | 0.136 [0.113, 0.160] |
| **Max light** + heat ignored | 0.639 | 0.599 | 0.199 [0.168, 0.232] | 0.136 [0.113, 0.160] |
| **Correlation lure**: records only + do read as see | 0.629 | 0.595 | 0.210 [0.186, 0.232] | 0.140 [0.122, 0.158] |
| Design: random affordable actions + exact | 0.622 | 0.576 | 0.216 [0.194, 0.240] | 0.159 [0.139, 0.180] |
| Random design + perfect clamp, no heat | 0.521 | 0.504 | 0.318 [0.289, 0.347] | 0.231 [0.207, 0.255] |
| Inference: correlational, do read as see (reference data) | 0.509 | 0.498 | 0.330 [0.304, 0.358] | 0.237 [0.216, 0.258] |
| Prior predictive (or no submission) | 0.000 | 0.000 | 0.839 [0.798, 0.878] | 0.735 [0.709, 0.760] |

Reference diagnostics: 4.6 records, 1.39 animals (0.07 two-population)
and mean light intensity 13.1 per episode; 69% of circuits have an OR gate.

What the table says:

- **Every full shortcut strategy is below the reference with an interval that excludes 0.**
  Correlation lure (records, do read as see) 0.21 raw; the correlational reading on the
  reference's own data 0.33. Light dose: max light with the heat artefact ignored 0.20 (0.24 on
  OR circuits); min light 0.04. OR gate: single silencing with no OR prior 0.05 (0.07 on OR
  circuits), with the perfect-clamp reading 0.07. Ignoring heat alone costs 0.07 even on the
  reference's data; dropping OR gates from the prior 0.06 (0.08 on OR circuits).
- **Design alone matters little once inference is exact.** Records only 0.044, always I = 30
  0.025, always I = 1 0.023, random 0.22. Three restricted designs are as good as the
  reference or slightly better: always I = 10 (0.004, CI includes 0), records + single
  silencing (−0.003, CI includes 0) and no two-population animals (−0.007, CI [−0.014,
  −0.002]): the greedy reference occasionally buys a dual animal that does not pay off.
- **Treating light as a perfect clamp is harmless by itself** (0.001): every node, including
  the illuminated one, is imaged, so a failed clamp is just a natural trial that downstream
  nodes see correctly. Efficacy matters for information (min light), not for bias.
- The reference reaches 83% of the raw score of knowing the truth (0.839 vs 1.014).

## Agent runs (Harbor VM, Claude Code + Opus, 8 trials on opto-0..3)

`harbor run -a claude-code -m claude-opus-5-5`, 2 attempts per task (one trial hit a network
error installing Claude Code and was rerun), jobs `e8-opto-opus` and `e8-opto-opus-r`.

| Trial | score | raw | reference raw | gap to reference | inference gap | design gap |
|---|---|---|---|---|---|---|
| opto-0 a | 0.568 | 0.568 | 0.538 | +0.030 | 0.000 | +0.030 |
| opto-0 b | 0.856 | 0.856 | 0.900 | −0.044 | +0.001 | −0.045 |
| opto-1 a | 0.255 | 0.255 | 0.318 | −0.063 | 0.000 | −0.063 |
| opto-1 b | 0.704 | 0.704 | 0.722 | −0.018 | 0.000 | −0.018 |
| opto-2 a | 0.658 | 0.658 | 0.127 | +0.530 | 0.000 | +0.530 |
| opto-2 b | 1.000 | 1.271 | 1.371 | −0.100 | −0.024 | −0.077 |
| opto-3 a | 0.507 | 0.507 | 0.579 | −0.072 | 0.000 | −0.072 |
| opto-3 b | 0.855 | 0.855 | 0.872 | −0.018 | 0.000 | −0.018 |

Opus is below the reference on 6 of 8 trials (median gap −0.031 raw) but the mean gap is +0.031
because of one trial where the reference's own data were unlucky (0.127). **The inference gap
is 0.000 on 7 of 8 trials**: Opus wrote its own exact enumeration (DAGs, expression levels,
the clamp/heat mixtures, Beta integrals; no code was fetched from GitHub) and matched exact
inference on its data. Everything it loses is design, about 0.02 to 0.08 per trial, the same
size as the design gaps in the table. On this evidence the lab does not break Opus's
inference; its traps catch agents that read correlations causally, ignore the heat artefact or
the OR prior, and none of these happened. Eight trials cannot resolve a design gap of 0.03.

## What was tuned

Tuning used seeds 100000 to 100079 only (salt "calibration"); the final seeds 0 to 399 were run
once, after the configuration was fixed. Four sweeps of 48 to 80 seeds were looked at.

| Knob | Tried | Chosen | Why |
|---|---|---|---|
| Data | 8 trials per record, 6 per session, budget 16; 4 / 4 / 12 | 4 / 4 / 12 | with the larger budget the reference reached 88% of the truth's raw score and every design came within 0.05 of it |
| Heat h(I) at I = 1, 3, 10, 30 | 0, 0, 0.05, 0.4; 0, 0, 0.3, 0.7 | 0, 0, 0.3, 0.7 | with mild heat, I = 10 was best for every expression level, so the dose choice did not depend on the animal and max light cost nothing; the steep curve makes the best intensity depend on the hidden level |
| OR gate | P(OR) 0.5 with 0.9 / 0.05; P(OR) 0.7 with 0.95 / 0.02 | 0.7, 0.95 / 0.02 | doubled the cost of ignoring OR gates on OR circuits (0.04 to 0.065) |
| Queries | 6 + 6 random LEVER doubles; all 6 combined-silencing LEVER queries | combined silencing | random doubles hit a given OR pair's (0, 0) query rarely, so redundancy hardly entered the score |
| Reference design | greedy structure information gain per cost; + query-value lookahead on the top 6 | lookahead | the structure-only design lost to "single silencing only" by 0.024 (it does not know which queries are asked); the lookahead put the reference above every restricted design |
| Expression levels, Hill curve, intensities, costs | not tuned | | |

Retuned trap that still gives no design headroom: **combined silencing**. "No dual animals" is
within noise of the reference in every sweep (natural trials already show the configurations
with both OR inputs off often enough at this data size). The OR gate is kept because it is a
large inference trap (rows `no_or_gate_prior`, `single_silence+no_or`).

## Limits

- Imaging includes the illuminated population. Partial efficacy therefore does not bias
  inference about downstream nodes (the actual value of the clamped node is observed), and
  treating light sessions as perfect interventions costs little on the reference's own data.
  A variant in which the illuminated population is not observed (the realistic case when the
  stimulation light blinds the imaging channel) couples the node terms through a latent per
  trial; exact inference would need a sum over latent assignments of all light trials and was
  not built.
- Combined (dual) silencing has no measurable design value with exact inference: natural
  trials in recordings cover the configurations in which two OR inputs are both off often
  enough. The OR gate is a trap for inference (ignoring it, or concluding from single
  silencing that neither input matters), not for design.
- The reference's design is greedy, one trial ahead, and preselected by structure information
  gain. Some restricted designs come within the noise of it (see the table).
- Per-episode rewards are noisy (20 queries, one circuit). Gaps of 0.02 to 0.05 need tens of
  paired trials to resolve; the large strategy gaps show in about 10.

## Verification status

- `tests/test_optolab.py`: 23 tests (about 3 minutes, most of it the paired ordering check):
  brute-force node terms for three populations under every parent set and for all 31 LEVER
  models; predictive against importance sampling; the truth against Monte Carlo of the ideal
  intervention; the stored C against a fresh Monte Carlo; prior scores exactly 0; determinism
  under seed and salt; nine invalid actions rejected without cost; invalid intensity, budget,
  reveal order and single submission; clamps and heat applied; rules complete and JSON;
  reference above random, the correlational reading and max-light-ignoring-heat on 8 seeds.
  `tests/test_dagnet.py` still passes (24 tests).
- The rendered server (`tasks/opto/opto-0`, vendored `bayesenv`) was started as a local
  process and driven through a `fastmcp` client: 7 tools listed, rules returned, invalid
  opsin / duplicate population / unknown animal / early submission rejected, `get_status`,
  `/grade` before submission (score 0) and with a wrong token (404); the reference played
  through MCP by `solution/play_reference.py` reproduced the in-process reference exactly
  (gap 0.000); a second submission and an experiment after the end were rejected.
- Harbor (VM, `harbor run -a oracle`, 5 tasks): all 5 trials scored, mean 0.697, gap to the
  in-process reference 0.000 on every trial.
- Claude Code + Opus: 8 trials, see "Agent runs".

## Demo use

```python
from bayesenv import optolab as O

lab = O.OptoLab()
lab.reset(seed=0, salt="demo")
lab.step({"action": "record"})
a = lab.step({"action": "express", "opsin": "ArchT", "populations": ["NAc", "BLA"]})["result"]["animal"]
lab.step({"action": "light", "animal": a, "intensity": 10})
lab.belief.summary()               # edge probabilities (incl. -> LEVER) and P(OR gate)
qs = lab.finish()["queries"]
lab.submit(lab.belief.predict(lab.queries))
```

## Reproduce

```bash
PY="uv run --no-project --with numpy --with scipy --with pytest python"
$PY -m pytest -q tests/test_optolab.py
$PY scripts/optolab_calibrate.py --seeds 0:8 --workers 4                    # small local smoke run
R="uv run --no-project --with modal --with numpy --with scipy modal run --env 3-sigma-submission"
$R experiments/optolab_modal.py::calibrate --seeds 400                     # the table above
$R experiments/optolab_modal.py::norm --draws 4000000                       # the constant C
python scripts/make_opto_tasks.py --seeds 0:5 --out tasks/opto
```
