#!/bin/bash
# Verda A100 80GB training VM: LoRA SFT + GRPO of a small open model (Gemma 4 E4B) on
# experience from the Bayesian experimental-design environment, and vLLM serving of the
# fine-tuned adapter for evaluation. Code and data are copied in with scp.
exec > /var/log/trainer-startup.log 2>&1
set -x
export HOME=/root
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh
/root/.local/bin/uv venv /opt/train --python 3.12
/root/.local/bin/uv pip install --python /opt/train/bin/python \
  "vllm==0.33.0" trl peft datasets accelerate "huggingface_hub[hf_transfer]" numpy scipy openai anthropic
HF_HUB_ENABLE_HF_TRANSFER=1 /opt/train/bin/huggingface-cli download google/gemma-4-E4B-it
touch /root/READY
