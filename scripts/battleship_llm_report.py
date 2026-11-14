"""Report for a Battleship benchmark run, from its saved files only (no API calls).

    python scripts/battleship_llm_report.py results/battleship_bench/<tag>

Reads runs.jsonl (model episodes) and baselines.jsonl (reference and scripted policies on the
same boards); writes report.md and summary.json next to them and prints the table. Every row is
paired with the reference on the same board: "gap" = score minus reference, with a bootstrap
95% CI over boards. Scores are the unclipped proper score (prior 0, truth about 1); the Harbor
column is the per-game clip to [0, 1].
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np


def ci(x, n=4000, seed=0):
    x = np.asarray(x, float)
    if len(x) == 0:
        return [float("nan")] * 3
    if len(x) == 1:
        return [float(x[0]), float("nan"), float("nan")]
    m = np.random.default_rng(seed).choice(x, (n, len(x))).mean(1)
    return [float(x.mean()), float(np.quantile(m, .025)), float(np.quantile(m, .975))]


def summarise(rows: list[dict]) -> dict:
    raw = [r["score_raw"] for r in rows]
    gap = [r["score_raw"] - r["reference_score_raw"] for r in rows]
    return {"n": len(rows), "score_raw": ci(raw), "gap_to_reference": ci(gap),
            "score_harbor": float(np.mean([r["score"] for r in rows])),
            "rule_accuracy": float(np.mean([r["accuracy"] for r in rows])),
            "rule_part": float(np.mean([r["rule_part"] for r in rows])),
            "cell_part": float(np.mean([r["cell_part"] for r in rows])),
            "design": float(np.mean([r["design"] for r in rows])),
            "inference": float(np.mean([r["inference"] for r in rows])),
            "parsed": float(np.mean([r["parsed"] for r in rows])),
            "invalid_actions": float(np.mean([r["invalid_actions"] for r in rows])),
            "actions": float(np.mean([r["n_actions"] for r in rows])),
            "scans": float(np.mean([r["n_scans"] for r in rows])),
            "leak_p_lt_05": float(np.mean([r["ppc_p"] < 0.05 for r in rows])),
            "requests": int(sum(r.get("calls", 0) for r in rows)),
            "tokens_out": int(sum(r.get("out", 0) for r in rows))}


def main(run_dir) -> dict:
    run_dir = Path(run_dir)
    rows = []
    for name in ("baselines.jsonl", "runs.jsonl"):
        p = run_dir / name
        if p.exists():
            rows += [json.loads(line) for line in p.read_text().splitlines() if line.strip()]
    salts = {r["salt"] for r in rows}
    by: dict[str, list] = {}
    for r in rows:
        by.setdefault(r["model"], []).append(r)
    humans = [r for r in rows if r["model"].startswith("human:")]
    if len({r["model"] for r in humans}) > 1:
        by["human:ALL"] = humans
    summary = {"run": run_dir.name, "salt": sorted(salts), "models": {}}
    f = lambda c: f"{c[0]:+.3f} [{c[1]:+.3f}, {c[2]:+.3f}]"  # noqa: E731
    lines = ["| Model | Boards | Score (unclipped) [95% CI] | Gap to reference [95% CI] | Harbor | "
             "Rule acc. | Rule part | Cell part | Design | Inference | Parsed | Invalid/game | Actions (scans) | "
             "Leak p<.05 | Requests |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    order = sorted(by, key=lambda m: (not m.startswith("baseline:"), not m.startswith("human:"), m))
    for m in order:
        s = summary["models"][m] = summarise(sorted(by[m], key=lambda r: r["seed"]))
        lines.append(f"| {m} | {s['n']} | {f(s['score_raw'])} | {f(s['gap_to_reference'])} | "
                     f"{s['score_harbor']:.3f} | {s['rule_accuracy']:.2f} | {s['rule_part']:+.3f} | "
                     f"{s['cell_part']:+.3f} | {s['design']:+.3f} | "
                     f"{s['inference']:+.3f} | {s['parsed']:.2f} | {s['invalid_actions']:.1f} | "
                     f"{s['actions']:.1f} ({s['scans']:.1f}) | {s['leak_p_lt_05']:.2f} | "
                     f"{s['requests']} |")
    man = run_dir / "manifest.json"
    head = [f"# Battleship benchmark: {run_dir.name}", ""]
    if man.exists():
        mf = json.loads(man.read_text())
        g = mf.get("git", {})
        head += [f"Boards: seeds {mf.get('seeds')} with salt `{mf.get('salt')}` (every model plays "
                 "the same boards). Commit `" + str(g.get("commit", ""))[:10] + "`"
                 + (" (with uncommitted changes)" if g.get("dirty") else "")
                 + f", rules `{mf.get('rules_hash')}`, protocol `{mf.get('protocol_hash')}`, "
                 f"engine `{mf.get('engine_hash')}`, versions {mf.get('versions')}.", ""]
        for name, mm in mf.get("models", {}).items():
            head.append(f"* {name}: provider `{mm.get('provider')}`, temperature "
                        f"{mm.get('temperature')}, max tokens {mm.get('max_tokens')}, "
                        f"{'one action per reply' if mm.get('one_tag') else 'several actions per reply allowed'}, "
                        f"run {mm.get('started')} to {mm.get('finished')}")
        head.append("")
    text = "\n".join(head + lines + [
        "", "Score: proper log score on the rule and every cell (prior 0, truth about 1), "
        "unclipped; it is the mean of the rule part (which rule placed the ships) and the cell part "
        "(where the ships are). Design: score of the exact posterior given the model's own actions. "
        "Inference: score minus design (0 for exact Bayesian updating). Harbor: per-game clip "
        "to [0, 1]. Leak p<.05: share of games the exact leak test flags (about 0.05 expected "
        "for honest play).", ""])
    (run_dir / "report.md").write_text(text)
    (run_dir / "summary.json").write_text(json.dumps(summary, indent=1))
    print(text)
    return summary


if __name__ == "__main__":
    main(sys.argv[1])
