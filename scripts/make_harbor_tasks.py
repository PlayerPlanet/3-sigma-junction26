"""Render the Harbor dataset of Bayesian experimental-design tasks from templates/bayes_task.

    python scripts/make_harbor_tasks.py --seeds 0:5 --out tasks/bayes

Each task = (environment, seed). A fresh random grader token per task is written to the
mcp-server's compose environment and to tests/grader_token; neither is visible to the agent
during its run. `bayesenv` is vendored into the server and solution build contexts, so re-run
this script whenever bayesenv changes (CI checks the copies are in sync).
"""

import argparse
import secrets
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "bayes_task"
TEXT = {".toml", ".md", ".yaml", ".sh", ".py", ""}


def render(env: str, seed: int, out: Path) -> None:
    dst = out / f"{env}-{seed}"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(TEMPLATE, dst)
    token = secrets.token_urlsafe(24)
    for f in dst.rglob("*"):
        if f.is_file() and f.suffix in TEXT:
            s = f.read_text(encoding="utf-8")
            s = s.replace("__ENV__", env).replace("__SEED__", str(seed)).replace("__TOKEN__", token)
            f.write_text(s, encoding="utf-8", newline="\n")
    (dst / "tests" / "grader_token").write_text(token, encoding="utf-8", newline="\n")
    for sub in ("environment/mcp-server/bayesenv", "solution/bayesenv"):
        shutil.copytree(ROOT / "bayesenv", dst / sub,
                        ignore=shutil.ignore_patterns("__pycache__", "llm_agent.py"))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seeds", default="0:5")
    p.add_argument("--envs", nargs="+", default=["hyperbolic", "location"])
    p.add_argument("--out", default="tasks/bayes")
    a = p.parse_args()
    lo, hi = map(int, a.seeds.split(":"))
    out = ROOT / a.out
    out.mkdir(parents=True, exist_ok=True)
    for env in a.envs:
        for s in range(lo, hi):
            render(env, s, out)
    print(f"rendered {len(a.envs) * (hi - lo)} tasks -> {out}")


if __name__ == "__main__":
    main()
