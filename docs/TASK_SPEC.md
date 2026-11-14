# Task specs: a declarative syntax for Bayesian-experimental-design tasks

Branch `task-spec`. One YAML file per task family under `specs/`, loaded by `bayesenv/spec.py`
into an object with the same interface as the hand-written environments in `bayesenv/envs.py`.
`Posterior`, `Task`, the policies and the graders run on it unchanged, so every spec gets the
exact-posterior Bayesian reward (prior predictive = 0, knowing θ* = 1) for free.

Everything here is CPU-only and uses no LLM. **The reference sweep, the EIG-stability check and
the data batch have not been run at scale yet** (sections 3 and 4 say exactly what exists).
Commands:

```bash
PY="uv run --no-project --with numpy --with scipy --with pyyaml --with pytest python"
$PY -m pytest tests/test_spec.py -q                                    # ~10 s
$PY scripts/gen_training_data.py --specs specs/*.yaml --instances 2 --out data/try    # small, local
M="uv run --no-project --with modal --with numpy --with scipy --with pyyaml modal run --env 3-sigma-submission"
$M experiments/spec_modal.py::sweep --seeds 200                        # Modal CPU fan-out
$M experiments/spec_modal.py::stab --states 20
$M experiments/spec_modal.py::gen --instances 400 --out data/v1
```

## 1. The syntax

```yaml
name: dose_response            # must equal the file stem, [a-z0-9_]+
family: bernoulli              # bernoulli | gaussian  (the two the grader supports)
params:                        # theta: one prior per parameter, independent
  ec50:  {prior: loguniform, low: 0.1, high: 100}
  slope: {prior: normal, mean: 3.0, sd: 1.0, min: 1.0}
design:                        # x: one range per design variable
  dose: {low: 0.01, high: 1000, scale: log}
model:
  p: "0.02 + 0.96 / (1 + (ec50 / dose) ** slope)"    # `mean:` for gaussian
# noise: {sd: 0.5}             # gaussian only: y = mean + Normal(0, sd^2)
# constraints: ["iR < dR"]     # optional comparisons between design expressions
budget: 10                     # experiments per episode   (default 10)
n_eval: 30                     # held-out evaluation designs (default 30)
text:
  story: >-                    # {var} -> display name, {var.unit} -> display unit
    Each patient receives a {dose} (in {dose.unit}) of the compound and either responds or
    does not. {ec50} (in mg) is the {dose} at which the effect is half-maximal ...
  outcome: "The outcome is 1 if the patient responds, else 0."
  names:                       # alternative display names (identifiers)
    dose: [dose, amount, quantity]
    ec50: [ec50, d50, midpoint]
  units:                       # display value = internal value * factor; first entry = base
    dose: {mg: 1, ug: 1000}    # design variables, or `y` for a gaussian outcome
randomize:                     # per-instance variation
  priors:                      # <param>.<prior field>: [low, high], drawn uniformly
    ec50.high:  [30, 300]
    slope.mean: [2.0, 4.0]
  # noise: {sd: [0.3, 0.8]}    # gaussian only
  surface: [names, units]      # which surface features to randomise
```

| Element | Options |
|---|---|
| `prior` | `normal {mean, sd, [min], [max]}` (truncated by rejection), `lognormal {mu, sigma}`, `uniform {low, high}`, `loguniform {low, high}`, `halfnormal {sd}` |
| design variable | `low`, `high`, `scale: linear \| log` (how random designs are spread), `integer: true` |
| expression | `+ - * / **`, unary minus, `< <= > >=` (for `where`), numbers, parameter and design names, `pi`, and `exp log sqrt sin cos tanh abs minimum maximum where Phi sigmoid` |

`Phi` (standard normal CDF) and `sigmoid` are two additions to the numpy list; hyperbolic
discounting and item-response models need them.

**Safety.** Expressions are parsed with `ast` and run by a small tree-walking interpreter
(`spec._build`): there is no `eval`/`exec`/`compile` on spec text. Anything that is not on the
whitelist is a `SpecError` at load time: attribute access, subscripts, calls to anything but
the listed functions, keyword or starred arguments, unknown names, strings, booleans, lambdas,
conditionals, chained comparisons, `==`. Numeric literals become numpy floats, so `9**9**9` is
`inf` rather than a big-integer computation. Expressions are capped at 400 characters.

