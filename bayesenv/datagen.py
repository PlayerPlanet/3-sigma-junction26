"""Training rows from spec environments (see docs/TASK_SPEC.md for the schema).

One (environment instance, seed) yields two trajectories on the same task, one with the
Bayesian reference's experiments and one with random experiments, and from each:

  * `design` rows  - a state at a random depth plus 6 candidate designs with their estimated
                     expected information gain; reward for picking candidate i = eig[i] / max(eig)
  * `predict` row  - the full history plus the evaluation designs; the reward is the exact
                     Bayesian reward, recomputed from (env, seed) by `predict_reward`
  * `demo` rows    - the reference's completion for each of the prompts above

Prompts are chat message lists in the text protocol of bayesenv/llm_agent.py. theta* is never
written to a row.
"""

from __future__ import annotations

import json

import numpy as np

from .bayes import Posterior
from .llm_agent import OBS_RE, THINK_RE, parse_predictions, system_prompt
from .task import Task, bayes_reward

N_CANDIDATES = 6
# EIG LABELS: Posterior.eig(k) averaged over `reps` independent calls. The bernoulli estimator
# only has theta-sampling noise; the gaussian one is nested Monte Carlo (k outer x k inner) and
# is much noisier per call (measured: docs/TASK_SPEC.md).
EIG_K = {"bernoulli": 4096, "gaussian": 1024}
EIG_REPS = {"bernoulli": 1, "gaussian": 8}
KINDS = ("design", "predict", "demo")
SPLITS = ("train", "heldout_instance", "heldout_family", "lab_transfer")
# "categorical" and the optional design fields below only occur in the lab rows (bayesenv/lab_rows.py)
FAMILIES = ("bernoulli", "gaussian", "categorical")
DESIGN_OPTIONAL = {"value", "greedy_choice", "dp_choice"}
COMMON = {"spec": str, "spec_hash": str, "instance": int, "seed": int, "kind": str, "split": str,
          "env": str, "family": str, "source": str, "depth": int, "prompt": list}


def fmt_design(x) -> list:
    """Designs as shown to the agent: 6 significant digits, integers without a decimal point."""
    return [int(v) if float(v).is_integer() and abs(v) < 1e9 else float(f"{v:.6g}") for v in np.asarray(x, float)]


def result_message(env, y: float, remaining: int) -> str:
    res = f"{y:g}" if env.family == "gaussian" else f"{int(y)}"
    return f"Result: {res}. Experiments remaining: {remaining}."


def predict_message(eval_x: np.ndarray) -> str:
    designs = json.dumps([fmt_design(x) for x in eval_x])
    return (f"The experiment phase is over. Predict for these {len(eval_x)} designs, in order: "
            f"{designs}\nAnswer with the JSON list only.")


def candidates_message(cands: np.ndarray) -> str:
    lines = "\n".join(f"{i + 1}: {json.dumps(fmt_design(c))}" for i, c in enumerate(cands))
    return ("Choose your next experiment from these candidate designs, picking the one you expect "
            f"to be most informative:\n{lines}\nReply with exactly one tag, <observe>[design]</observe>.")


def format_prediction(env, pred: dict) -> str:
    if env.family == "bernoulli":
        return json.dumps(np.round(pred["p"], 3).tolist())
    return json.dumps(np.round(np.stack([pred["mean"], pred["sd"]], 1), 3).tolist())


def split_of(spec_name: str, instance: int, heldout_families) -> str:
    if spec_name in heldout_families:
        return "heldout_family"
    return "heldout_instance" if instance % 10 == 9 else "train"


def design_candidates(env, post: Posterior, rng: np.random.Generator, n: int = N_CANDIDATES,
                      pool: int = 64) -> np.ndarray:
    """n-1 random designs plus the EIG-best of a random pool, shuffled."""
    xp = env.sample_designs(rng, pool)
    best = xp[int(np.argmax(post.eig(xp)))]
    cands = np.vstack([env.sample_designs(rng, n - 1), best[None, :]])
    return cands[rng.permutation(n)]


def eig_labels(post: Posterior, cands: np.ndarray, k: int | None = None, reps: int | None = None) -> np.ndarray:
    k, reps = k or EIG_K[post.env.family], reps or EIG_REPS[post.env.family]
    return np.mean([post.eig(cands, k=k) for _ in range(reps)], axis=0)


