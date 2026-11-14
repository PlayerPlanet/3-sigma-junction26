# Learn an unknown system by experimenting

An MCP server named `bayes-env` is connected to you. Start with `get_rules`.

Design experiments that teach you as much as possible about the system, within the budget.
Then call `finish_experiments` and submit calibrated predictions for the designs it reveals.
Your score is the expected log probability your predictions assign to the system's real
behaviour, relative to what was learnable: confident where your evidence supports it,
uncertain where it does not.
