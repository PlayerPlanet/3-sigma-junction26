# NeuronBench as a Harbor task (forecasting held-out interventions)

A wrapper around **NeuronBench** by Kevin Murphy
(https://github.com/murphyk/neuronbench, MIT licence; introduced in *Model Discovery Agent*,
arXiv 2608.09696), pinned at commit `c354622458c460b419cab821d482c879f0578377`. The benchmark
code is used unchanged; its licence file is vendored next to every copy. We added the Harbor
packaging, a salted private cell (see Integrity), a normalised score and a reference solver.

Why: our tasks where the agent names one of a few disclosed hypotheses are solved by coding
agents. NeuronBench scores **forecasts** of interventions the agent could not run, and the
hidden current is nearly silent under standard probes.

Files: `bayesenv/neuron.py` (lab, private cell, grader), `bayesenv/neuron_ref.py` (reference
solver and our batched simulator, numpy only), `templates/neuron_task/`,
`scripts/make_neuron_tasks.py`, `scripts/neuron_calibrate.py`, `tests/test_neuron.py`,
`tasks/neuron/<world>-0` for the six worlds.

## The task

A stochastic Hodgkin-Huxley neuron (Na+, K+, leak, Fox-Lu channel noise with 100 channels)
carries one hidden extra membrane current. The agent has a budget of **12** recordings
(NeuronBench leaves the budget to the runner; its example uses 8; 12 is our choice), then
forecasts the mean test-window spike count of six held-out test protocols.

MCP tools (server `neuron`):

| Tool | What it does |
|---|---|
| `get_rules` | Everything `world.problem()` discloses (text prior, reference model, protocol pool with segments, budget rule), plus the budget, the four blockers, custom-step bounds, the six test protocols (labels `T1..T6` with their segments), the observation model and the scoring. |
| `run_experiment(protocol \| amplitude + duration_ms, blockers, reps)` | Runs NeuronBench's `world.run` on the hidden cell: a pool protocol by label, or a custom single step (amplitude -50..30 uA, 1..500 ms), with any of TTX, TEA, Cd, XE991. Costs `reps`. Returns exactly what the benchmark's `Observation` holds: `spike_count` (mean test-window count over the repeats), one noisy voltage recording (first repeat, sd 2 mV, every 4 ms) with `time_ms` and `test_start_index`, and the remaining budget. |
| `submit_forecasts({label: count})` | One submission; all six labels required, finite numbers in [0, 1000]. |

Invalid actions (unknown label, a test label, bad numbers, unknown blocker, reps above the
remaining budget, incomplete forecasts) are rejected without consuming budget or the
submission. Budget and single submission are enforced in the server.

**Forward model.** The NeuronBench README says `world.simulate` "is the forward model a solver
uses to score its own candidate hypotheses; it consumes no budget", so agents are meant to
have it. We give it as local code, not as an MCP tool: the agent container has `/app/nbsim`,
which is NeuronBench's simulator files (`stochastic.py`, `_foxlu.py`, `blockers.py`,
`features.py`) and `worlds.py` **cut before the world registry** (so: `Chan`, `build_I`, the
deterministic integrator; no worlds, no targets, no discriminator). Reasons: an MCP `simulate`
would put every agent's fitting load on the server (about 1 s of one core per call), and an
agent with a Python shell is the setup we compare against. The full package, which contains
the truth of every public world, exists only in the MCP-server image.

There is no `discriminator()` anywhere in the agent's reach.

## Scoring

`score = clip(1 - MSE_agent / MSE_prior, 0, 1)`, written to `reward.txt`.

- MSE is NeuronBench's own `spike_forecast_mse`, unchanged: `evaluator.forecast_mse` (mean
  squared error minus the floor 0.25, floored at 0) against `evaluator.held_out_targets`
  (200 stochastic repeats of the true cell per test protocol). The lab calls these two
  functions directly so the targets are computed once, not once per call;
  `tests/test_neuron.py` checks the number equals `World.spike_forecast_mse`.
- `MSE_prior` is the same metric for the **no-experiment forecast**: the reference (plain
  Na+K) model's expected spike counts from the benchmark's forward model (200 repeats).
- No submission scores 0. Submitting the reference-model forecast scores exactly 0. If
  `MSE_prior < 0.05` the task has no room and every score is 0 (`degenerate_prior` in the
  details); not seen so far, but see Limits.