def instance_rows(env_name: str, seed: int, heldout_families=(), designs_per_traj: int = 2,
                  full_info: bool = True, n_particles: int = 20_000,
                  ref_candidates: int = 64) -> list[dict]:
    task = Task(env_name, seed)
    env = task.env
    base = {"spec": env.spec_name, "spec_hash": env.spec_hash,
            "instance": -1 if env.instance is None else env.instance, "seed": seed,
            "split": split_of(env.spec_name, -1 if env.instance is None else env.instance, heldout_families),
            "env": env.name, "family": env.family}
    system = system_prompt(task, full_info=full_info)
    rows = []
    for si, source in enumerate(("reference", "random")):
        ep = task.episode()
        post = Posterior(env, np.random.default_rng([seed, 1 + si]), n=n_particles)
        rng = np.random.default_rng([seed, 0xDA7A, si])
        depths = set(rng.choice(task.budget, size=min(designs_per_traj, task.budget), replace=False).tolist())
        msgs = [{"role": "system", "content": system},
                {"role": "user", "content": "Begin. Run your first experiment."}]
        while ep.remaining:
            depth = len(ep.xs)
            if depth in depths:
                cands = design_candidates(env, post, rng)
                eig = eig_labels(post, cands)
                prompt = msgs[:-1] + [{"role": "user", "content":
                                       msgs[-1]["content"] + "\n" + candidates_message(cands)}]
                meta = {**base, "source": source, "depth": depth, "prompt": prompt}
                clist = [fmt_design(c) for c in cands]
                rows.append({**meta, "kind": "design", "candidates": clist,
                             "eig": [round(float(e), 5) + 0.0 for e in eig]})
                rows.append({**meta, "kind": "demo", "of": "design",
                             "completion": f"<observe>{json.dumps(clist[int(np.argmax(eig))])}</observe>"})
            x = post.best_design(ref_candidates) if source == "reference" else env.sample_designs(ep.rng, 1)[0]
            y = ep.observe(x)
            post.update(x, y)
            msgs.append({"role": "assistant", "content": f"<observe>{json.dumps(fmt_design(x))}</observe>"})
            msgs.append({"role": "user", "content": result_message(env, y, ep.remaining)})
        eval_x = ep.finish()
        prompt = msgs + [{"role": "user", "content": predict_message(eval_x)}]
        pred = post.predictive(eval_x)
        completion = format_prediction(env, pred)
        meta = {**base, "source": source, "depth": len(ep.xs), "prompt": prompt}
        # Score of the reference's ROUNDED answer: what a perfect imitator of the demo gets.
        ref = bayes_reward(task, parse_predictions(env, completion, task.n_eval))["bayes_raw"]
        rows.append({**meta, "kind": "predict", "n_eval": task.n_eval, "reference_bayes_raw": round(ref, 4)})
        rows.append({**meta, "kind": "demo", "of": "predict", "completion": completion})
    return rows


# ---- rewards and validation for consumers of the rows -------------------------------

def design_reward(row: dict, completion: str) -> float:
    """eig[i] / max(eig) for the chosen candidate i; 0 for anything that is not a candidate."""
    m = OBS_RE.findall(THINK_RE.sub("", completion))
    if not m:
        return 0.0
    try:
        x = np.asarray(json.loads(m[-1]), dtype=float).reshape(-1)
    except (ValueError, TypeError):
        return 0.0
    eig = np.maximum(np.asarray(row["eig"], float), 0.0)
    for c, e in zip(row["candidates"], eig):
        if len(c) == len(x) and np.allclose(x, c, rtol=1e-6, atol=1e-12):
            return float(e / max(eig.max(), 1e-12))
    return 0.0


def predict_reward(row: dict, completion: str) -> float:
    """Exact Bayesian reward, as train/grpo_predict.py computes it: -1 if unparseable, else
    the raw normalised expected log score clipped to [-1, 1]."""
    task = Task(row["env"], int(row["seed"]))
    pred = parse_predictions(task.env, completion, task.n_eval)
    if pred is None:
        return -1.0
    return float(max(-1.0, min(1.0, bayes_reward(task, pred)["bayes_raw"])))