**Validation.** Loading a spec checks structure and types, then builds the base instance and
both extremes of every randomised range, and for each evaluates the model on 256 prior draws ×
(64 random designs + the corners of the design box). It fails with a message naming the field
if the result is non-finite, if a bernoulli `p` leaves [0, 1], or if a gaussian outcome scale
does not fit the grader's sd clip (see limits).

**Vectorisation.** `prob`/`mean` take designs `(m, d)` and parameters `(n, k)` and return
`(n, m)`, like the hand-written environments. Parameters with `loguniform`/`lognormal` priors
are stored as their logarithm internally (so `theta` for the `hyperbolic` spec is `(log k,
alpha)`, the same coordinates as `envs.Hyperbolic`), which keeps the random-walk rejuvenation
in `Posterior` on a sensible scale. `env.natural(theta)` gives natural values by name.

### Instances and names

`Task(env_name, seed)` accepts, in addition to `hyperbolic` and `location`:

| Name | Meaning |
|---|---|
| `spec:NAME` | base instance: file values, canonical names, first unit |
| `spec:NAME#K` | randomised instance K |
| `spec:NAME@HASH#K` | the same, but a `KeyError` if the spec file's hash is no longer `HASH` |

`HASH` is the first 12 hex digits of the SHA-256 of the parsed spec (canonical JSON), so
comments and formatting do not change it but any value does. **(name, hash, K) fully determine
the instance**: the hyper-parameters drawn from `randomize.priors`/`noise` (rounded to 4
significant digits, so the text states exactly the values used) and the display names and
units. θ* and the evaluation designs come from `Task`'s existing `seed` (+ optional `salt`)
streams, unchanged. Generated rows always carry the hash-pinned name.

Surface randomisation is consistent between text and numbers: with `dose: {mg: 1, ug: 1000}`
an instance in `ug` has design range 10 – 1,000,000, the agent submits designs in `ug`, and
the model card reads `... (d50 / (dose / 1000)) ** hill`. Parameters keep their internal units
(the story should say which, as in "`{ec50}` (in mg)").

`env.describe()` = story + design ranges + outcome sentence + what to predict.
`env.model_card()` = the exact generative model in display names and units, e.g.

> Exact generative model: ec50 ~ LogUniform(0.1166, 255.3) (log(ec50) is uniform); slope ~
> Normal(mean 2.049, sd 1) truncated to [1, inf]. P(outcome = 1 | [dose]) = 0.02 + 0.96 / (1 +
> (ec50 / dose) ** slope).

(`spec:dose_response#1`.) Changes to existing code are small and backwards compatible: `envs.get_env` (name lookup),
`Task.budget`/`n_eval` default to the environment's own values when it declares them (10 / 30
otherwise), `bayes.log_prior` asks the environment first, and `llm_agent.system_prompt` takes
an optional `full_info` argument (default: the `FULL_INFO` environment variable, as before).

### Adding a family

1. Write `specs/<name>.yaml`. Start from the closest existing file.
2. `python -c "from bayesenv.spec import resolve; e = resolve('spec:<name>#0'); print(e.describe()); print(e.model_card())"`
   and read the text an agent would see.
3. `python experiments/spec_sweep.py --specs <name>` and check the three flags (section 3).
   The usual fixes are in the spec, not the code: widen the prior or sharpen the response so
   that knowing θ* is worth much more than the prior, raise `budget`, or narrow a
   randomisation range.
4. Add it to the family table below.

## 2. Families

| Spec | Likelihood | Parameters | Design | Budget | Structure |
|---|---|---|---|---|---|
| `dose_response` | bernoulli | ec50 (log-uniform), slope | dose, log scale | 10 | Hill curve with 2% lapses |
| `psychometric` | bernoulli | threshold, width | intensity | 20 | yes/no detection, probit, 3% false alarms |
| `item_response` | bernoulli | ability, slip rate | difficulty × discrimination (2-D) | 20 | adaptive testing, logistic with an unknown upper asymptote |
| `hyperbolic` | bernoulli | log k, alpha | iR, dR, D integers with `iR < dR` (3-D) | 10 | re-expression of `envs.Hyperbolic` |
| `exp_decay` | gaussian | amount, half-life | time, log scale | 10 | exponential decay |
| `michaelis_menten` | gaussian | vmax, km | substrate, log scale | 10 | saturating rate |
| `damped_oscillation` | gaussian | amplitude, decay, frequency | time | 10 | 3 parameters, likelihood multimodal in the frequency |
| `logistic_growth` | gaussian | capacity, rate | time | 10 | sigmoid growth from a known start |
| `peak_location` | gaussian | centre, width, height | position | 10 | bump: most designs see only noise |
| `location` | gaussian | source (a, b) | point (x1, x2) (2-D) | 10 | re-expression of `envs.LocationFinding`, one source |

