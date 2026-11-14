# Rulebound Battleship: find the ships and the rule that placed them

An MCP server named `battleship` is connected to you. Start with `get_rules`: it gives the
board, the three ships, the six placement rules (exactly one of them was used to place the
ships), exactly how the rule and the layout were drawn, the noise of every action, your shot
budget, the prior probability that each cell holds a ship, and the scoring formula. Nothing
about the game is hidden except the drawn rule, the ship positions and the noise.

Spend your budget with two actions:

* `fire(row, col)`: costs 1, reports hit (1) or miss (0), wrong with probability 0.1.
* `scan(axis, index)`: costs 2, reports how many ship cells are in a whole row or column,
  off by one with probability 0.3 (see `get_rules`).

Firing never sinks or changes anything; the board stays the same. You may stop early. When you
are done, call `submit_beliefs` once with:

* `rules`: a probability for each of the six rule names, and
* `occupancy`: 6 rows of 6 numbers, the probability that a ship covers each cell.

You have a shell with Python 3, numpy and scipy. Writing and running code (for example to
enumerate layouts, compute your posterior, or decide which action is most informative) is
allowed and encouraged.

Your score is a log score on the true rule and on the true state of every cell, relative to
the prior (`get_rules` gives the exact formula). Submitting the prior scores 0, knowing the
truth scores about 1, and confident mistakes score below 0. Reports are noisy, so a single
surprising result should move your beliefs but not make them certain. Be calibrated: report
what your evidence supports.