def validate_row(row: dict) -> None:
    """Raise ValueError unless `row` follows the documented schema."""
    for k, t in COMMON.items():
        if k not in row or not isinstance(row[k], t) or isinstance(row[k], bool):
            raise ValueError(f"row field {k!r} missing or not {t.__name__}")
    if row["kind"] not in KINDS or row["split"] not in SPLITS:
        raise ValueError("bad kind or split")
    if row["source"] not in ("reference", "random") or row["family"] not in FAMILIES:
        raise ValueError("bad source or family")
    if "theta" in row:
        raise ValueError("rows must not carry theta*")
    p = row["prompt"]
    if len(p) < 2 or p[0].get("role") != "system" or p[-1].get("role") != "user" or \
            any(set(m) != {"role", "content"} or not isinstance(m["content"], str) for m in p):
        raise ValueError("prompt must be chat messages: system first, user last")
    extra = set(row) - set(COMMON)
    if row["kind"] == "design":
        if extra - DESIGN_OPTIONAL != {"candidates", "eig"} or (extra & DESIGN_OPTIONAL
                                                                  and not DESIGN_OPTIONAL <= extra):
            raise ValueError(f"design row fields: {sorted(extra)}")
        if "value" in row:
            ok = len(row["value"]) == N_CANDIDATES and all(
                isinstance(v, float) and np.isfinite(v) for v in row["value"])
            if not ok:
                raise ValueError("value must be 6 finite floats")
            if not all(isinstance(row[k], int) and not isinstance(row[k], bool)
                       and 0 <= row[k] < N_CANDIDATES for k in ("greedy_choice", "dp_choice")):
                raise ValueError("greedy_choice and dp_choice must be candidate indices")
        if len(row["candidates"]) != N_CANDIDATES or len(row["eig"]) != N_CANDIDATES:
            raise ValueError("design rows carry 6 candidates and 6 EIG values")
        if not all(isinstance(e, float) and np.isfinite(e) for e in row["eig"]):
            raise ValueError("eig must be finite floats")
    elif row["kind"] == "predict":
        if extra != {"n_eval", "reference_bayes_raw"}:
            raise ValueError(f"predict row fields: {sorted(extra)}")
    else:
        if extra != {"of", "completion"} or row["of"] not in ("design", "predict") or \
                not isinstance(row["completion"], str):
            raise ValueError(f"demo row fields: {sorted(extra)}")


# ---- how noisy are the EIG labels? --------------------------------------------------

def _spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def eig_stability(env_name: str, seed: int, reps: int = 5, n_particles: int = 20_000,
                  ref_candidates: int = 64) -> dict:
    """Re-estimate one design row's EIG labels `reps` times, two ways:
      single - same particle posterior, ONE Posterior.eig call per estimate (no averaging)
      same  - same particle posterior, fresh inner-sampling noise (pure estimator noise)
      indep - a fresh particle posterior (different prior draws and rejuvenation) on the same data
    and report how much the normalised reward eig / max(eig) and the ranking move."""
    task = Task(env_name, seed)
    env, ep = task.env, task.episode()
    rng = np.random.default_rng([seed, 0xE16])
    depth = int(rng.integers(task.budget))
    post = Posterior(env, np.random.default_rng([seed, 1]), n=n_particles)
    for _ in range(depth):
        x = post.best_design(ref_candidates)
        post.update(x, ep.observe(x))
    cands = design_candidates(env, post, rng)
    xs, ys = ep.data()
    same = [eig_labels(post, cands) for _ in range(reps)]
    indep = []
    for r in range(reps):
        p2 = Posterior(env, np.random.default_rng([seed, 0xE17, r]), n=n_particles)
        for x, y in zip(xs, ys):  # sequential, like the generator, so rejuvenation is realistic
            p2.update(x, y)
        indep.append(eig_labels(p2, cands))
    out = {"env": env.name, "spec": env.spec_name, "family": env.family, "seed": seed, "depth": depth}
    single = [eig_labels(post, cands, reps=1) for _ in range(reps)]  # one Posterior.eig call, no averaging
    for tag, est in (("single", np.array(single)), ("same", np.array(same)), ("indep", np.array(indep))):
        rew = np.maximum(est, 0) / np.maximum(est.max(1, keepdims=True), 1e-12)
        top = np.argmax(est, 1)
        pairs = [(i, j) for i in range(reps) for j in range(i + 1, reps)]
        out[tag] = {
            "reward_sd_mean": float(rew.std(0).mean()), "reward_sd_max": float(rew.std(0).max()),
            "top1_agree": float(np.mean(top == np.bincount(top).argmax())),
            "spearman": float(np.mean([_spearman(est[i], est[j]) for i, j in pairs])),
            # regret of trusting one estimate: reward (under the mean estimate) of its argmax
            "top1_regret": float(np.mean(1 - (est.mean(0) / max(est.mean(0).max(), 1e-12))[top])),
        }
    return out


