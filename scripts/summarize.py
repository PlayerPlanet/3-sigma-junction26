"""Print a table of per-trial rewards for each Harbor job in a run directory.

    python scripts/summarize.py jobs/<run-id>
"""

import json
import sys
from pathlib import Path


def trial_rewards(eval_stats: dict) -> list[float]:
    rewards = []
    for value, trials in eval_stats.get("reward_stats", {}).get("reward", {}).items():
        rewards += [float(value)] * len(trials)
    return sorted(rewards)


def main(run_dir: Path) -> None:
    print(f"{'run':<14} {'trials':>6} {'errors':>6} {'mean':>7}  per-trial rewards")
    for result in sorted(run_dir.glob("*/result.json")):
        stats = json.loads(result.read_text())["stats"]
        for ev in stats["evals"].values():
            rewards = trial_rewards(ev)
            mean = sum(rewards) / len(rewards) if rewards else float("nan")
            shown = ", ".join(f"{r:.3f}" for r in rewards)
            print(f"{result.parent.name:<14} {ev['n_trials']:>6} {ev['n_errors']:>6} {mean:>7.3f}  [{shown}]")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
