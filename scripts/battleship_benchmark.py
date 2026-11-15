"""Benchmark chat models on Rulebound Battleship (full games, no tools), replicably.

    python scripts/battleship_benchmark.py --config configs/battleship_benchmark.json
    python scripts/battleship_benchmark.py --config configs/battleship_benchmark.json --only gemini-4-hydrogen
    python scripts/battleship_benchmark.py --list-models          # which model ids each provider offers
    python scripts/battleship_benchmark.py --dry-run --tag dry    # whole pipeline, no API calls

What makes a run replicable:
  * every model plays the SAME hidden boards: fixed salt + seed range from the config;
  * the reference and the scripted baselines are computed in-process on those boards
    (deterministic, no API), so every table carries its own anchors;
  * the run directory gets a manifest: git commit and dirty flag, a hash of the game rules, the
    protocol (system prompt) and the engine source, salt, seeds, and per model the exact
    provider, model id, temperature, max tokens, start/end time and requests used;
  * every episode's transcript, actions and grade are saved (runs.jsonl) plus a replay file
    per game for scripts/battleship_ui.py; the report is regenerated from those files alone
    (scripts/battleship_llm_report.py), so anyone can check the numbers without re-calling APIs.
Model outputs themselves are sampled, so a rerun gives statistically consistent, not identical,
numbers; temperature 0 (the config default) keeps that variation small where providers allow it.

Results go to results/battleship_bench/<tag>/. Requests are counted by bayesenv.llm_agent's
per-provider caps (results/request_budget.json; gemini: 300 in total).
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import subprocess
import sys
import time
from argparse import Namespace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bayesenv import battleship as B  # noqa: E402
from bayesenv import battleship_rows as R  # noqa: E402
from bayesenv import llm_agent  # noqa: E402

# Providers with keys in the team .env that llm_agent does not list (added at runtime only).
EXTRA_PROVIDERS = {
    "verda-deepseek": ("https://inference.verda.com/v1", "VERDA_DEEPSEEK_API_KEY", None),
}
for k, v in EXTRA_PROVIDERS.items():
    llm_agent.PROVIDERS.setdefault(k, v)

BASELINES = {  # (design, inference) policies from bayesenv.battleship, same boards, no API
    "reference": ("reference", "exact"),
    "noise_ignoring_coder": ("reference", "noiseless"),
    "naive_human": ("hunter", "noiseless"),
    "random_design": ("random", "exact"),
    "do_nothing": ("none", "prior"),
}
OPEN_BASELINES = {"closed_world_bayes": ("reference", "closed_world")}  # open world only


def set_world(world: str) -> None:
    """Config key "world": "closed" (six rules, default) or "open" (six plus "other")."""
    global B
    from bayesenv.battleship_worlds import load
    B = load(world)
    if B.OPEN_WORLD:
        BASELINES.update(OPEN_BASELINES)
    if B.UNKNOWN_NOISE:
        BASELINES["nominal_noise_coder"] = ("reference", "nominal_noise")
    R.B = B


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def git_info() -> dict:
    def run(*a):
        try:
            return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True,
                                  timeout=60).stdout.strip()
        except Exception:  # noqa: BLE001
            return ""
    return {"commit": run("rev-parse", "HEAD"), "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
            "dirty": bool(run("status", "--porcelain", "--untracked-files=no"))}


def load_env() -> None:
    for p in (ROOT / ".env", ROOT.parent / "3-sigma-junction26" / ".env"):
        if p.exists():
            for line in p.read_text().splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"'))


def baselines(out: Path, salt: str, seeds: list[int]) -> None:
    rows = []
    for name, (d, i) in BASELINES.items():
        for s in seeds:
            r = B.run_policy(d, i, s, salt).result
            rows.append({"model": f"baseline:{name}", "provider": "local", "seed": s, "salt": salt,
                         "parsed": True, "invalid_actions": 0, "calls": 0, "in": 0, "out": 0,
                         **{k: r[k] for k in ("score", "score_raw", "rule_part", "cell_part",
                                              "design", "inference", "accuracy", "ppc_p",
                                              "n_actions", "n_fires", "n_scans", "budget_used",
                                              "hidden_rule")},
                         "reference_score_raw": B.run_policy("reference", "exact", s, salt)
                         .result["score_raw"]})
    with open(out / "baselines.jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")


class DryModel:
    """Scripted player for --dry-run: replays the reference through the text protocol."""

    def __init__(self, name):
        self.provider, self.name, self.max_tokens = "dry", name, 1024

    async def chat(self, system, msgs, max_tokens=None):
        import re
        b, rem = B.Belief(), B.BUDGET
        for a_msg, u_msg in zip(msgs[1::2], msgs[2::2]):
            tags = R.OBS_RE.findall(a_msg["content"])
            res = re.findall(r"Result: (\d+)\. Budget remaining: (\d+)", u_msg["content"])
            for t, (y, left) in zip(tags, res):
                b.update(R.action_of(json.loads(t)), int(y))
                rem = int(left)
        if "experiment phase is over" in msgs[-1]["content"]:
            return json.dumps({"rules": dict(zip(B.NAMES, b.rules().round(5).tolist())),
                               "occupancy": b.occupancy().reshape(6, 6).round(5).tolist()}), \
                {"in": 0, "out": 0}
        return f"<observe>{json.dumps(R.design_of(B.greedy_action(b, rem)))}</observe>", \
            {"in": 0, "out": 0}


async def run_model(m: dict, cfg: dict, out: Path, dry: bool) -> dict:
    from experiments import battleship_llm as E
    E.set_world(cfg.get("world", "closed"))
    lo, hi = map(int, cfg["seeds"].split(":"))
    a = Namespace(provider=m["provider"], model=m["model"], seeds=cfg["seeds"], salt=cfg["salt"],
                  one_tag=m.get("one_tag", cfg.get("one_tag", False)),
                  concurrency=m.get("concurrency", cfg.get("concurrency", 4)),
                  max_tokens=m.get("max_tokens", cfg.get("max_tokens", 4096)),
                  temperature=m.get("temperature", cfg.get("temperature", 0.0)),
                  rpm=m.get("rpm", 0.0), out=str(out / "runs.jsonl"))
    t0 = time.strftime("%Y-%m-%dT%H:%M:%S")
    if dry:
        model = DryModel(m["model"])
        done = set()
        if (out / "runs.jsonl").exists():
            done = {(r["model"], r["seed"]) for r in map(json.loads, open(out / "runs.jsonl"))}
        rdir = out / m["model"].replace("/", "_")
        rdir.mkdir(parents=True, exist_ok=True)
        for s in range(lo, hi):
            if (m["model"], s) in done:
                continue
            row, replay = await E.run_episode(model, s, cfg["salt"], a.one_tag)
            with open(out / "runs.jsonl", "a") as f:
                f.write(json.dumps(row) + "\n")
            (rdir / f"seed-{s}.json").write_text(json.dumps(replay))
    else:
        await E.main(a)
    return {**{k: v for k, v in vars(a).items() if k != "out"}, "started": t0,
            "finished": time.strftime("%Y-%m-%dT%H:%M:%S")}


def list_models() -> None:
    import openai
    for name, (base, key_env, cap) in llm_agent.PROVIDERS.items():
        if not base or not os.environ.get(key_env):
            continue
        try:
            c = openai.OpenAI(base_url=base, api_key=os.environ[key_env], timeout=20)
            ids = sorted(m.id for m in c.models.list().data)
            print(f"{name} (cap {cap}): {', '.join(ids[:40])}{' ...' if len(ids) > 40 else ''}")
        except Exception as e:  # noqa: BLE001
            print(f"{name}: {type(e).__name__}: {str(e)[:120]}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/battleship_benchmark.json")
    ap.add_argument("--tag", default="", help="run directory name (default: the config's tag)")
    ap.add_argument("--only", default="", help="comma-separated model names from the config")
    ap.add_argument("--dry-run", action="store_true", help="scripted reference player, no API")
    ap.add_argument("--list-models", action="store_true")
    a = ap.parse_args()
    load_env()
    if a.list_models:
        list_models()
        return
    cfg = json.loads((ROOT / a.config).read_text())
    set_world(cfg.get("world", "closed"))
    tag = a.tag or cfg["tag"]
    out = ROOT / "results" / "battleship_bench" / tag
    out.mkdir(parents=True, exist_ok=True)
    lo, hi = map(int, cfg["seeds"].split(":"))
    models = [m for m in cfg["models"] if not a.only or m["model"] in a.only.split(",")]
    if a.dry_run:
        models = [{"provider": "dry", "model": "dry-reference-player"}]
    est = sum((hi - lo) * (22 if m.get("one_tag") else 15) for m in models)
    print(f"{len(models)} model(s) x {hi - lo} boards; roughly {est} requests at most", flush=True)

    mpath = out / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {"models": {}}
    manifest.update({
        "tag": tag, "world": cfg.get("world", "closed"), "salt": cfg["salt"],
        "seeds": cfg["seeds"], "git": git_info(),
        "rules_hash": sha(json.dumps(B.rules(), sort_keys=True)),
        "protocol_hash": sha(R.system_prompt(one_tag=False) + R.system_prompt(one_tag=True)),
        "engine_hash": sha((ROOT / "bayesenv" / "battleship.py").read_text()),
        "runner_hash": sha((ROOT / "experiments" / "battleship_llm.py").read_text()),
        "config": cfg})
    if not (out / "baselines.jsonl").exists():
        print("computing the reference and scripted baselines on the same boards ...", flush=True)
        baselines(out, cfg["salt"], list(range(lo, hi)))
    for m in models:
        print(f"== {m['provider']} / {m['model']}", flush=True)
        try:
            manifest["models"][m["model"]] = asyncio.run(run_model(m, cfg, out, a.dry_run))
        except KeyError as e:
            print(f"   skipped: missing API key {e} in .env", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"   failed: {type(e).__name__}: {str(e)[:200]}", flush=True)
        mpath.write_text(json.dumps(manifest, indent=1))
    import importlib.util
    spec = importlib.util.spec_from_file_location("bs_report", ROOT / "scripts" / "battleship_llm_report.py")
    rep = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rep)
    rep.main(out)


if __name__ == "__main__":
    main()