def stability_summary(res: list[dict]) -> dict:
    """Mean of each eig_stability metric per spec and per likelihood family."""
    agg = {}
    for group in sorted({r["spec"] for r in res}) + ["bernoulli", "gaussian"]:
        rs = [r for r in res if group in (r["spec"], r["family"])]
        if rs:
            agg[group] = {"states": len(rs), **{
                f"{tag}_{k}": round(float(np.mean([r[tag][k] for r in rs])), 4)
                for tag in ("single", "same", "indep") for k in rs[0][tag]}}
    return agg


# ---- shared bookkeeping for the local and the Modal runner --------------------------

def make_jobs(specs, instances: int, seeds_per_instance: int = 1) -> list[tuple[str, int]]:
    """(env name, seed) per task, instance-major so an early stop covers every family evenly."""
    return [(s.env_name(k), 1000 * k + j) for k in range(instances) for s in specs
            for j in range(seeds_per_instance)]


class RowSink:
    """Writes rows.jsonl and accumulates the counts and throughput that go into meta.json."""

    def __init__(self, out_dir):
        from collections import Counter
        from pathlib import Path
        self.dir = Path(out_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.f = (self.dir / "rows.jsonl").open("w", encoding="utf-8", newline="\n")
        self.kinds, self.splits, self.cpu, self.fam_rows = Counter(), Counter(), Counter(), Counter()
        self.rows = self.tasks = self.bytes = 0
        self.sample: list[dict] = []

    def add(self, rows: list[dict], secs: float) -> None:
        for r in rows:
            line = json.dumps(r)
            self.f.write(line + "\n")
            self.bytes += len(line) + 1
            self.kinds[r["kind"] if r["kind"] != "demo" else f"demo:{r['of']}"] += 1
            self.splits[r["split"]] += 1
        if rows[0]["instance"] == 0:
            self.sample += rows
        fam = rows[0]["family"]
        self.rows += len(rows)
        self.tasks += 1
        self.cpu[fam] += secs
        self.fam_rows[fam] += len(rows)

    def finish(self, meta: dict, wall: float, sample_out: str = "", sample_rows: int = 20) -> dict:
        self.f.close()
        total = sum(self.cpu.values())
        meta.update({
            "tasks_done": self.tasks, "rows": self.rows, "bytes": self.bytes,
            "kinds": dict(self.kinds), "splits": dict(self.splits), "wall_seconds": round(wall, 1),
            "worker_seconds": round(total, 1),
            "rows_per_worker_second": round(self.rows / total, 3),
            "rows_per_worker_second_by_family": {k: round(self.fam_rows[k] / self.cpu[k], 3) for k in self.cpu},
            "rows_per_wall_second": round(self.rows / wall, 2),
            "worker_hours_per_100k_rows": round(1e5 * total / self.rows / 3600, 2),
            "worker_hours_per_1M_rows": round(1e6 * total / self.rows / 3600, 1),
            "gb_per_1M_rows": round(1e6 * self.bytes / self.rows / 1e9, 2),
        })
        (self.dir / "meta.json").write_text(json.dumps(meta, indent=1))
        if sample_out:
            # documentation sample: per family, the reference trajectory's first design row, its
            # demo, the predict row and its demo
            keep = []
            for name in sorted({r["spec"] for r in self.sample}):
                rs = [r for r in self.sample if r["spec"] == name and r["source"] == "reference"]
                is_design = lambda r: "design" in (r["kind"], r.get("of"))
                d = [r for r in rs if is_design(r)]
                keep += [r for r in d if r["depth"] == d[0]["depth"]] + [r for r in rs if not is_design(r)]
            from pathlib import Path
            Path(sample_out).parent.mkdir(parents=True, exist_ok=True)
            with open(sample_out, "w", encoding="utf-8", newline="\n") as f:
                for r in keep[:sample_rows]:
                    f.write(json.dumps(r) + "\n")
        return meta