- `details.json`: `mse_agent`, `mse_prior` (floored and unfloored), per-protocol target /
  prior forecast / agent forecast, the family, the runs made, the pinned commit.
- The secondary `feature_forecast_mse` (voltage-trace forecasts) is not used.

## Integrity: can the truth be recomputed?

**In unmodified NeuronBench, yes, completely.** `neuronbench.worlds.WORLDS[name]` holds each
world's channel and parameters, `world._truth_kwargs` returns them,
`evaluator.held_out_targets(name, stochastic=True, N=100, seed=seed)` returns the exact
scoring targets (their random stream is `seed + crc32(label) % 10000`), and
`world.discriminator()` names the revealing protocol. The world name is not even needed: each
world has its own test protocols, so the test labels in `world.problem()` identify it. An
agent with the public package (it is one `pip install` from GitHub away, and Harbor agents
have network access) would score 1.0 with no experiment.

What we did:

1. The hidden cell is **not a public world**. `bayesenv.neuron.hidden_spec` builds a private
   world from one of the six families: channel parameters jittered (conductance and time
   constants x exp(U(-0.25, 0.25)), half-activation voltages +/- 2 mV), test protocols
   jittered (amplitudes and durations x U(0.92, 1.08)) and relabelled `T1..T6`, recording
   noise from its own stream. All three are drawn through `salted_key(seed, salt, tag)`; the
   salt is random per trial inside the server container (`TASK_SALT` empty) and never leaves it.
   The private world is registered under a random key in the server process, so NeuronBench's
   own `World.run` and evaluator run on it unchanged.
2. The family is set by `NEURON_WORLD` in the server's compose environment (empty = drawn
   from the salt). It is in the task directory name and `task.toml` name, which we believe
   Harbor does not show to the agent (**not verified**); nothing in the agent container,
   `get_rules` or the tool outputs names it (tested).
3. The agent container holds only the forward model; `discriminator()` is not exposed.

**What cannot be closed, plainly:**

- The six mechanism *families* and their nominal parameters are public (repository and
  paper). An agent that fetches the source can recognise the family from the shape of the
  test protocols and forecast with the public nominal channel. We measured this "public
  source" attack with `scripts/neuron_calibrate.py`: it scores **0.42 on z_rebound and 1.00 on
  ca_rebound** (one seed, one salt each; table below; the ca_rebound value is a floor
  artefact, see Limits). So the jitter removes the free 1.0 where the current has a clear
  effect, but public knowledge is still a strong prior, and with it the task becomes "which of six
  known currents, then fit five parameters" instead of open-ended discovery.
- **`na_fatigue` is not protected by the parameter jitter**: its mechanism is a flag
  (`slow_na=True`) whose kinetics are hard-coded in the simulator, so there is nothing to
  jitter without changing the benchmark's code. Only its test protocols are jittered. An
  agent that sets `slow_na=True` in the forward model has the exact truth. Note that the
  flag is also disclosed legitimately: `world.problem()["reference_model"]` shows
  `slow_na: False` and the forward model implements it.
- Custom single steps are allowed (the benchmark allows them), and some test protocols are
  single steps (all six for `textbook_M`, two for most others), so those can be measured
  almost directly at slightly different values. `textbook_M` is the benchmark's control.

## Reference solver (approximate)

`solution/solve.sh` plays through the same MCP tools with `bayesenv/neuron_ref.py`:

1. Fixed design: the five non-standard pool protocols twice each, then the long and brief
   steps once (12 units). No adaptive design, no blockers.
2. A library of 162 candidates: plain, slow Na inactivation, and 40 random draws from broad
   priors for each of four generic families (I_h, low-threshold inward with inactivation,
   inactivating K, slow non-inactivating K).
3. Gaussian synthetic likelihood per recording on: mean spike count, and the median
   sub-sampled voltage in the second half of each protocol segment (6 particles per candidate).
4. Forecast: posterior-weighted mean simulated spike count per test protocol (top 30
   candidates, 24 particles).

NeuronBench's simulator advances one mechanism per call, which would make this take tens of
minutes, so the reference uses **our own batched re-implementation** of the same stochastic
model (`neuron_ref.simulate_batch`, all candidates in one call). It is checked against
NeuronBench in the tests (means agree within Monte Carlo error) and reproduced the public
`ca_rebound` targets to within 0.4 spikes. An agent may write the same thing; nothing in it
uses the hidden cell.

