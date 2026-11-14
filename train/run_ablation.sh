#!/bin/bash
# E4 ablation (second Verda GPU): GRPO on the prediction step starting from the BASE model,
# no SFT warm start. Answers: does RL with the exact Bayesian reward alone close the
# inference gap, or is imitation of the Bayesian reference needed first?
set -euo pipefail
cd /root/work
PY=/opt/train/bin/python
export HF_HUB_ENABLE_HF_TRANSFER=1 PYTHONUNBUFFERED=1
export CUDA_HOME=$(ls -d /usr/local/cuda* | head -1) PATH=/opt/train/bin:$(ls -d /usr/local/cuda*/bin | head -1):$PATH
export MAX_JOBS=8
MODEL=google/gemma-4-E4B-it
KEY=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')
mkdir -p logs results

if [ ! -f results/.ablation_train ]; then
  $PY train/grpo_predict.py --prompts results/sft/grpo_prompts.jsonl --model $MODEL \
     --out /root/ckpt/grpo_base --steps 200 > logs/grpo_base.log 2>&1
  touch results/.ablation_train
fi
if [ ! -f results/.ablation_eval ]; then
  /opt/train/bin/vllm serve $MODEL --served-model-name base --port 8100 --api-key "$KEY" \
     --max-model-len 49152 --gpu-memory-utilization 0.85 --enable-lora --max-lora-rank 32 \
     --lora-modules grpo_base=/root/ckpt/grpo_base > logs/serve_grpo_base.log 2>&1 &
  echo $! > /tmp/serve.pid
  until curl -sf -o /dev/null http://localhost:8100/v1/models -H "Authorization: Bearer $KEY"; do
    kill -0 "$(cat /tmp/serve.pid)" 2>/dev/null || { echo "serve died"; exit 1; }
    sleep 10
  done
  VLLM_LOCAL_KEY="$KEY" $PY experiments/llm_runs.py --provider local --model grpo_base \
     --envs hyperbolic location --seeds 0:50 --concurrency 32 --out results/e4_ablation.jsonl
  kill "$(cat /tmp/serve.pid)"; touch results/.ablation_eval
fi
echo "ablation done"
