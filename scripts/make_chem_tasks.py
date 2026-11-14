"""Render the Harbor tasks for the Virtual Chemistry Lab (Held-out C) from templates/chem_task.

    python scripts/make_chem_tasks.py --seeds 0:5 --out tasks/chem

Each task = one seed. The hidden fault is drawn from (seed, salt), and the salt is random per
trial inside the mcp-server container (TASK_SALT empty), so the fault is not recomputable from
the public code and the task name. A fresh random grader token per task is written to the
mcp-server's compose environment and to tests/grader_token (same scheme as
make_harbor_tasks.py). The chem modules of bayesenv are vendored into the server and solution
build contexts: re-run this script whenever they change.
"""

import argparse
import secrets
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "chem_task"
TEXT = {".toml", ".md", ".yaml", ".sh", ".py", ""}
VENDORED = ("__init__.py", "chem_lab.py", "chem_reward.py")


def render(seed: int, out: Path) -> None:
    dst = out / f"chem-{seed}"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(TEMPLATE, dst, ignore=shutil.ignore_patterns("__pycache__"))
    token = secrets.token_urlsafe(24)
    for f in dst.rglob("*"):
        if f.is_file() and f.suffix in TEXT:
            s = f.read_text(encoding="utf-8")
            s = s.replace("__SEED__", str(seed)).replace("__TOKEN__", token)
            f.write_text(s, encoding="utf-8", newline="\n")
    (dst / "tests" / "grader_token").write_text(token, encoding="utf-8", newline="\n")
    for sub in ("environment/mcp-server/bayesenv", "solution/bayesenv"):
        (dst / sub).mkdir(parents=True)
        for name in VENDORED:
            shutil.copy2(ROOT / "bayesenv" / name, dst / sub / name)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seeds", default="0:5")
    p.add_argument("--out", default="tasks/chem")
    a = p.parse_args()
    lo, hi = map(int, a.seeds.split(":"))
    out = ROOT / a.out
    out.mkdir(parents=True, exist_ok=True)
    for s in range(lo, hi):
        render(s, out)
    print(f"rendered {hi - lo} tasks -> {out}")


if __name__ == "__main__":
    main()
