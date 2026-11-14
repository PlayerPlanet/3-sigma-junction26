# Lab rows: a zero-shot design evaluation set from the lab simulators

Design rows in the schema of the training rows (`docs/TASK_SPEC.md`), built from the four lab
simulators instead of the toy spec families. A model trained only on the toy families reads the
same kind of prompt (exact model, history, six candidate experiments), answers in the same
format (`<observe>[design]</observe>`), and is scored by the same function
(`datagen.design_reward`, unchanged). No language model was run on these rows yet.

Code: `bayesenv/lab_rows.py`, `scripts/gen_lab_rows.py` (local), `experiments/lab_rows_modal.py`
(Modal CPU fan-out, same output), `tests/test_lab_rows.py`. Output: `data/lab_transfer/rows.jsonl`
and `meta.json` (not committed; `data/` is ignored), plus the committed 12-row
`data/lab_transfer/sample_rows.jsonl` (three rows per lab) and `wetlab_stability.json`.

```bash
# everything, on Modal (about 16 container-minutes at 2 CPUs, most of it the wet lab; 70 s wall):
modal run --env 3-sigma-submission experiments/lab_rows_modal.py::gen --rows 400 --wetlab-rows 200 \
    --out data/lab_transfer --sample-out data/lab_transfer/sample_rows.jsonl
# or locally, single process (chem + diag take under a minute, dag about 5, wetlab about 20):
uv run --no-project --with numpy --with scipy --with pyyaml python scripts/gen_lab_rows.py
uv run --no-project --with numpy --with scipy --with pyyaml --with pytest python -m pytest tests/test_lab_rows.py -q
```

Generation is deterministic: seeds are a fixed function of lab, source and depth, so both
runners are meant to write the same rows. Checked for the chemistry and diagnostic labs (the 800
rows from a Windows laptop and from Modal are identical); not checked for the DAG lab and the
wet lab, whose full sets were only generated on Modal. The committed numbers and sample are from
the Modal run.

## What is in the file

| Lab (`spec`) | Rows | Depths | Chance | Near-flat (chance > 0.9) |
|---|---|---|---|---|
| `lab:chem` | 400 | 0 to 9 (40 rows each) | 0.421 | 0.000 |
| `lab:diag` | 400 | 0 to 4 (80 rows each) | 0.432 | 0.000 |
| `lab:dag` | 408 | 0 to 5 (68 rows each) | 0.750 | 0.017 |
| `lab:wetlab` | 200 | 0 to 3 (50 rows each) | 0.391 | 0.000 |

Chance by depth: `lab:chem` 0.36, 0.38, 0.42, 0.45, 0.41, 0.45, 0.44, 0.44, 0.43, 0.43; `lab:diag` 0.36, 0.50, 0.48, 0.44, 0.37; `lab:dag` 0.83, 0.83, 0.74, 0.70, 0.70, 0.70; `lab:wetlab` 0.38, 0.43, 0.39, 0.36.

"Chance" is the expected `design_reward` of a uniformly random candidate, mean over rows of
`mean(eig) / max(eig)`. "Near-flat" is the share of rows whose chance exceeds 0.9, where the
choice hardly matters. A model that always picks the best candidate scores 1.

Every row has `kind: "design"`, `split: "lab_transfer"`, `instance: -1`, `spec` = `lab:chem`,
`lab:diag`, `lab:dag` or `lab:wetlab`, `env` = `SPEC@HASH` with `spec_hash` the hash of the lab's
`rules()`, and `source` = whose experiments are in the history (`reference` or `random`). One
fresh seed per row; rows are balanced over (source, depth) cells, including the empty history.
The hidden truth is drawn by the lab itself with the salt `lab_transfer` and is never written.
A seed is skipped (and the next one used) when its state cannot give a usable row: fewer than
six affordable candidates (diag, wetlab), or no candidate with at least 0.001 nats of
information gain because the belief has already collapsed onto one hypothesis (this happens in
the chemistry lab, in roughly one state in ten, mostly late in reference trajectories; 0.02 nats
for the wet-lab estimates). The rows therefore over-represent states where something is left to
learn.

| Lab | Design shown to the model | History comes from | `eig` label |
|---|---|---|---|
| `lab:chem` | `[temperature, time, concentration]` | greedy information gain on the lab's grid / uniform random conditions | exact expected information gain about the fault hypothesis (`chem_lab.eig`, 12-point Gauss-Hermite) |
| `lab:diag` | `[test]`, the number of a test in the list (1 to 15) | the exact dynamic-programming policy / uniform random affordable tests | exact one-step information gain about the cause (`diag.info_gain`) |
| `lab:dag` | `[variable, value]`, or `[-1, 0]` to observe | the lab's reference (greedy information gain) / uniform random action | exact information gain of ONE more joint sample about (graph, tables) (`dagnet.Belief.eig("joint")`) |
| `lab:wetlab` | `[substrate, catalyst, product_spike, temperature, t1, t2, t3]` | the lab's reference / its random policy | estimate: mean of 8 calls of `wetlab.eig` (48 simulations per mechanism) on the lab's particle belief |

Candidates mirror `datagen.design_candidates`, which always includes the information-gain-best
design of a random pool of 64 next to 5 random designs:

