"""Hard Rulebound Battleship: the open world (six rules plus "other") with an unknown fire
error rate (0.05, 0.15 or 0.3, uniform prior, drawn once per game, disclosed as such).

The instrument has to be calibrated while it is used, as in a lab: a model that plugs in a
fixed error rate is confidently wrong when the true rate is high and wastes evidence when it is
low. Scans keep their known noise, so they double as calibration. Everything stays exact: the
hidden state is (rule, layout, error level), 3 x 53,624 states, all enumerated.

    from bayesenv import battleship_hard as B   # same API as bayesenv.battleship
"""

from bayesenv.battleship_worlds import load as _load

globals().update({k: v for k, v in vars(_load("hard")).items() if not k.startswith("__")})
