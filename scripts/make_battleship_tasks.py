"""Render the Harbor tasks for Rulebound Battleship from templates/battleship_task.

    python scripts/make_battleship_tasks.py --seeds 0:5 --out tasks/battleship
    python scripts/make_battleship_tasks.py --world hard --seeds 0:5 --out tasks/battleship_hard

--world picks the variant (bayesenv/battleship_worlds.py): closed (six rules, fire error 0.1),
open (plus "other": none of the listed rules) or hard (open, and the fire error rate is unknown:
0.05, 0.15 or 0.3, drawn once per game). The instruction text follows the variant.

Each task = one seed. The hidden rule and ships are drawn from (seed, salt), and the salt is
random per trial inside the mcp-server container (TASK_SALT empty), so they cannot be
recomputed from the public code and the task name. A fresh random grader token per task is
written to the mcp-server's compose environment and to tests/grader_token. bayesenv/battleship.py
is vendored into the server and solution build contexts: re-run this script whenever it changes.
"""

import argparse
import secrets
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "battleship_task"
TEXT = {".toml", ".md", ".yaml", ".sh", ".py", ""}
VENDORED = ("__init__.py", "battleship.py", "battleship_worlds.py")
TEXTS = {  # world: (rules text, fire text, number of rules, task name prefix)
    "closed": ("the six placement rules (exactly one of them was used to place the\nships)",
               "wrong with probability 0.1", "six", "battleship"),
    "open": ("the six placement rules plus a seventh hypothesis, \"other\" (none of the\nsix; "
             "exactly one of the seven is true)", "wrong with probability 0.1", "seven",
             "battleship-open"),
    "hard": ("the six placement rules plus a seventh hypothesis, \"other\" (none of the\nsix; "
             "exactly one of the seven is true)",
             "wrong with an unknown probability that is the same for every fire in the\n  game "
             "(0.05, 0.15 or 0.3, each equally likely a priori; see `get_rules`)", "seven",
             "battleship-hard"),
}


def render(seed: int, out: Path, world: str = "closed") -> None:
    rules_text, fire_text, n_rules, prefix = TEXTS[world]
    dst = out / f"{prefix}-{seed}"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(TEMPLATE, dst, ignore=shutil.ignore_patterns("__pycache__"))
    token = secrets.token_urlsafe(24)
    for f in dst.rglob("*"):
        if f.is_file() and f.suffix in TEXT:
            s = f.read_text(encoding="utf-8")
            s = s.replace("__SEED__", str(seed)).replace("__TOKEN__", token)
            s = (s.replace("__TASKNAME__", f"{prefix}-{seed}").replace("__WORLD__", world)
                 .replace("__RULES_TEXT__", rules_text).replace("__FIRE_TEXT__", fire_text)
                 .replace("__N_RULES__", n_rules))
            f.write_text(s, encoding="utf-8", newline="\n")
    (dst / "tests" / "grader_token").write_text(token, encoding="utf-8", newline="\n")
    for sub in ("environment/mcp-server/bayesenv", "solution/bayesenv"):
        (dst / sub).mkdir(parents=True)
        for name in VENDORED:
            shutil.copy2(ROOT / "bayesenv" / name, dst / sub / name)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seeds", default="0:5")
    p.add_argument("--out", default="tasks/battleship")
    p.add_argument("--world", default="closed", choices=tuple(TEXTS))
    a = p.parse_args()
    lo, hi = map(int, a.seeds.split(":"))
    out = ROOT / a.out
    out.mkdir(parents=True, exist_ok=True)
    for s in range(lo, hi):
        render(s, out, a.world)
    print(f"rendered {hi - lo} tasks -> {out}")


if __name__ == "__main__":
    main()
