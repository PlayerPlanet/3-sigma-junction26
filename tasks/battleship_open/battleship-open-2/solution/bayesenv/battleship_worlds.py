"""Variants of Rulebound Battleship, each the same engine (bayesenv/battleship.py) loaded with
different flags, so the standard game, its calibration and its training rows never change.

    closed  six listed rules, fire error 0.1 (bayesenv.battleship)
    open    plus a 7th hypothesis "other": none of the listed rules (bayesenv.battleship_open)
    hard    open, and the fire error rate is unknown: 0.05, 0.15 or 0.3, drawn once per game
            (bayesenv.battleship_hard)

    from bayesenv.battleship_worlds import load
    B = load("hard")
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

FLAGS = {"closed": {}, "open": {"OPEN_WORLD": True},
         "hard": {"OPEN_WORLD": True, "UNKNOWN_NOISE": True}}
WORLDS = tuple(FLAGS)


def load(world: str = "closed"):
    if world not in FLAGS:
        raise ValueError(f"unknown world {world!r}; choose from {WORLDS}")
    if world == "closed":
        from bayesenv import battleship
        return battleship
    name = f"bayesenv._battleship_{world}_impl"
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name("battleship.py"))
        mod = importlib.util.module_from_spec(spec)
        mod.__dict__.update(FLAGS[world])
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
    return sys.modules[name]
