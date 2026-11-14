# Bitshift Happens

**Team 3-Sigma · Junction 2026 · AfterQuery "Break the Agent"**

> Obsessed about maximizing shareholder value.

An RL environment for **Bayesian experimental design**: the agent runs a limited number of
experiments on a hidden system, then states what it believes. Because the simulator is known,
the grader scores the agent against the **exact Bayesian posterior**. That gives a reward that
is a proper scoring rule, is exactly 0 for doing nothing, splits an agent's loss into *bad
experiments* and *bad belief updating*, and comes with a statistical test for leaked
information.

Full results: [`docs/RESULTS.md`](docs/RESULTS.md). Preprint source: [`paper/`](paper/).

## The task, in the organisers' three questions

**What the agent has to do.** It is dropped into a small lab with a hidden system (how a
person trades money now against money later; where a signal source sits; which fault a reactor
has; which reaction mechanism is at work). Through MCP tools it runs a limited number of
experiments of its own choosing, sees noisy results, and then submits what it believes:
predictive distributions for held-out conditions, or probabilities over the candidate
hypotheses. It has a shell with Python and may write code.

**Why it is hard.** Two skills are needed and both are graded: choosing experiments that
actually discriminate, and turning noisy data into *calibrated* probabilities. Being roughly
right is not enough; overconfidence is penalised and hedging earns nothing. Frontier models
mostly choose reasonable experiments and then fail the second part: their stated beliefs do
not follow from their own data. On hyperbolic discounting, where each experiment yields a
single yes/no, Claude Code with Opus 5.5 scores 0.24 against 0.95 for the reference.

**How it is scored.** The verifier writes one number in [0, 1] to `/logs/verifier/reward.txt`
(and a breakdown to `/logs/verifier/details.json`). 0 is what you get for submitting the prior,
i.e. for learning nothing; 1 is what you would get if you knew the hidden truth. In between it
is the normalised expected log score of the submission under the true hidden state, a proper
scoring rule, so the best strategy is to report honest, calibrated beliefs. The score is
computed inside the environment container from its own state, never from files the agent
wrote, and the hidden state is salted per trial so it cannot be recomputed from the code.

## Headline numbers

Reward is normalised so the prior scores 0 and knowing the hidden parameters scores 1.

| Agent | Hyperbolic discounting | Location finding |
|---|---|---|
| Bayesian reference | 0.95 | 0.99 |
| Random experiments, exact inference | 0.54 | 0.75 |
| Do nothing | 0 | 0 |
| Claude Opus 5.5, no tools (n = 15) | 0.11 | 0.40 |
| Claude Code + Opus 5.5, shell and Python (15 trials) | 0.24 | 0.77 |
| Codex + GPT-6 Luna, shell and Python (15 trials) | 0.06 | 0.12 |
| OpenCode + Gemma 4 26B (15 trials) | 0.00 | 0.00 |
| Gemma 4 4B, no tools, untrained (n = 50) | 0.00 | 0.01 |
| Gemma 4 4B after supervised fine-tuning (n = 50) | 0.36 | 0.11 |
| Gemma 4 4B after fine-tuning + GRPO on the reward (n = 50) | 0.50 | 0.03 |

The tool-using rows ran in different agent harnesses, so they confound model and harness.
A naive accuracy grader puts the same tool-free models at 0.92–0.96 against 0.98 for the
reference, and gives 0.92 to an agent that runs no experiments.

What does **not** break agents: the discrete chemistry lab (`tasks/chem`). Claude Code + Opus
5.5 and Codex + GPT-5.6 Terra match the reference there (mean gap +0.006 and −0.002 nats).
The stochastic wet lab (`tasks/wetlab`) has not yet been run against a language model.

## Reproduce the evaluation (one command)

Requirements: Docker running, Python 3.12, and Harbor (`uv tool install harbor`, tested with
0.25.0).

```bash
MODEL=<provider/model> ./scripts/eval.sh     # reference + 3 agent runs + do-nothing + stop-early
SKIP_AGENT=1 ./scripts/eval.sh               # no API key needed: reference + baselines only
TASK=tasks/wetlab SKIP_AGENT=1 ./scripts/eval.sh
TASK=tasks/battleship MODEL=<provider/model> ./scripts/eval.sh   # also runs a gamble baseline
                                                                # and prints unclipped scores
```

Or run Harbor directly on any task, with the OpenCode harness:

```bash
harbor run -p tasks/bayes/hyperbolic-0 -a opencode -m <provider/model>
harbor run -p tasks/bayes -a oracle          # the reference solution on all ten tasks
```

Agent runs need your own API key for `MODEL`'s provider (for example `ANTHROPIC_API_KEY`).
Results go to `jobs/<timestamp>/`.

## Run logs

Harbor job folders from our own runs are in `results/`:

| Folder | What |
|---|---|
| `results/e5/` | OpenCode + Gemma 4 26B and OpenCode + Nemotron on the ten Bayes tasks |
| `results/e7/` | Claude Code + Opus 5.5, Codex + GPT-6 Luna and OpenCode + MiniMax-M3 on the ten Bayes tasks, 3 attempts each |
| `results/e8/` | reference, do-nothing, Opus 5.5 and GPT-5.6 Terra on the chemistry lab and the wet lab |
| `results/playthroughs/` | four complete agent trajectories (tool calls and reasoning), one per harness plus one success |

