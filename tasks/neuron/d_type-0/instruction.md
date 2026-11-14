# Forecast a neuron's response to protocols you cannot run

An MCP server named `neuron` is connected to you. A single neuron is recorded in current
clamp. It is a Hodgkin-Huxley cell (Na+, K+, leak) that may carry one additional membrane
current; `get_rules` gives the description of that current, the reference model, the pool of
current-clamp protocols you may run, the channel blockers, your budget, the held-out **test
protocols** and the scoring.

Record with `run_experiment`: a pool protocol (by label) or a custom single current step,
optionally with blockers, repeated `reps` times. A run costs `reps` units of budget and
returns the mean spike count in the protocol's test window and one noisy voltage recording
sampled every 4 ms. The cell is noisy (a finite number of ion channels), so single runs
differ. You cannot run the test protocols.

When you are done, call `submit_forecasts` once with your forecast of the **mean test-window
spike count** of every test protocol (`{"T1": 12.3, ...}`; decimals are fine).

You have a shell with Python 3, numpy and scipy. The simulator of this cell model is in
`/app/nbsim` (`from nbsim import run_particles, make_protocol, spike_count, Chan`; see
`/app/nbsim/README.md`): you can simulate any mechanism you propose under any protocol at no
budget cost. One simulation call takes about a second, so plan your computing time. Writing
and running code is allowed and encouraged.

Score: `1 - MSE(your forecasts) / MSE(reference-model forecasts)`, clipped to [0, 1]. A
forecast no better than the reference model's (which needs no experiment) scores 0, as does
not submitting.