Caveat: the four families were chosen by someone who had read the NeuronBench source. They
are standard textbook current types, but the library is not a blind one.

### What was actually run (laptop, one core, in-process, no Docker)

`scripts/neuron_calibrate.py --worlds <w> --seed 0 --salt calibration`:

| World | Reference score | MSE reference | MSE prior (no experiment) | "Public source" attack score | Solve time |
|---|---|---|---|---|---|
| z_rebound | 0.76 | 1.17 | 4.85 | 0.42 | 71 s |
| ca_rebound | 1.00 (floor artefact, see below) | 0.00 (0.23 before the floor) | 0.24 (0.49 before the floor) | 1.00 | 79 s |

One seed and one salt per world: these are single observations, not averages. The other four
worlds were **not run** with the reference.

Read the two rows differently. On `z_rebound` the reference clearly beats the no-experiment
forecast (MSE 1.17 against 4.85) and the public-source shortcut (0.42). On `ca_rebound` the
no-experiment forecast is already within 0.7 spikes (root mean square) of the targets, and
the benchmark's floor treats anything within 0.5 as exact: the reference's errors (0.48
spikes RMS) fall under the floor, so it gets 1.0, and so would many forecasts. That 1.0 does
not show skill; it shows the task has almost no room there.

## Limits and what is not verified

- **Effect sizes are small in the stochastic form.** With the public nominal channels and
  our batched simulator (100 repeats), `MSE_prior` is about 13.6 (z_rebound), 47 (textbook_M),
  4.8 (na_fatigue), 3.1 (d_type), 1.5 (h_sag) and **0.5 (ca_rebound)**, while one recording's
  spike count has a standard deviation of 1.2 to 2.1 spikes and the 200-repeat targets
  themselves have a standard error of about 0.15. On `ca_rebound` and `h_sag` the hidden
  current moves the test counts by about one spike, so the score there is dominated by
  noise and by how well the forecaster knows the plain model; expect unstable
  scores (0 or 1 for small differences, because of the floor) from any method. In the
  ca_rebound run above `MSE_prior` was 0.24: the whole range from score 0 to score 1 is a
  change of 0.2 spikes RMS. Treat `z_rebound`, `textbook_M`, `na_fatigue` and `d_type` as the
  usable tasks until this is calibrated over seeds. With the jitter, `MSE_prior` changes per trial (z_rebound gave 4.85 in the run
  above against 13.6 nominal).
- Not run: `docker build`, `harbor run` (oracle, nop or any agent), the verifier script in a
  container. The MCP server of a rendered task was started as a local process and played
  through a fastmcp client (tools, rejections, single submission, token-protected `/grade`),
  which worked.
- Not done (repo rule for new labs): a paired comparison of the reference against random
  experiments with a confidence interval, and any multi-seed calibration. Use Modal for that.
- Results are **not comparable with the paper's numbers**: the cell is jittered, the budget
  is ours, and the score is normalised.
- Whether Harbor exposes the task name to the agent was not checked.

## Cost (for the 4-core Harbor VM)

The simulator's time loop is in Python: about 0.1 ms per time step and almost independent of
the number of repeats. Measured on the laptop: `run_experiment` 0.6 to 3.3 s per call
(protocols of 140 to 760 ms); one forward simulation in `/app/nbsim` 1 to 2 s. At start-up
the server computes the targets and the prior forecast in a background thread (12
simulations of 200 repeats): 22 to 25 s on an idle core, over 2 minutes on a busy one;
`/grade` waits for it. An agent that fits by simulation will keep one core busy for minutes
in its own container; the server stays light.

## Run

```bash
uv run --no-project python scripts/make_neuron_tasks.py            # clones the pinned commit
harbor run -p tasks/neuron/z_rebound-0 -a oracle                   # reference
harbor run -p tasks/neuron/z_rebound-0 -a nop                      # expected reward 0
harbor run -p tasks/neuron/z_rebound-0 -a opencode -m <provider/model>
```

Tests (need a NeuronBench checkout at the pinned commit; skipped otherwise):

```bash
NEURONBENCH_SRC=/path/to/neuronbench uv run --no-project --with numpy --with pytest \
    python -m pytest -q tests/test_neuron.py
```