These runs predate the switch to `reward.txt`; their score is the `reward` field of
`verifier/reward.json` in each trial folder.

## Environments

| Task set | Hidden | Agent submits | Reference |
|---|---|---|---|
| `tasks/bayes` hyperbolic-0..4 | 2 parameters of a discounting curve, binary outcomes | predictive probabilities for 30 held-out designs | exact (particle) posterior |
| `tasks/bayes` location-0..4 | position of a signal source, continuous outcomes | Gaussian predictions for 30 held-out designs | exact (particle) posterior |
| `tasks/chem` chem-0..4 | one of 7 reactor faults | probabilities over faults | exact, by enumeration |
| `tasks/wetlab` wetlab-0..4 | one of 6 reaction mechanisms plus rate constants, stochastic kinetics, limited stock | probabilities over mechanisms | approximate, simulation-based |
| `tasks/battleship` battleship-0..4 | one of 6 ship-placement rules plus the ship layout; noisy shots and row/column scans on a budget | probabilities over rules + probability per cell | exact, by enumeration ([`docs/BATTLESHIP.md`](docs/BATTLESHIP.md)) |

**Rulebound Battleship** is the wet lab with the domain swapped (rule = mechanism, ship
positions = rate constants, a shot = an experiment), small enough that everything is exact.
Over 400 paired boards the reference scores 0.53 (unclipped) and every honest baseline,
gaming strategy and coding-bug proxy scores below it; a noise-ignoring coder loses 0.45. Play
it or replay agent runs with `python scripts/battleship_ui.py` (http://localhost:8050).

Every task runs the environment as an MCP server in its own container, keeps the hidden state
behind a per-trial secret salt, and exposes the grade only through a token-protected endpoint.

More families can be declared in a few lines of YAML (`specs/`, see
[`docs/TASK_SPEC.md`](docs/TASK_SPEC.md)); the generator turns them into tasks and training
rows. Its large-scale sweep has not been run yet.

## Layout

```
bayesenv/            environments, particle posterior, grader, policies, LLM text protocol
  chem_lab.py        discrete chemistry lab        (docs/CHEM_LAB.md)
  wetlab.py          batched Gillespie wet lab     (docs/WETLAB.md)
  spec.py            YAML task syntax              (docs/TASK_SPEC.md)
templates/           Harbor task templates (bayes_task, chem_task, wetlab_task)
specs/               task families in the YAML syntax
scripts/             render_tasks.sh, eval.sh, calibration and data-generation scripts
experiments/         E1–E6 experiment and analysis scripts (Modal CPU fan-out)
train/               LoRA fine-tuning and GRPO on the exact reward
infra/, ops/         Modal and Verda launch and teardown scripts
results/             LLM run data and small summaries (see below)
paper/               LaTeX source of the preprint (`latexmk main.tex`)
tests/               reward-integrity and environment tests
```

## What is and is not in git

Tracked: code, templates, docs, the data from paid LLM runs (`results/e3*.jsonl`,
`results/e4.jsonl`, `results/e5/`), and small summary files that the docs cite.

Not tracked, because it can be regenerated:

| Artifact | Regenerate with |
|---|---|
| Red-team tasks (`tasks/redteam`) | `./scripts/render_tasks.sh` |
| E1/E2 policy grid (`results/e12.jsonl`) | `modal run experiments/batch.py --seeds 400 --out results/e12.jsonl` |
| E6 attack data (`results/e6_*.jsonl`) | `modal run experiments/e6_stealth.py --seeds 400 --out results/e6_stealth.jsonl`; the no-information attacks are policies in `bayesenv/policies.py`, run through `experiments/batch.py --policies ... --seed0 2000 --out results/e6_attacks.jsonl` |
| Figures (`results/fig_*.png`) | `python experiments/plots.py` |
| Chemistry and wet lab calibration | `python scripts/chem_calibrate.py`, `python scripts/wetlab_calibrate.py` |
| Training rows (`data/`, `results/sft/`) | `python scripts/gen_training_data.py --specs specs/*.yaml --instances N --out data/v1` |
| Preprint PDF | `cd paper && latexmk main.tex` |

The rendered Harbor tasks in `tasks/bayes`, `tasks/chem` and `tasks/wetlab` are tracked, so
that `harbor run -p tasks/...` works on a fresh clone. They are generated from `templates/` by
`scripts/render_tasks.sh`; edit the templates, not the rendered copies.

## Tests

```bash
uv run --no-project --with numpy --with scipy --with pyyaml --with pytest \
  pytest -q tests/test_env_reward.py tests/test_chem.py tests/test_wetlab.py tests/test_spec.py
```

`tests/test_model.py` and `tests/test_predict.py` belong to the original project template and
are unrelated to the environment.

## Known limits

- Sample sizes for the expensive models are 12–25 episodes per environment.
- The reported reward is normalised per episode and clipped; the proofs in the preprint cover
  the unnormalised score.
- The wet lab's reference is approximate.
- API keys are read from the environment; none are stored in this repository. Use your own.
