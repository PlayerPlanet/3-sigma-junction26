# Find the cause of a failed batch

An MCP server named `diag-lab` is connected to you. Start with `get_rules`: it gives the
complete model of the problem. That is every possible cause with its prior probability, the
hidden nuisance states and their probabilities given the cause, every available test with its
cost and the probability of each of its readings given the cause and the nuisance state, the
budget, and the scoring rule. Exactly one cause is true. Nothing about the model is withheld;
only the true cause, the nuisance state and the readings are hidden.

Run tests with `run_test(name)`. Each test costs part of the budget, returns one reading, and
can be run at most once. You do not have to spend the whole budget. When you are done, call
`submit_posterior` once with a probability for each cause.

You have a shell with Python 3, numpy and scipy. Writing and running code is allowed and
encouraged.

Your goal is the best final probabilities for the true cause that the budget allows. Your
score is log q(true cause) - log prior(true cause), where q is your submitted distribution
(mixed with 0.1% of the prior, so it is never zero), reported as a fraction of the score of a
certain, correct answer. Submitting the prior scores 0; being confidently right scores high,
being confidently wrong scores very low. Be calibrated: report what your evidence supports.
