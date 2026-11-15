"""Render Harbor tasks from a Modal vref run (no heavy compute here).
usage: python render.py <vref json> <rule e.g. Aboot:8> <desks comma list>"""
import json, secrets, shutil, sys
import numpy as np
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "template/environment/mcp-server"))
from make_tasks import instruction  # noqa: E402

src = json.load(open(sys.argv[1]))
rule, n0 = sys.argv[2].split(":"); n0 = int(n0)
desks = [int(x) for x in sys.argv[3].split(",")]
meta_all = json.load(open(HERE / "tasks_meta.json")) if (HERE / "tasks_meta.json").exists() else {}
outdir = HERE / "tasks"; outdir.mkdir(exist_ok=True)
for d in desks:
    m = src["meta"][str(d)]
    v = np.array([r["value"] for r in src["results"] if r["desk"] == d and r["rule"] == rule and r["n0"] == n0])
    vref = float(v.mean())
    rew = np.clip((v - m["V_nodata"]) / (vref - m["V_nodata"]), 0, 1)
    meta_all[str(d)] = dict(seeds=m["seeds"], V_ref=vref, V_ref_sd=float(v.std()), n_datasets=int(len(v)),
                            ref_reward_mean=float(rew.mean()), ref_reward_sd=float(rew.std()),
                            ref_reward_p_below_half=float((rew < 0.5).mean()), V_true_dp=m["V_true_dp"],
                            V_nodata=m["V_nodata"], rule=rule, n0=n0, model=m["model"])
    dst = outdir / f"credit-blackbox-{d}"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(HERE / "template", dst, ignore=shutil.ignore_patterns("__pycache__"))
    tok = secrets.token_urlsafe(24)
    for f in dst.rglob("*"):
        if f.is_file() and f.suffix in {".toml", ".md", ".yaml", ".sh", ".py", ""}:
            s = f.read_text(encoding="utf-8")
            s = (s.replace("__TASKID__", str(d)).replace("__DESK__", str(d)).replace("__SEEDS__", ",".join(map(str, m["seeds"])))
                 .replace("__VREF__", f"{vref:.4f}").replace("__TOKEN__", tok))
            f.write_text(s, encoding="utf-8", newline="\n")
    (dst / "instruction.md").write_text(instruction(m["seeds"]), encoding="utf-8", newline="\n")
    (dst / "tests" / "grader_token").write_text(tok, encoding="utf-8", newline="\n")
    print(d, {k: round(x, 3) if isinstance(x, float) else x for k, x in meta_all[str(d)].items() if k not in ("model", "seeds")})
json.dump(meta_all, open(HERE / "tasks_meta.json", "w"), indent=1)
