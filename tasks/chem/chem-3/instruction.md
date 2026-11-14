# Diagnose a faulty reactor

An MCP server named `chem-lab` is connected to you. Start with `get_rules`: it gives the exact
reaction model, its constants, the experiment bounds and budget, and the list of hypotheses
(no fault, or one of several faults) with their prior probabilities. Exactly one hypothesis is
true.

Run experiments with `run_experiment` (temperature, reaction time, concentration) to find out
which one. Experiments are numbered in the order you run them, and the number can matter.
When you are done (at most 10 experiments), call `submit_posterior` once with a probability
for each hypothesis.

You have a shell with Python 3, numpy and scipy. Writing and running code (for example to
compute likelihoods, posteriors, or which experiment would be most informative) is allowed
and encouraged.

Your score is log q(true hypothesis) - log prior(true hypothesis), where q is your submitted
distribution (mixed with 0.1% of the prior, so it is never zero). Submitting the prior scores
0; being confidently right scores high, being confidently wrong scores very low. Be
calibrated: report what your evidence supports.
