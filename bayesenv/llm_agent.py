"""LLM agent loop for the Bayesian experimental-design environments.

Provider-agnostic text protocol (works for any chat model):
  experiment phase:  <observe>[...design...]</observe>  or  <done/> to stop early
  prediction phase:  a JSON list, one entry per evaluation design
      bernoulli: probability of outcome 1           e.g. [0.8, 0.1, ...]
      gaussian:  [mean, sd] pairs                    e.g. [[1.2, 0.6], ...]

Every model call is logged with token usage, and providers with a hard request budget
(Gemini: Google asks for normal hackathon-scale usage) go through a persistent counter.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .task import Episode, Task, bayes_reward, ceiling_ppc, naive_reward, prior_prediction
from .bayes import Posterior

OBS_RE = re.compile(r"<observe>\s*(\[.*?\])\s*</observe>", re.S)
THINK_RE = re.compile(r"<think>.*?</think>", re.S)

PROVIDERS = {
    # name: (base_url env/const, api key env, request cap or None)
    "modal": ("https://playerplanet-3-sigma-submission--bayesenv-llm-serve.us-east.modal.run/v1", "VLLM_API_KEY", None),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai/", "GDM_API_KEY", 300),
    "nvidia": ("https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY", 2000),
    "minimax": ("https://api.minimax.io/v1", "MINIMAX_API_KEY", None),  # user: no cap
    "anthropic": (None, "ANTHROPIC_API_KEY", 1500),
    "verda": ("https://inference.verda.com/v1", "VERDA_KIMI_API_KEY", None),  # billed to Verda credits
    "local": ("http://localhost:8100/v1", "VLLM_LOCAL_KEY", None),  # trainer VM eval server
    "nemotron": ("http://95.133.254.110:8000/v1", "VERDA_VLLM_API_KEY", None),  # Verda VM
}
BUDGET_FILE = Path("results/request_budget.json")


class BudgetExceeded(RuntimeError):
    pass


def _charge(provider: str) -> None:
    cap = PROVIDERS[provider][2]
    cap = int(os.environ.get(f"LLM_CAP_{provider.upper()}", cap or 0)) or cap  # explicit per-run override
    if cap is None:
        return
    BUDGET_FILE.parent.mkdir(parents=True, exist_ok=True)
    used = json.loads(BUDGET_FILE.read_text()) if BUDGET_FILE.exists() else {}
    if used.get(provider, 0) >= cap:
        raise BudgetExceeded(f"{provider} request cap {cap} reached")
    used[provider] = used.get(provider, 0) + 1
    BUDGET_FILE.write_text(json.dumps(used))


@dataclass
class Model:
    provider: str
    name: str
    max_tokens: int = 2048
    temperature: float | None = 0.7
    rpm: float | None = None
    _last: float = field(default=0.0, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def __post_init__(self):
        base, key_env, _ = PROVIDERS[self.provider]
        key = os.environ[key_env]
        if self.provider == "anthropic":
            import anthropic
            self.client = anthropic.AsyncAnthropic(api_key=key)
        else:
            import openai
            self.client = openai.AsyncOpenAI(base_url=base, api_key=key, max_retries=6,
                                             timeout=float(os.environ.get("LLM_TIMEOUT", "300")))

    async def chat(self, system: str, messages: list[dict], max_tokens: int | None = None) -> tuple[str, dict]:
        max_tokens = max_tokens or self.max_tokens
        if self.rpm:
            async with self._lock:
                wait = self._last + 60.0 / self.rpm - time.time()
                if wait > 0:
                    await asyncio.sleep(wait)
                self._last = time.time()
        _charge(self.provider)
        if self.provider == "anthropic":
            # Streaming is required by the SDK for large max_tokens (long-running requests).
            async with self.client.messages.stream(
                    model=self.name, system=system, messages=messages, max_tokens=max_tokens) as st:
                r = await st.get_final_message()
            text = "".join(b.text for b in r.content if b.type == "text")
            return text, {"in": r.usage.input_tokens, "out": r.usage.output_tokens, "stop": r.stop_reason}
        kw = {"temperature": self.temperature} if self.temperature is not None else {}
        r = await self.client.chat.completions.create(
            model=self.name, max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}] + messages, **kw)
        u = r.usage
        return (r.choices[0].message.content or ""), {"in": u.prompt_tokens if u else 0,
                                                       "out": u.completion_tokens if u else 0,
                                                       "stop": r.choices[0].finish_reason}


def _example_design(env) -> list:
    x = env.sample_designs(np.random.default_rng(0), 1)[0]
    # Spec environments already round designs to 4 significant digits; 2 decimals would
    # destroy small log-scale designs.
    if not hasattr(env, "spec_name"):
        return x.round(2).tolist()
    return [int(v) if float(v).is_integer() else float(f"{v:.6g}") for v in x]


def system_prompt(task: Task, full_info: bool | None = None) -> str:
    env = task.env
    fmt = ("a JSON list of probabilities that the outcome is 1, one per design"
           if env.family == "bernoulli" else
           "a JSON list of [mean, sd] pairs for the measured value, one per design")
    # FULL_INFO=1 (experiment E3b) also states the exact generative model, to test whether
    # agents fail for lack of information or for lack of correct belief updating.
    if full_info is None:
        full_info = os.environ.get("FULL_INFO") == "1"
    card = f"{env.model_card()}\n\n" if full_info else ""
    return (
        f"You are a scientist running experiments on an unknown system.\n\n{env.describe()}\n\n"
        f"{card}"
        f"You may run at most {task.budget} experiments. Choose each one to learn as much as "
        "possible; you will then be asked to predict outcomes for new designs you have not seen. "
        "Your predictions are scored by how much probability they assign to what the system "
        "actually does, so be calibrated: confident where the evidence supports it, uncertain "
        "where it does not.\n\n"
        "To run an experiment, reply with your reasoning followed by exactly one tag, e.g. "
        f"<observe>{json.dumps(_example_design(task.env))}</observe>. "
        "To stop experimenting early, reply <done/>.\n"
        f"In the prediction phase you must answer with {fmt}, and nothing after it."
    )


def parse_predictions(env, text: str, n: int) -> dict | None:
    text = THINK_RE.sub("", text)
    for m in reversed(list(re.finditer(r"\[[\s\S]*\]", text))):
        try:
            arr = json.loads(m.group(0))
        except json.JSONDecodeError:
            continue
        a = np.asarray(arr, dtype=float)
        if env.family == "bernoulli" and a.shape == (n,) and np.all((a >= 0) & (a <= 1)):
            return {"p": a}
        if env.family == "gaussian" and a.shape == (n, 2) and np.all(a[:, 1] > 0):
            return {"mean": a[:, 0], "sd": a[:, 1]}
    return None


async def run_episode(model: Model, task: Task, run_id: str) -> dict:
    ep = task.episode()
    system = system_prompt(task)
    msgs: list[dict] = [{"role": "user", "content": "Begin. Run your first experiment."}]
    usage = {"in": 0, "out": 0, "calls": 0}
    stops: list = []
    transcript = []
    errors = 0
    while ep.remaining and errors < 4:
        text, u = await model.chat(system, msgs)
        usage["in"] += u["in"]; usage["out"] += u["out"]; usage["calls"] += 1
        stops.append(u.get("stop"))
        msgs.append({"role": "assistant", "content": text})
        transcript.append(text)
        visible = THINK_RE.sub("", text)
        if "<done/>" in visible and not OBS_RE.search(visible):
            break
        m = OBS_RE.findall(visible)
        try:
            if not m:
                raise ValueError("no <observe>[...]</observe> tag found")
            y = ep.observe(json.loads(m[-1]))
            reply = (f"Result: {y:g}. Experiments remaining: {ep.remaining}."
                     if ep.env.family == "gaussian" else
                     f"Result: {int(y)}. Experiments remaining: {ep.remaining}.")
        except Exception as e:  # invalid action: no state change, budget not consumed
            errors += 1
            reply = f"Invalid experiment ({e}). Experiments remaining: {ep.remaining}."
        msgs.append({"role": "user", "content": reply})
    eval_x = ep.finish()
    designs = json.dumps(np.round(eval_x, 3).tolist())
    msgs.append({"role": "user", "content":
                 f"The experiment phase is over. Predict for these {len(eval_x)} designs, in order: "
                 f"{designs}\nAnswer with the JSON list only."})
    pred = None
    for _ in range(3):
        # The prediction answer is long (one entry per design) and reasoning models think
        # first, so give this phase a much larger token budget.
        text, u = await model.chat(system, msgs, max_tokens=max(4 * model.max_tokens, int(os.environ.get("PRED_MIN_TOKENS", "32768"))))
        usage["in"] += u["in"]; usage["out"] += u["out"]; usage["calls"] += 1
        stops.append(u.get("stop"))
        transcript.append(text)
        pred = parse_predictions(task.env, text, len(eval_x))
        if pred is not None:
            break
        msgs += [{"role": "assistant", "content": text},
                 {"role": "user", "content": "That was not a valid JSON list of the required shape. Answer with the JSON list only."}]
    parsed = pred is not None
    if pred is None:  # unparseable -> prior predictive (the do-nothing score: 0 under Bayes grading)
        pred = prior_prediction(task)
    xs, ys = ep.data()
    post = Posterior(task.env, np.random.default_rng([task.seed, 0xA11]), n=20_000)
    if len(ys):
        post.update(xs, ys)
    row = {"run_id": run_id, "provider": model.provider, "model": model.name, "env": task.env_name,
           "seed": task.seed, "n_obs": len(ys), "parsed": parsed, "invalid_actions": errors, **usage}
    row.update(naive_reward(task, pred))
    row.update(bayes_reward(task, pred))
    row["bayes_raw_post_own"] = bayes_reward(task, post.predictive(eval_x))["bayes_raw"]
    row.update(ceiling_ppc(task, xs, ys, pred))
    row["stop_reasons"] = stops
    row["designs"] = xs.round(3).tolist()
    row["outcomes"] = ys.tolist()
    row["transcript"] = transcript
    return row
