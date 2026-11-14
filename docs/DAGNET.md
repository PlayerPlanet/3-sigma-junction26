# DAG lab: learn a hidden causal network, forecast interventions

A hidden causal Bayesian network over 5 binary variables is drawn from a fully disclosed
prior. The agent runs 6 small experiments (observation or one intervention, 3 joint samples
each), and then has to give calibrated probabilities for 24 held-out interventional queries,
half of them two-variable interventions it could never run. The STRUCTURE is the unknown: 18
samples never identify the graph, so the right answer is a Bayesian model average over all
29,281 DAGs, with interventions handled correctly. Everything is exact, by enumeration.

Code: `bayesenv/dagnet.py` (enumeration, exact posterior and predictive, information gain,
policies, `DagLab`), `scripts/dagnet_calibrate.py`, `experiments/dagnet_modal.py`,
`tests/test_dagnet.py`, `templates/dag_task/` + `scripts/make_dag_tasks.py` (Harbor),
`tasks/dag/dag-0..4`, `results/dagnet_calibration.json`.

## The model, exactly as disclosed by `get_rules`

Only the particular DAG and its tables are hidden. The agent is told all of the following.

- **Variables.** X0..X4, binary.
- **Graph.** Drawn uniformly from all 29,281 DAGs on the 5 labelled nodes (a node may have up
  to 4 parents; the labels carry no order).
- **Tables.** For every node i and every configuration c of its parents,
  theta[i, c] = P(X_i = 1 | parents = c) ~ Beta(0.5, 0.5), independently. The Beta is
  U-shaped, so many entries are near 0 or 1 and effects are strong.
- **Observation.** Every variable in topological order: X_i ~ Bernoulli(theta[i, parents]).
- **Intervention.** Under do(X_i = v), X_i is set to v whatever its parents are; every other
  variable is drawn from its own unchanged table. do(X_a = v, X_b = w) sets both.
- **Experiments.** At most 6. Each is `{}` (observe) or one variable set to 0 or 1, and
  returns 3 independent joint samples. Two-variable interventions are not available. Every
  experiment costs 1. Invalid requests are rejected and consume nothing.
- **Queries**, revealed only by `finish_experiments`: 12 drawn uniformly without replacement
  from the 40 single queries P(X_t = 1 | do(X_a = v)), and 12 from the 120 double queries
  P(X_t = 1 | do(X_a = v, X_b = w)); drawn independently of the network and the experiments.
- **Scoring.** See below, including the constant C and the clamp [0.001, 0.999].