`tests/test_spec.py` checks that `spec:hyperbolic` and `spec:location` reproduce the
hand-written `prob`/`mean`/`loglik` for the same (θ, x) to 1e-12, and for `hyperbolic` the
same prior draws from the same RNG stream.

The three new bernoulli families were changed once after a first look (48 seeds, budgets 10
and 20, the same seeds the sweep would use). As first written (Hill slope around 1.5, a
two-alternative psychometric function with chance level 0.5, four-option items with guessing
0.25) the reference's mean clipped reward was 0.57 to 0.72 at budget 10 and 0.65 to 0.80 at
budget 30, and its mean raw score was negative for the psychometric task. The cause is the
grader's per-task normalisation (limits, last item): when outcomes are close to coin flips
everywhere, knowing θ* is worth little more than the prior. The fix was in the specs: steeper
curves, probabilities that span 0.02 to 0.98, and a budget of 20 for two of them.

## 3. Reference sweep

`experiments/spec_sweep.py` runs, on the randomised instance `spec:NAME#s` for paired seeds
`s`: the reference (EIG-greedy over 256 candidates + posterior predictive, identical to
`policies.bayes_oracle`), the same with 64 candidates (what the data generator uses), random
design, stop-early (one experiment) and do-nothing. It writes `results/spec_sweep.jsonl` and
`results/spec_sweep_summary.json` with mean clipped and raw reward per policy, a paired
bootstrap 95% CI of reference − random, and three flags per family:

* `reference_below_0.8`: mean reference reward under 0.8;
* `no_design_headroom`: the CI of reference − random includes 0, or the difference is under 0.05;
* `particle_degeneracy`: in more than 10% of reference runs the effective sample size fell
  below 50 of 20,000 before a rejuvenation, or an independent 200,000-particle
  importance-sampling posterior on the same data scores more than 0.02 differently on average
  (computed over the runs where that posterior itself has ESS ≥ 200).

It runs locally (`--procs`) or as a Modal CPU fan-out (`experiments/spec_modal.py::sweep`).

**Status: the full sweep has not been run, so there is no sweep table and no family has been
verified, flagged or dropped on the basis of it.** A local run (64 seeds for gaussian families,
200 for bernoulli, 8 processes) was stopped part-way when the laptop was needed, and its
partial output was not kept. The Modal run was not permitted in this session. What exists is
the following, none of it enough to draw conclusions for the gaussian families:

| Family | Budget | n | Reference | Random | Source |
|---|---|---|---|---|---|
| `dose_response` | 10 | 48 | 0.902 | 0.716 | tuning scan |
| `psychometric` | 20 | 48 | 0.914 | 0.728 | tuning scan |
| `item_response` | 20 | 48 | 0.881 | 0.731 | tuning scan |
| `hyperbolic` | 10 | 40 | 0.958 | 0.541 | tuning scan |
| `peak_location` | 10 | 4 | 0.977 | 0.642 | smoke test |

Mean clipped Bayesian reward, seeds 0..n−1, instance = seed. These are the seeds the three
bernoulli families were tuned on, so their numbers are optimistic. No confidence intervals
were computed. Do-nothing scored exactly 0 in every episode run.

For the other five gaussian families there are two episodes each (reference / random raw
score): `exp_decay` 0.99/0.95 and 0.94/0.96; `michaelis_menten` 0.94/0.93 and 1.00/0.97;
`logistic_growth` 0.99/0.99 and 1.00/0.93; `damped_oscillation` 0.98/0.99 and 0.87/0.87;
`location` 0.96/0.74 and 0.99/0.45. Two seeds prove nothing, but they point one way: on
`exp_decay`, `michaelis_menten`, `logistic_growth` and `damped_oscillation` random designs
may already be nearly as good as the reference, in which case those families have little
design headroom at budget 10 and would need a smaller budget, a wider design range or more
noise. That is the first thing the sweep should settle.

To produce the table:

```bash
uv run --no-project --with modal --with numpy --with scipy --with pyyaml \
    modal run --env 3-sigma-submission experiments/spec_modal.py::sweep --seeds 200
```

