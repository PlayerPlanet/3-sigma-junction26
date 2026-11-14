# Learn a population from a few experiments

An MCP server named `hier-lab` is connected to you. Start with `get_rules`: it gives the
complete generative model in plain maths (the population distribution, every prior and
hyperprior, the outcome model and its known constants), the experiment budget, and the exact
scoring rule. Nothing about the model is hidden; only the drawn values are.

There are 12 units, each with its own hidden threshold drawn from a population whose mean and
spread are also hidden. You have 12 experiments. Each one chooses a unit AND a design with
`run_experiment(unit, design)` and returns a binary outcome, so you decide both where to probe
and how to spread the experiments over the units. Invalid requests are rejected and do not
use up budget.

When you are done, call `finish_experiments`. It ends the experiment phase and reveals the
queries: some ask for the probability of outcome 1 at a new design on one of the 12 units,
the others at a design on a NEW unit that you could never test, drawn from the same
population. Then call `submit_predictions` once with one probability per query, in order.

You have a shell with Python 3, numpy and scipy. Writing and running code (for example to
compute the posterior numerically, or to decide which experiment to run next) is allowed and
encouraged.

Your score is the expected log probability your predictions assign to the true outcome
distribution, minus the same for the prior predictive of the disclosed model, divided by a
fixed constant, clipped to [0, 1]. Submitting the prior predictive scores exactly 0. The log
score is proper: the best possible answer is the exact posterior predictive of the disclosed
model given your data. Overconfident probabilities are punished, on new units in particular.