The rules state the generative process in full but do not explain how to do inference with
it (for example, that a sample taken under do(X_i) says nothing about X_i's parents). That is
a consequence of the model, and working it out is the task.

## Reward

For query k let p*_k be the true probability, computed exactly from the hidden tables by
summing over the 32 joint states (no sampled outcomes), and q_k the submitted probability
clamped to [0.001, 0.999].

    S    = mean_k [ p*_k log q_k + (1 - p*_k) log(1 - q_k) ]
    raw  = (S - log 0.5) / C,          C = 0.24465
    score = min(1, max(0, raw))        -> /logs/verifier/reward.txt

- The prior predictive of every query is exactly 0.5 (Beta(a, a) is symmetric), so
  submitting 0.5 everywhere, or nothing, scores exactly 0. The agent can compute this from the
  rules.
- C is the prior average of [S(truth) - log 0.5], a per-task constant estimated once with
  4,000,000 prior draws (standard error 0.00006) and stored in `dagnet.NORMS`. It is a
  constant, not a per-episode maximum, so `raw` can exceed 1 on networks with extreme tables
  (knowing the truth averages 0.98 raw, 0.83 after clipping).
- The reward depends only on the hidden truth and the submission. `details.json` also holds
  the unclipped value, the score of knowing the truth, the reference on the same network, and
  exact inference on the agent's own data, which splits the gap to the reference into a design
  part and an inference part. These are for reporting only.
- The expected score is maximised by the exact posterior predictive, so there is nothing to
  game: any other answer loses in expectation.

## Exact reference

- **Marginal likelihood** of a DAG: product over nodes i and parent configurations c of
  B(a + n1, a + n0) / B(a, a), a = 0.5, where n1 and n0 count the samples with configuration c
  and X_i = 1 or 0 **among samples in which X_i was not intervened on**.
- **Posterior** over all 29,281 DAGs by enumeration (uniform prior).
- **Posterior predictive** of a query: the posterior-weighted average over DAGs of the query
  computed with posterior-mean tables (a + n1) / (2a + n1 + n0). This is exact, not a plug-in
  approximation: a joint probability is a product of distinct, independent table entries, so
  its expectation is the product of their means.
- **Design**: greedy expected information gain of one more sample about (DAG, tables) jointly,
  in closed form (entropy of the model-averaged predictive minus the expected entropy given
  graph and tables, the latter through E[theta log theta] of a Beta). The same gain about the
  DAG alone scores the same (see the table), so the choice between the two does not matter.
- **Cost**: one reference episode (6 design steps, each scoring 11 actions over all DAGs, plus
  the predictions) takes 1.5 s on a 2-CPU Modal container and 1.8 s on a laptop. The grader
  itself is a sum over 32 states per query (milliseconds); the `/grade` call takes 1.4 s
  because it also replays the reference for `details.json`.

The reference is exact except that the design is greedy and scores one sample rather than
the batch of three.

## Calibration

400 paired seeds (0 to 399, not used for tuning), Modal CPU, 47 s wall, 1,182 container-seconds.
`raw` is the unclipped reward, `score` the clipped one. The intervals are paired bootstrap 95%
intervals of reference minus policy. Full rows: `results/dagnet_calibration.json`.

| Policy | raw | score | reference − policy, raw [95% CI] | reference − policy, score [95% CI] |
|---|---|---|---|---|
| Knowing the truth | 0.983 | 0.829 | −0.239 [−0.252, −0.226] | −0.153 [−0.167, −0.140] |
| **Reference**: information-gain design + exact averaging | **0.744** | **0.675** | 0 | 0 |
| Design: information gain about the DAG only + exact | 0.743 | 0.672 | 0.001 [−0.008, 0.010] | 0.003 [−0.004, 0.011] |
| Design: round robin over the 11 actions + exact | 0.705 | 0.646 | 0.039 [0.025, 0.054] | 0.029 [0.017, 0.042] |
| Design: random actions + exact | 0.685 | 0.634 | 0.059 [0.043, 0.074] | 0.042 [0.029, 0.054] |
| Design: observation only + exact | 0.677 | 0.630 | 0.067 [0.051, 0.084] | 0.045 [0.031, 0.058] |
| Best BIC graph + Laplace tables | 0.704 | 0.645 | 0.040 [0.034, 0.046] | 0.030 [0.024, 0.036] |
| Best single graph (exact scores, exact tables) | 0.683 | 0.621 | 0.061 [0.052, 0.071] | 0.055 [0.046, 0.063] |
| Plug-in tables (exact graph weights, maximum-likelihood tables) | 0.633 | 0.594 | 0.111 [0.094, 0.131] | 0.081 [0.068, 0.096] |
| Interventions treated as observations (exact averaging otherwise) | 0.401 | 0.399 | 0.343 [0.319, 0.368] | 0.276 [0.258, 0.294] |
| Empirical frequencies, round-robin design | 0.441 | 0.444 | 0.303 [0.283, 0.323] | 0.231 [0.216, 0.247] |
| Empirical frequencies, reference's data | 0.360 | 0.367 | 0.384 [0.359, 0.408] | 0.309 [0.290, 0.328] |
| Correlational: do(X) read as see(X) in pooled data | 0.304 | 0.316 | 0.440 [0.414, 0.466] | 0.359 [0.339, 0.380] |
| Prior (0.5 everywhere, or no submission) | 0 | 0 | 0.744 [0.704, 0.785] | 0.675 [0.647, 0.704] |

The inference shortcuts use the reference's own experiments, so those rows isolate inference.
"Empirical frequencies" is the Laplace-smoothed share of target = 1 in samples from a matching
interventional batch, falling back to conditioning in the pooled data.

What the table says:

- **Every shortcut is below the reference with an interval that excludes 0**, but the gaps
  fall in two groups. Getting causality wrong costs 0.3 to 0.44: treating do as see, counting
  frequencies, or keeping the intervened node's term in the likelihood. Getting the averaging
  wrong costs 0.04 to 0.11: a single graph, BIC, or point-estimated tables.
- **Design matters, but little**: 0.04 to 0.07 between the reference and round robin, random
  or observation only. With queries spread uniformly over all variables, almost any spread of
  experiments is useful. Interventions buy 0.067 over never intervening.
- A policy that averages exactly but spreads experiments evenly lands at 0.705, within 0.04
  of the reference. That is the realistic ceiling for an agent that gets the inference right
  and does not optimise the design.
- **The posterior never concentrates.** After the reference's 18 samples the true DAG has
  posterior probability 0.002 on average, its interventional equivalence class 0.002, and its
  observational Markov equivalence class 0.004; the most probable DAG is the true one in 1.75%
  of episodes; the largest posterior probability of the true class in any episode is 0.08.
  The reference still reaches
  76% of the score of knowing the truth, because forecasts need far less than the graph.
  This is prediction under structural uncertainty, not structure identification.

## What was tuned

Results were looked at three times before the final run: a 12-seed local smoke run, and two
Modal sweeps of 60 seeds each on tuning seeds 100000 to 100059 (9 and 6 configurations). The
final 400 seeds were run once, after the configuration was fixed.

| Knob | Tried | Chosen | Why |
|---|---|---|---|
| In-degree limit | 2 (13,956 DAGs), 4 (all 29,281) | 4 | larger single-graph and BIC gaps; reference 1.5 s instead of 0.7 s |
| Beta(a, a) | 0.5, 0.75, 1.0 | 0.5 | with a = 1 and little data, observation only was as good as the reference |
| Batch size × budget | 4×12, 2×8, 2×12, 3×6, 3×8, 2×10 | 3×6 | with 48 samples the single-graph and plug-in gaps shrank to about 0.02 to 0.05; with 6 experiments for 11 possible actions the choice of experiment matters most |
| Design target | (DAG, tables) jointly, DAG only | joint | no measurable difference |
| Queries | 12 single + 12 double | not tuned | |
| Costs | all experiments cost 1 | not tuned | |
| n | 5 | not tuned | n = 6 was not tried |

One change was made to the disclosed text during tuning: a sentence that told the agent that
intervened samples carry no information about the intervened node's parents was removed from
the rules. It is an inference hint, not part of the generative process, and it gave away the
single most costly mistake.

## Limits

- The gap that separates a careful agent from the reference is small. An agent that enumerates
  the DAGs, uses the Beta-Bernoulli marginal likelihood with the intervened node's term
  dropped, and averages with posterior-mean tables matches the reference's inference exactly;
  what is left is the 0.04 design gap. The large gaps are for causal mistakes that a strong
  agent may not make when the model is disclosed this fully.
- Per-episode rewards are noisy (24 queries, one network): the per-seed standard deviation of
  the reference's raw reward is 0.41. Differences are much less noisy when paired on the same
  network (`gap_to_reference` in `details.json`): the paired standard deviation is 0.27 for
  the correlational shortcut and 0.10 to 0.14 for the single-graph and round-robin rows, on
  the reference's own data. So a causal mistake (gap 0.3 and more) shows in about 5 to 10
  trials, while gaps of 0.04 to 0.06 need roughly 20 to 50, and more if the agent's
  experiments differ from the reference's.
- The design is greedy and one sample ahead. A design aimed at the query distribution rather
  than at the parameters might be better; it was not tried.
- Not tried: n = 6, unequal costs, two-variable experiments, soft interventions.

## Verification status

- `tests/test_dagnet.py`: 24 tests, 27 s. DAG counts 25, 543, 29,281; marginal likelihood,
  posterior, predictive and information gain against an independent brute force on n = 3; a
  test that fails if the intervened node's term is kept; do is not see on a confounded triple;
  the truth against Monte Carlo; the prior scores exactly 0; determinism under seed and salt;
  invalid actions, budget, reveal order and single submission; score in [0, 1]; ordering of the
  policies on 12 seeds.
- The server of a rendered task (`tasks/dag/dag-0/environment/mcp-server/server.py`, with its
  vendored `bayesenv`) was started as a local process and played through a `fastmcp` client:
  tool list, three invalid actions rejected, submission before the reveal rejected, a full
  reference episode with `solution/play_reference.py`, `/grade` with a wrong and a right
  token, and rejection of a second submission and of experiments after the end.
- Not verified: the Docker build, the compose wiring, `tests/test.sh` and `solve.sh` inside
  Harbor (no Docker on the build machine). They are copies of the chemistry lab's files with
  the names changed. No language model has been run on this task.

## Demo use

```python
from bayesenv import dagnet as D

lab = D.DagLab()
obs = lab.reset(seed=0, salt="demo")
obs = lab.step({"X2": 1})                    # {} = observe
obs["result"]["samples"]                     # 3 rows of X0..X4
obs["posterior"]["edge_probabilities"]       # [j][i] = P(Xj -> Xi | data), for a heat map
obs["posterior"]["top_dags"]                 # the three most probable graphs
queries = lab.finish()["queries"]
res = lab.submit(lab.belief.predict(lab.queries), with_reference=True)
lab.parents, lab.theta, lab.truth            # the hidden network and the true answers
```

The MCP server does not expose the posterior summaries; they are for demos and analysis.

## Reproduce

```bash
PY="uv run --no-project --with numpy --with scipy --with pytest python"
$PY -m pytest -q tests/test_dagnet.py
$PY scripts/dagnet_calibrate.py --seeds 0:20                      # small local run
R="uv run --no-project --with modal --with numpy --with scipy modal run --env 3-sigma-submission"
$R experiments/dagnet_modal.py::calibrate --seeds 400            # the table above
$R experiments/dagnet_modal.py::norm --draws 4000000             # the constant C
python scripts/make_dag_tasks.py --seeds 0:5 --out tasks/dag
```
