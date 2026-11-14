# Light switch: map a hidden neural circuit with optogenetics

An MCP server named `opto-lab` is connected to you. Start with `get_rules`: it gives the complete
generative model. A hidden circuit over four neuron populations (VTA, NAc, PFC, BLA) and one
behavioural readout (LEVER, whether the animal presses a lever) was drawn from a known prior.
Nothing about the process is hidden; only the particular circuit, its probability tables and
the expression levels of the animals you create are.

Correlation is not causation: activity recorded in a naive animal cannot by itself tell you
which population drives which. Optogenetics lets you intervene, with real-world imperfections
that the rules describe exactly (how often the light actually takes control, which depends on
intensity and on each animal's hidden expression level, and a heating artefact at high
intensity).

1. Spend the budget (see the rules) with `record_activity`, `express_opsin` (ChR2 excites, ArchT
   silences; one or two populations per animal) and `light_session` (choose the animal and the
   intensity). `get_status` shows the budget and your animals. Invalid requests are rejected
   and cost nothing.
2. Call `finish_experiments`. It ends the experiment phase and reveals the queries: each asks
   for the probability that a node is 1 under an IDEAL intervention that clamps one or two
   populations (no efficacy loss, no heating), including combinations you may never have run.
3. Call `submit_predictions` once with one probability per query, in query order.

You have a shell with Python 3, numpy and scipy. Writing and running code is allowed and
encouraged: the hypothesis space is small enough to be handled exactly.

Scoring: for each query, your probability q (clamped to [0.001, 0.999]) earns
p* log q + (1 - p*) log(1 - q), where p* is the true probability computed from the hidden
circuit, minus what the prior predictive (given with each query) earns. The mean over queries
is divided by a fixed constant and clipped to [0, 1]. Submitting the prior predictive scores 0.
The best possible answer is the exact posterior predictive probability of each query given your
data. Overconfident answers are punished heavily, so report what your evidence supports.
