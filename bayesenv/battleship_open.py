"""Open-world Rulebound Battleship: the six listed rules plus "other" (none of them).

The same engine as bayesenv/battleship.py, loaded a second time with OPEN_WORLD = True (see
bayesenv/battleship_worlds.py), so the closed game, its calibration and its training rows are
untouched. "other" is a seventh hypothesis with a disclosed generative model: all three ships
lie inside one hidden rectangle of at most OTHER_MAX_AREA cells (a block of whole rows by whole
columns), the rectangle uniform over those that can hold the ships, then the layout uniform
inside it. Everything stays exact: the posterior, EIG, reference, design / inference split and
leak test all enumerate the same 53,624 layouts; only the likelihood row of "other" is a
mixture rather than uniform.

    from bayesenv import battleship_open as B   # same API as bayesenv.battleship
"""

from bayesenv.battleship_worlds import load as _load

globals().update({k: v for k, v in vars(_load("open")).items() if not k.startswith("__")})
