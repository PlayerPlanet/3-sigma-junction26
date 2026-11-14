"""Stage 2: GRPO on the prediction step with the exact Bayesian reward (Verda GPU VM).

    python train/grpo_predict.py --prompts results/sft/grpo_prompts.jsonl \
        --model google/gemma-4-E4B-it --adapter /root/ckpt/sft --out /root/ckpt/grpo

Why this step: the E3 decomposition shows agents (frontier and open) gather near-reference
data but lose most of their score turning it into calibrated predictions. The prediction step
is single-turn, and its reward (normalised expected log score under the true parameters) is
exact and has no outcome-sampling noise, so GRPO's group advantages are low-variance.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from datasets import Dataset
from peft import LoraConfig, PeftModel
from transformers import AutoModelForCausalLM
from trl import GRPOConfig, GRPOTrainer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bayesenv.llm_agent import parse_predictions  # noqa: E402
from bayesenv.task import Task, bayes_reward  # noqa: E402


def reward_fn(prompts, completions, env, seed, **_) -> list[float]:
    out = []
    for comp, e, s in zip(completions, env, seed):
        text = comp[-1]["content"] if isinstance(comp, list) else comp
        task = Task(e, int(s))
        pred = parse_predictions(task.env, text, task.n_eval)
        # Unparseable answers score below the prior (0); clip the raw score to [-1, 1] so a
        # single catastrophic miscalibration cannot dominate a group's advantages.
        out.append(-1.0 if pred is None else float(max(-1.0, min(1.0, bayes_reward(task, pred)["bayes_raw"]))))
    return out


def main(a) -> None:
    rows = [json.loads(l) for l in open(a.prompts)]
    ds = Dataset.from_list([{"prompt": r["prompt"], "env": r["env"], "seed": r["seed"]} for r in rows])
    model = a.model
    if a.adapter:
        base = AutoModelForCausalLM.from_pretrained(a.model, torch_dtype="bfloat16")
        model = PeftModel.from_pretrained(base, a.adapter).merge_and_unload()
    cfg = GRPOConfig(
        output_dir=a.out, learning_rate=a.lr, per_device_train_batch_size=8,
        gradient_accumulation_steps=2, num_generations=8, max_completion_length=1536,
        max_prompt_length=6144, temperature=1.0, beta=0.0, logging_steps=5,
        save_steps=50, bf16=True, gradient_checkpointing=True, max_steps=a.steps,
        use_vllm=a.vllm, vllm_mode="colocate", report_to="none",
    )
    lora = LoraConfig(r=32, lora_alpha=64, target_modules="all-linear", task_type="CAUSAL_LM")
    trainer = GRPOTrainer(model=model, reward_funcs=reward_fn, args=cfg, train_dataset=ds,
                          peft_config=lora)
    trainer.train()
    trainer.save_model(a.out)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--prompts", required=True)
    p.add_argument("--model", default="google/gemma-4-E4B-it")
    p.add_argument("--adapter", default="")
    p.add_argument("--out", default="/root/ckpt/grpo")
    p.add_argument("--lr", type=float, default=5e-6)
    p.add_argument("--steps", type=int, default=300)
    p.add_argument("--vllm", action="store_true")
    main(p.parse_args())