Cost estimate from the partial local run: about 25 s per gaussian seed and 2.5 s per bernoulli
seed for all five policies on one busy laptop core, so 200 seeds × 10 families is roughly 9
CPU-hours.

## 4. Training rows

`scripts/gen_training_data.py` writes `rows.jsonl` and `meta.json`. For every spec and
instance K it takes the environment `spec:NAME@HASH#K` and task seed `1000*K + j`, and runs
two trajectories on that task: one with the reference's experiments (EIG-greedy over 64
candidates rather than the 256 of `policies.bayes_oracle`, for speed; the sweep's
`reference_c64` policy measures what that costs) and one with uniformly random experiments. Each
trajectory yields, with the default `--designs-per-traj 2`, 2 `design` rows, 1 `predict` row
and one `demo` row for each of those, so 12 rows per task.

Prompts are chat message lists in the text protocol of `bayesenv/llm_agent.py`
(`<observe>[...]</observe>` turns, `Result: ...` replies, the same final prediction request).
By default the system prompt includes the model card (the exact generative model): with
randomised priors a calibrated answer is not defined without it. `--no-model-card` gives
story-only prompts.

Fields on every row:

| Field | Type | Meaning |
|---|---|---|
| `spec`, `spec_hash` | str | family name and spec content hash |
| `instance` | int | instance number K |
| `seed` | int | task seed (θ*, evaluation designs, outcome noise) |
| `env` | str | `spec:NAME@HASH#K`; `Task(row["env"], row["seed"])` rebuilds the task |
| `family` | str | `bernoulli` or `gaussian` |
| `kind` | str | `design`, `predict` or `demo` |
| `split` | str | `train`, `heldout_instance` or `heldout_family` |
| `source` | str | `reference` or `random`: whose experiments are in the history |
| `depth` | int | number of experiments in the prompt's history |
| `prompt` | list | chat messages, system first, user last |

Extra fields by kind:

| Kind | Fields | Reward for a completion |
|---|---|---|
| `design` | `candidates`: 6 designs in shuffled order (5 random + the best of a random pool of 64); `eig`: estimated expected information gain of each, in nats | `datagen.design_reward(row, completion)` = `eig[i] / max(eig)` for the chosen candidate `i` (parsed from `<observe>[...]</observe>`), 0 for anything else |
| `predict` | `n_eval`; `reference_bayes_raw`: the score of the reference's own (rounded) answer for this history | `datagen.predict_reward(row, completion)`: the exact Bayesian reward recomputed from `(env, seed)`, clipped to [-1, 1], -1 if unparseable. This is the same computation as `reward_fn` in `train/grpo_predict.py`, which works on these rows as they are (`prompt`, `env`, `seed`) |
| `demo` | `of`: `design` or `predict`; `completion`: the reference's answer to the same prompt (the highest-EIG candidate as an `<observe>` tag, or the posterior predictive as the JSON list `llm_agent.parse_predictions` accepts) | supervised target |

θ* is never written to a row; it exists only inside `Task`, derived from the seed. Seeds are
visible, so anything deployed against an adversary still needs `Task(..., salt=...)` as before.
`datagen.validate_row` checks the schema; `data/sample_rows.jsonl` holds 20 real rows.

Lab-transfer evaluation rows (`split: lab_transfer`, `spec: lab:*`, design rows only, family
`categorical` for the finite labs, optional `value` / `greedy_choice` / `dp_choice` fields) use
the same schema and `design_reward`; they are described in `docs/LAB_ROWS.md`.

Splits: whole families named in `--heldout-families` (default `item_response` and
`damped_oscillation`, one per likelihood) are `heldout_family`; in every other family the
instances with `K % 10 == 9` are `heldout_instance`; the rest is `train`.

To fine-tune with `train/sft_lora.py`, which expects whole conversations, map each demo row to
`{"messages": row["prompt"] + [{"role": "assistant", "content": row["completion"]}]}` and
train on the last turn only; that script currently trains on every assistant turn, which for
`source: random` rows would include the random experiments. That adapter is not written.

### EIG labels: how noisy are they?

`eig` comes from `Posterior.eig` on the trajectory's own 20,000-particle posterior: one call
with `k = 4096` for bernoulli families, and the mean of 8 calls with `k = 1024` for gaussian
families, where the estimator is nested Monte Carlo and much noisier per call.
`datagen.eig_stability` re-estimates a row's labels 5 times in three ways (`single`: one
call; `same`: the label procedure repeated on the same posterior; `indep`: the label procedure
on a freshly built posterior for the same data) and reports the sd of the normalised reward
`eig / max(eig)`, how often the top candidate agrees, the rank correlation between repeats,
and the regret of trusting one estimate.

