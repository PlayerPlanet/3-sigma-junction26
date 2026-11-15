# CLAUDE.md

Team 3-Sigma, Junction 2026. This repo is an RL environment for Bayesian experimental design:
an agent runs a few experiments on a hidden system and is graded against the Bayesian
posterior. Read `README.md` for the overview and `docs/RESULTS.md` for results.

## Building a new lab: pick the route first

| Your lab looks like | Route | Effort |
|---|---|---|
| One experiment = pick numbers, get one yes/no or one noisy number; the model is a formula with unknown parameters | **YAML spec** in `specs/` (`docs/TASK_SPEC.md`) | minutes, no Python |
| Hidden state is one of a few named hypotheses and the likelihood is a formula | copy `bayesenv/chem_lab.py` | about an hour |
| Stock that runs out, several readings per run, stochastic kinetics, anything without a formula for the likelihood | copy `bayesenv/wetlab.py` | a few hours |

The YAML syntax does **not** support: named hypotheses to identify, state that carries over
between experiments (stock, vessels), time-series outputs, count/Poisson outcomes, or
simulators without a closed-form likelihood. Do not stretch the syntax for these; use the
Python routes and the shared helpers below.

A YAML spec gets the grader, the Bayesian reference, the baselines and the training-data
generator with no extra code. Add `specs/<name>.yaml`, then:

```bash
PY="uv run --no-project --with numpy --with scipy --with pyyaml --with pytest python"
$PY -c "from bayesenv.task import Task; from bayesenv.policies import bayes_oracle, random_design; \
from bayesenv.task import grade; t=Task('spec:<name>', 0); ep=t.episode(); print(grade(t, ep, bayes_oracle(ep)))"
```

Check that the reference scores well (above about 0.8) and clearly above `random_design`. If
random is as good as the reference, the lab has no room for experiment choice to matter.

## Shared helpers (reuse these, do not rewrite them)

**Core (`bayesenv/`)**
- `task.Task(env_name, seed)`, `Task.episode()` → `Episode.observe(x)`, `.finish()`, `.data()`:
  the experiment loop with budget enforcement and salted hidden state.
- `task.grade(task, episode, pred)`: all rewards and the leak-test p-value for one episode.
  `bayes_reward`, `naive_reward`, `ceiling_ppc`, `expected_logscore` are the pieces.
- `bayes.Posterior(env, rng, n)`: particle posterior for any environment with a `loglik`.
  `.update(x, y)`, `.predictive(xq)`, `.eig(candidates)`, `.best_design()`, `.sample(k)`.
- `policies.POLICIES`: `bayes_oracle` (the reference), `random_design`, `do_nothing`,
  `stop_early`, plus attack policies. Every new lab should be compared against these.
- `envs.get_env(name)`: resolves hand-written environments and `spec:<name>` ones.
- `llm_agent.system_prompt`, `parse_predictions`: the text protocol for tool-free LLM runs.

**YAML specs**
- `spec.load_spec(path)`, `spec.resolve("spec:<name>[#K]")`, `spec.spec_names()`.
- `datagen.instance_rows(...)`, `design_reward(row, completion)`,
  `predict_reward(row, completion)`, `validate_row(row)`: training rows and their rewards.
- `scripts/gen_training_data.py`, `experiments/spec_sweep.py`.

**Hypothesis labs (chemistry lab, wet lab)**
- Interface to copy: `ChemLab` / `WetLab` with `reset(seed, salt)`, `step(action)`,
  `submit(posterior)`; module-level `rules()`, `validate(action)`, `run_policy(policy, seed)`,
  `reference_trajectory(seed, salt)`.
- `chem_lab.salted_key(seed, salt, tag)`: seed every hidden draw through this, so the hidden
  state cannot be recomputed from public code and the seed.
- `chem_reward.parse_belief`, `mix`, `score` (and `wetlab_reward.*`): the reward
  `log q(h*) − log p0(h*)`, where the prior scores exactly 0. New reward ideas go in these
  modules, not in the engines.
- `wetlab.simulate(x0, rates, times, uniform, xp=np)`: batched Gillespie simulator, one call
  for many vessels. `wetlab.simulate_trajectories(mechanism, params, action, n)` returns full
  trajectories for plotting.
- `wetlab.Belief`, `wetlab.eig`: simulation-based posterior over mechanisms and design scoring.
- `wetlab_baselines`: ODE-based "competent coder" baselines to check a lab is hard enough.

**Harbor packaging**
- `templates/{bayes_task,chem_task,wetlab_task}/`: copy the closest one. Each has the MCP
  server (`environment/mcp-server/server.py`), the token-protected `/grade` endpoint, the
  oracle `solution/solve.sh` and the verifier `tests/test.sh`.
- `scripts/make_*_tasks.py` render a template per seed; `scripts/render_tasks.sh` renders all.
- `scripts/eval.sh`: reference, do-nothing, stop-early and agent runs in one command.

**Demo use** (no Docker needed): `docs/CHEM_LAB.md` and `docs/WETLAB.md` each have a short
snippet. `step()` returns the reading(s) and the current posterior, ready for a bar chart.

## Rules for any new lab

- Doing nothing must score exactly 0, and the reference must beat random experiments with a
  paired confidence interval that excludes 0. Calibrate before running any LLM
  (`scripts/chem_calibrate.py` is the pattern).
- The reward must depend only on the hidden truth and the submission, never on an approximate
  posterior. Approximate posteriors are fine for the reference and for reporting.
- A lab with a few discrete hypotheses and a closed-form likelihood does not challenge coding
  agents: Opus and GPT-5.6 match the reference on the chemistry lab. Difficulty comes from
  continuous parameters, likelihoods without a formula, or costly experiments.
- Reject invalid actions without consuming budget; enforce the budget and a single submission
  in the server, not in the instructions.
- State in the docs when a reference is approximate.

## Repo conventions

- Rendered tasks in `tasks/bayes`, `tasks/chem` and `tasks/wetlab` are tracked so that
  `harbor run -p tasks/...` works on a fresh clone. Never edit them by hand: change
  `templates/` and run `scripts/render_tasks.sh`.
- Every verifier writes one score in [0, 1] to `/logs/verifier/reward.txt` (the organisers'
  required format) and the full breakdown to `/logs/verifier/details.json`.
- Do not commit other generated files: simulation outputs, figures, logs, `data/`, PDFs. `.gitignore` lists them and the README
  says how to regenerate each. Data from paid LLM runs is the exception and is tracked.
- Never commit API keys or salts. Keys come from the environment or a git-ignored `.env`.
- Heavy computation goes to Modal CPU (`modal run --env 3-sigma-submission ...`, pattern in
  `experiments/e6_stealth.py`), not the laptop. No `modal deploy` for experiments.
- Run Python with `uv run --no-project --with numpy --with scipy --with pyyaml --with pytest`.
  On Windows, prefix Modal commands with `PYTHONIOENCODING=utf-8 PYTHONUTF8=1`.
- Tests: `pytest -q tests/test_env_reward.py tests/test_chem.py tests/test_wetlab.py
  tests/test_spec.py tests/test_battleship.py tests/test_battleship_rows.py tests/test_battleship_open.py`.
- Every new lab gets a `tests/test_<lab>.py` (determinism under seed and salt, prior scores 0,
  invalid actions rejected, budget enforced, reference beats random) and a `docs/<LAB>.md`.
