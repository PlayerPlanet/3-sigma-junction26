"""GRPO prompts for the prediction step: every conversation cut right before the final answer.

    python experiments/make_grpo_prompts.py results/sft/oracle.jsonl results/sft/rft.jsonl \
        --out results/sft/grpo_prompts.jsonl

Includes both reference-run data (informative designs) and the model's own rollouts (its own
design distribution), so the policy learns to update on whatever data it actually collects.
"""

import argparse
import json

p = argparse.ArgumentParser()
p.add_argument("inputs", nargs="+")
p.add_argument("--out", required=True)
a = p.parse_args()
n = 0
with open(a.out, "w") as f:
    for path in a.inputs:
        for line in open(path):
            c = json.loads(line)
            msgs = c["messages"]
            assert msgs[-1]["role"] == "assistant"
            f.write(json.dumps({"prompt": msgs[:-1], "env": c["env"], "seed": c["seed"],
                                "source": c["source"]}) + "\n")
            n += 1
print(f"{n} prompts -> {a.out}")
