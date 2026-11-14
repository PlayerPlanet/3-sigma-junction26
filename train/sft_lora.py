"""Stage 1: LoRA SFT of a small open model on environment experience (runs on a Verda GPU VM).

    python train/sft_lora.py --data results/sft/oracle.jsonl results/sft/rft.jsonl \
        --model google/gemma-4-E4B-it --out /root/ckpt/sft

Trains on whole conversations (experiment turns + final prediction), loss on assistant turns.
"""

from __future__ import annotations

import argparse
import json
import random

from datasets import Dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer


def load(paths: list[str], max_per_source: int | None) -> Dataset:
    rows = []
    for p in paths:
        conv = [json.loads(l) for l in open(p)]
        random.Random(0).shuffle(conv)
        for c in conv[:max_per_source]:
            # Gemma 4's chat template has no {% generation %} markers, so TRL cannot mask
            # non-assistant tokens in a conversation. Split each conversation into one
            # prompt/completion example per assistant turn: completion-only loss then trains
            # every agent decision (experiments and the final prediction) and nothing else.
            m = c["messages"]
            for i, msg in enumerate(m):
                if msg["role"] == "assistant":
                    rows.append({"prompt": m[:i], "completion": [msg]})
    random.Random(1).shuffle(rows)
    return Dataset.from_list(rows)


def main(a) -> None:
    ds = load(a.data, a.max_per_source)
    print(f"{len(ds)} conversations")
    cfg = SFTConfig(
        output_dir=a.out, num_train_epochs=a.epochs, per_device_train_batch_size=2,
        gradient_accumulation_steps=8, learning_rate=a.lr, lr_scheduler_type="cosine",
        warmup_steps=20, logging_steps=5, save_strategy="epoch", bf16=True,
        max_length=8192, completion_only_loss=True, gradient_checkpointing=True,
        report_to="none",
    )
    lora = LoraConfig(r=32, lora_alpha=64, lora_dropout=0.05, target_modules="all-linear",
                      task_type="CAUSAL_LM")
    trainer = SFTTrainer(model=a.model, args=cfg, train_dataset=ds, peft_config=lora)
    trainer.train()
    trainer.save_model(a.out)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--data", nargs="+", required=True)
    p.add_argument("--model", default="google/gemma-4-E4B-it")
    p.add_argument("--out", default="/root/ckpt/sft")
    p.add_argument("--epochs", type=float, default=2)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--max-per-source", type=int, default=None)
    main(p.parse_args())
