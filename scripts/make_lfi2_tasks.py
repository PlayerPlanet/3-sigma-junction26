"""Render the Harbor tasks for the LFI lab v2 (bayesenv.lfilab2) from templates/lfi2_task.

    python scripts/make_lfi2_tasks.py --seeds 0:3 --out tasks/lfi2

Each task = one seed. The hidden rate constants are drawn from (seed, salt), and the salt is
random per trial inside the mcp-server container (TASK_SALT empty). Two fresh random tokens per
task: the grader token (mcp-server compose env + tests/grader_token) and the solution token
(mcp-server compose env + solution/solution_token), which lets the oracle download the public
FSP tables. lfilab2.py, lfilab2_sim.py, lfilab2_constants.json, lfilab_sim.py (shared constants) and
chem_lab.py are vendored into the server and solution build contexts, and lfilab2_sim.py is
shipped to the agent's container as /app/lfisim.py: re-run this script whenever they change.
The exact FSP table data/lfilab2_exact.npz (360 MB, not tracked; experiments/lfilab2_modal.py
::table then ::fetch) is copied into environment/mcp-server/data/ when it exists; without it
the server image cannot be built.
"""

import argparse
import secrets
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "lfi2_task"
TEXT = {".toml", ".md", ".yaml", ".sh", ".py", ""}
VENDORED = ("__init__.py", "chem_lab.py", "lfilab_sim.py", "lfilab2.py", "lfilab2_sim.py",
            "lfilab2_constants.json")


def render(seed: int, out: Path, no_table: bool = False) -> None:
    dst = out / f"lfi2-{seed}"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(TEMPLATE, dst, ignore=shutil.ignore_patterns("__pycache__"))
    token, sol = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    for f in dst.rglob("*"):
        if f.is_file() and f.suffix in TEXT:
            s = f.read_text(encoding="utf-8")
            s = s.replace("__SEED__", str(seed)).replace("__TOKEN__", token).replace("__SOLTOKEN__", sol)
            f.write_text(s, encoding="utf-8", newline="\n")
    (dst / "tests" / "grader_token").write_text(token, encoding="utf-8", newline="\n")
    (dst / "solution" / "solution_token").write_text(sol, encoding="utf-8", newline="\n")
    for sub in ("environment/mcp-server/bayesenv", "solution/bayesenv"):
        (dst / sub).mkdir(parents=True)
        for name in VENDORED:
            shutil.copy2(ROOT / "bayesenv" / name, dst / sub / name)
    shutil.copy2(ROOT / "bayesenv" / "lfilab2_sim.py", dst / "environment" / "lfisim.py")
    data = dst / "environment" / "mcp-server" / "data"
    data.mkdir(parents=True, exist_ok=True)
    table = ROOT / "data" / "lfilab2_exact.npz"
    if table.exists() and not no_table:
        try:
            (data / table.name).hardlink_to(table)
        except OSError:
            shutil.copy2(table, data / table.name)
    (data / "README").write_text("lfilab2_exact.npz goes here (not tracked); see scripts/make_lfi2_tasks.py\n",
                                 encoding="utf-8", newline="\n")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seeds", default="0:3")
    p.add_argument("--out", default="tasks/lfi2")
    p.add_argument("--no-table", action="store_true", help="do not copy the FSP table")
    a = p.parse_args()
    lo, hi = map(int, a.seeds.split(":"))
    out = ROOT / a.out
    out.mkdir(parents=True, exist_ok=True)
    for s in range(lo, hi):
        render(s, out, a.no_table)
    print(f"rendered {hi - lo} tasks -> {out}")


if __name__ == "__main__":
    main()
