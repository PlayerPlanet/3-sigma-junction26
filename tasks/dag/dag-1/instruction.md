# Learn a hidden causal network and forecast interventions

An MCP server named `dag-lab` is connected to you. Start with `get_rules`: it gives the
complete generative model. A hidden causal Bayesian network over 5 binary variables X0..X4 was
drawn from a known prior: the graph uniformly from all 29,281 DAGs on five labelled nodes, and
every conditional probability independently from a known Beta distribution.
Nothing about the process is hidden; only the particular graph and its probability tables are.

1. Run experiments with `run_experiment`. Each returns a small batch of joint samples of all
   five variables, either observational (`{}`) or under one intervention such as `{"X2": 1}`,
   which sets that variable whatever its parents are. The number of experiments is limited
   (see the rules); invalid requests are rejected and do not count.
2. Call `finish_experiments`. It ends the experiment phase and reveals the queries: each asks
   for the probability that a target variable is 1 under an intervention on one or two
   variables. Two-variable interventions cannot be run as experiments, so those answers have
   to be inferred.
3. Call `submit_predictions` once with one probability per query, in query order.

You have a shell with Python 3, numpy and scipy. Writing and running code is allowed and
encouraged: the problem is small enough to be solved exactly.

Scoring: for each query, your probability q (clamped to [0.001, 0.999]) earns
p* log q + (1 - p*) log(1 - q), where p* is the true probability computed from the hidden
network. The mean over queries, minus what answering 0.5 everywhere earns, is divided by a
fixed constant and clipped to [0, 1]. Answering 0.5 everywhere scores 0. The best possible
answer is the exact posterior predictive probability of each query given your data.
Overconfident answers are punished heavily, so report what your evidence supports.
