# Identify a reaction mechanism in a stochastic wet lab

An MCP server named `wetlab` is connected to you. Start with `get_rules`: it gives the exact
stochastic model, the candidate reaction mechanisms with their prior probabilities, the prior
ranges of their unknown rate constants, the assay noise, the bounds of every run setting and
your stock. Exactly one mechanism is true; its rate constants are unknown and the same in
every run.

Run experiments with `run_experiment` (substrate, catalyst, optional product spike,
temperature, 1-6 sampling times). Each run returns noisy readings of the product count at
your sampling times and your remaining stock. Runs consume stock (substrate, catalyst, product
standard, one assay kit per reading, one vessel per run), so you cannot measure everything:
choose runs that tell the mechanisms apart. The reactions involve only a few hundred
molecules, so they are noticeably random, not smooth curves.

When you are done (you may stop early), call `submit_posterior` once with a probability for
each mechanism.

You have a shell with Python 3, numpy and scipy. Writing and running code (for example to
simulate the mechanisms, compute likelihoods or posteriors, or decide which run would be most
informative) is allowed and encouraged.

Your score is log q(true mechanism) - log prior(true mechanism), where q is your submitted
distribution (mixed with 0.1% of the prior, so it is never zero). Submitting the prior scores
0; being confidently right scores high, being confidently wrong scores very low. Be
calibrated: report what your evidence supports.