- chem: 5 uniform random conditions + the best of a pool of 64 random conditions.
- dag: the menu has only 11 actions, so the pool is the whole menu: the best action + 5 others.
- diag: the pool is every affordable unused test: the best one-step test, **and also the test
  that exact planning prefers** (a deliberate addition, so that `value` can always be
  maximised), then random other affordable tests. States with fewer than six affordable unused
  tests are skipped, which is why the depth stops at 4.
- wetlab: 5 random affordable runs + the best of 40 runs from the lab's grid (ranked by one
  call of the estimator, as the lab's reference does).

Family is `gaussian` for chem and wetlab and `categorical` (new value) for diag and dag.

## Planning value in the diagnostic lab

Diagnostic rows carry three more fields:

- `value[i]`: the exact expected final reward (nats, `log q(cause*) - log prior(cause*)` for the
  exact posterior) if candidate `i` is run now and the optimal policy is followed afterwards
  within the remaining budget. From the same backward induction as `diag.exact_dp`
  (`lab_rows.DiagPlanner` keeps the value tables that `exact_dp` discards; a test checks that
  both give the same optimum, 1.6196 nats at the start).
- `greedy_choice` = `argmax(eig)`, `dp_choice` = `argmax(value)`. If the greedy candidate is
  within 1e-9 of the best value, `dp_choice` is set to it, so the two differ only when the
  one-step choice loses expected reward.

In the generated file greedy and optimal choices differ in **232 of 400** diagnostic rows (by depth 0 to 4: 80, 51, 43, 37, 21; every cell has 80 rows). In those rows the greedy candidate gives up 0.326 nats of expected final reward on average. A uniformly random candidate gets 0.63 of the way from the worst to the best candidate's value (mean over rows of `(mean(value) - min(value)) / (max(value) - min(value))`).

Scoring a model against planning value is up to the consumer, for example
`row["value"][i] == max(row["value"])`, or the regret `max(value) - value[i]` in nats.
`design_reward` only looks at `eig`.

## How close the prompts are to the toy rows

Same message layout: system prompt, `Begin. Run your first experiment.`, then alternating
`<observe>[...]</observe>` and `Result: ...` turns, and the candidate list appended to the last
user turn, character for character the text of `datagen.candidates_message`. The system prompt
has the same five paragraphs in the same order (role line; scenario ending in "Design an
experiment by choosing [...]" and what the outcome is; "Exact generative model: ..."; the limit
and "Choose each one to learn as much as possible; ..."; the answer format with an example tag
and `<done/>`). A test asserts this layout.

Differences that could not be avoided:

- The model paragraph is longer: hypotheses, causes, nuisance factors and tests are numbered
  lists inside it (the diagnostic prompt is about 6,500 characters).
- The final task is a probability for each hypothesis, cause or mechanism (or, for the DAG lab,
  intervention forecasts), so the sentence after "you will then be asked" and the last line
  ("In the final phase you must answer with ...") differ from the toy "predict outcomes for new
  designs" wording.
- Designs are numbers because `design_reward` parses a numeric list: a diagnostic test is its
  number in the list, a DAG action is `[variable, value]` with `[-1, 0]` for observation.
- Results are not always one number: a test outcome is a name (`Result: second_peak_larger.`),
  a DAG result is three samples (`Result: [[0, 1, 1, 0, 1], ...].`), a wet-lab result is three
  readings. The diagnostic lab reports `Budget remaining: 7.` and the wet lab
  `Stock remaining: substrate 400, ...` instead of `Experiments remaining: 7.`.
- The wet lab allows 1 to 6 sampling times; the rows always use 3 (as the lab's own grid and
  random policy do) and say so.

## Honest limits

- **DAG labels are per sample.** An experiment returns 3 joint samples; the label is the exact
  gain of one sample, which is what the lab's reference policy maximises. The ranking under the
  exact 3-sample gain was not computed and may differ in close cases.
- **DAG rows at depth 0 are all the same question.** By symmetry every intervention has the same
  gain and observing has more, so the only thing to get right is "observe" (chance 0.83).
- **Wet-lab labels are estimates** on an approximate particle posterior, and cannot be recomputed
  from the row. Re-estimated on 30 fresh states (4 repeats each, `experiments/lab_rows_modal.py::stab`): the top candidate is the same in 99% of repeats on the same particle belief and 98% on an independently rebuilt belief; the reward `eig / max(eig)` of a candidate moves by 0.021 / 0.025 (standard deviation, mean over candidates); trusting one estimate costs 0.000 / 0.001 of reward under the mean estimate. States whose best
  estimated gain is below 0.02 nats are skipped (there the labels are noise).
- **Chemistry and diagnostic labels are exact** given the printed history (yields are printed to
  6 significant digits and the labels use the printed values). A test recomputes them from the
  prompt alone, and checks the chemistry quadrature against plain Monte Carlo.
- Diagnostic states at depth 0 are one state (the empty history) seen with different candidate
  sets, and the table is the hand-designed `low_yield` one (`docs/DIAG.md`, "Honesty first"):
  the high share of greedy/planning disagreements is a property of that table.
- Seeds are in the rows and the salt is in the code, so the hidden truth can be recomputed by
  anyone who runs the simulator. That does not matter for these rows (the labels do not depend
  on the truth beyond the printed history), but they are not a secret test set.
- `datagen.validate_row` was extended, backwards-compatibly: split `lab_transfer`, family
  `categorical`, and the optional design fields `value`, `greedy_choice`, `dp_choice` (all three
  or none). The copies of `datagen.py` inside the rendered `tasks/` directories were not
  re-rendered.