**Status: only a 2-states-per-family smoke run exists** (three families, and for the gaussian
one with a single call rather than the 8 now used):

| Family | sd of reward | top-1 agreement | Spearman | top-1 regret |
|---|---|---|---|---|
| `dose_response`, `hyperbolic` (bernoulli, k = 4096) | 0.003 to 0.007 | 1.00 | 0.99 | 0.000 |
| `exp_decay` (gaussian, one call at k = 1024) | 0.05 | 0.6 to 0.7 | 0.9 | 0.016 |

So bernoulli labels look stable, and single-call gaussian labels do not: the top candidate
changed in a third of the repeats, although the candidates it swapped between were near-ties
(regret 0.016). That is why gaussian labels now average 8 calls, which should cut the noise by
about 2.8×; this has not been measured. `experiments/spec_modal.py::stab --states 20` measures
it and writes `results/spec_eig_stability.json`.

### Throughput

**Status: no real batch has been generated.** The only measurements are two local smoke runs:

| Run | Tasks | Rows | Bernoulli rows / CPU-s | Gaussian rows / CPU-s |
|---|---|---|---|---|
| 3 families, 3 processes, single-call gaussian labels | 6 | 72 | 16.7 | 1.38 |
| 5 families, 1 process, current settings | 5 | 60 | 60.6 | 0.59 |

The bernoulli figures differ by 4× between the runs and each rests on 3 or 4 tasks; the
gaussian figure rests on 2 tasks. Taking the second run and the 10-family mix (6 gaussian,
4 bernoulli, 12 rows per task each), gaussian tasks dominate and the mix comes to about 1 row
per CPU-second: roughly **28 CPU-hours per 100k rows and 280 CPU-hours per 1M rows**, good to
a factor of two at best. Rows average 3.4 kB, so about 3.4 GB per 1M rows. Gaussian cost is
mostly the nested Monte Carlo EIG (reference designs over 64 candidates, plus the labels);
bernoulli-only data would be 30× to 100× cheaper.

To generate and measure a real batch (48,000 rows requested):

```bash
uv run --no-project --with modal --with numpy --with scipy --with pyyaml \
    modal run --env 3-sigma-submission experiments/spec_modal.py::gen --instances 400 --out data/v1
```

`data/` is git-ignored except `data/sample_rows.jsonl` (20 rows: design, demo, predict, demo
for five families, from the 1-process run above).

## 5. Known limits

* **Likelihoods.** Only the two families the grader scores: Bernoulli with probability `p`,
  and Gaussian with a constant noise sd. No heteroscedastic noise, counts, or censoring.
* **Priors are independent** across parameters, and there are no vector parameters, sums or
  loops in expressions. Location finding with one source fits (`specs/location.yaml`); with K
  sources each coordinate has to be written out by hand and the posterior has K! symmetric
  modes, which the particle posterior is not checked for. A mixture or hierarchical model does
  not fit.
* **Design sampling** is a uniform (or log-uniform) box with optional rejection constraints.
  The hand-written environments use other proposals (`Hyperbolic`: `dR` conditional on `iR`;
  `LocationFinding`: Normal(0, 1.5)), so the spec versions of those two have the same
  likelihood (tested to 1e-12) but a different distribution of random and evaluation designs.
  Results on `hyperbolic` and `spec:hyperbolic` are therefore not interchangeable.
* **Gaussian outcome scale.** `task._clean` clips submitted sds to [0.05, 50], so a spec is
  rejected unless its noise sd is at least 0.1 and its prior predictive sd at most 25, in
  every unit. This is why only one spec rescales the outcome, and only by 10.
* **Units** rescale designs and outcomes only. Parameters keep internal units in the model
  card.
* **The reference is a 20,000-particle approximation.** The sweep measures how far it is from
  an independent importance-sampling posterior, but has not been run; `damped_oscillation`
  (multimodal in the frequency) and `peak_location` are the likeliest to degenerate.
* **Reward normalisation is per task.** `bayes_raw` divides by (score of θ* − score of the
  prior), which is small when θ* happens to be a value the prior already predicts well. The
  raw score then has a heavy left tail even for the exact posterior. The sweep table reports
  the clipped reward, like `docs/RESULTS.md`; means of raw scores are in the summary JSON.
