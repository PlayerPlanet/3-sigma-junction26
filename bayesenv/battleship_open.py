"""Open-world Rulebound Battleship: the six listed rules plus "other" (none of them).

The same engine as bayesenv/battleship.py, loaded a second time with OPEN_WORLD = True, so the
closed game, its calibration and its training rows are untouched. "other" is a seventh
hypothesis with a disclosed generative model: all three ships lie inside one hidden rectangle
of at most OTHER_MAX_AREA cells (a block of whole rows by whole columns), the rectangle uniform
over those that can hold the ships, then the layout uniform inside it. Everything stays exact:
the posterior, EIG, reference, design / inference split and leak test all enumerate the same
53,624 layouts; only the likelihood row of "other" is a mixture rather than uniform.

The point for agents: the listed rules do not have to be true. When the ships sit inside a small
block, "other" explains the data far better than any listed rule (the size principle), and an
agent that never puts probability on "none of the above" pays for it (baseline "closed_world").

    from bayesenv import battleship_open as B   # same API as bayesenv.battleship
"""

import importlib.util
import sys
from pathlib import Path

_name = "bayesenv._battleship_open_impl"
if _name in sys.modules:
    _m = sys.modules[_name]
else:
    _spec = importlib.util.spec_from_file_location(_name, Path(__file__).with_name("battleship.py"))
    _m = importlib.util.module_from_spec(_spec)
    _m.OPEN_WORLD = True
    sys.modules[_name] = _m
    _spec.loader.exec_module(_m)

globals().update({k: v for k, v in vars(_m).items()
                  if not k.startswith("__") or k == "__all__"})
