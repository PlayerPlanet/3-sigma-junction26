"""Render the Harbor tasks for the diagnostic lab (bayesenv.diag) from templates/diag_task.

    python scripts/make_diag_tasks.py --seeds 0:5 --out tasks/diag

Each task = the same table (specs/tables/low_yield.yaml) with one seed. The hidden cause, the
nuisance state and every test reading are drawn from (seed, salt), and the salt is random per
trial inside the mcp-server container (TASK_SALT empty), so they are not recomputable from the
public code and the task name. A fresh random grader token per task is written to the
mcp-server's compose environment and to tests/grader_token (same scheme as
make_chem_tasks.py).

Vendored, so re-run this script whenever they change:
  * mcp-server build context: the bayesenv modules diag.py needs, and the table file (which
    carries the role tags the grader reports on; get_rules does not expose them);
  * solution/: the bayesenv modules only. The oracle rebuilds the table from get_rules.
"""

import argparse
import secrets
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "diag_task"
TEXT = {".toml", ".md", ".yaml", ".sh", ".py", ""}
VENDORED = ("__init__.py", "chem_lab.py", "chem_reward.py", "diag.py")
TABLE = "low_yield"


def render(seed: int, out: Path) -> None:
    dst = out / f"diag-{seed}"
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
    tables = dst / "environment" / "mcp-server" / "specs" / "tables"
    tables.mkdir(parents=True)
    shutil.copy2(ROOT / "specs" / "tables" / f"{TABLE}.yaml", tables / f"{TABLE}.yaml")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seeds", default="0:5")
    p.add_argument("--out", default="tasks/diag")
    a = p.parse_args()
    lo, hi = map(int, a.seeds.split(":"))
    out = ROOT / a.out
    out.mkdir(parents=True, exist_ok=True)
    for s in range(lo, hi):
        render(s, out)
    print(f"rendered {hi - lo} tasks -> {out}")


if __name__ == "__main__":
    main()
