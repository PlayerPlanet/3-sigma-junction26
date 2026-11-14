#!/bin/bash
# E4 runbook on the Verda A100 trainer VM (code + data copied to /root/work by scp).
#   stage 0: baseline  - serve base Gemma 4 E4B with vLLM, run the eval seeds (0-49)
#   stage 1: SFT+LoRA  - reference demonstrations + top-30% of Gemma-26B rollouts
#   stage 2: GRPO      - prediction step, exact Bayesian reward
#   eval   : serve each adapter with vLLM (LoRA), rerun eval seeds; compare in results/e4.jsonl
set -euo pipefail
cd /root/work
PY=/opt/train/bin/python
export HF_HUB_ENABLE_HF_TRANSFER=1 PYTHONUNBUFFERED=1
export CUDA_HOME=$(ls -d /usr/local/cuda* | head -1) PATH=/opt/train/bin:$(ls -d /usr/local/cuda*/bin | head -1):$PATH
export MAX_JOBS=8  # FlashInfer JIT (ninja/nvcc) parallelism
MODEL=google/gemma-4-E4B-it
KEY=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')

serve() {  # serve <name> [adapter-path]
  local lora=()
  [ -n "${2:-}" ] && lora=(--enable-lora --max-lora-rank 32 --lora-modules "$1=$2")
  /opt/train/bin/vllm serve $MODEL --served-model-name base --port 8100 --api-key "$KEY" \
     --max-model-len 49152 --gpu-memory-utilization 0.85 "${lora[@]}" > "logs/serve_$1.log" 2>&1 &
  echo $! > /tmp/serve.pid
  until curl -sf -o /dev/null http://localhost:8100/v1/models -H "Authorization: Bearer $KEY"; do
    kill -0 "$(cat /tmp/serve.pid)" 2>/dev/null || { echo "vLLM serve for $1 died; see logs/serve_$1.log"; exit 1; }
    sleep 10
  done
}
stop_serve() { kill "$(cat /tmp/serve.pid)" 2>/dev/null || true; sleep 15; }
evaluate() {  # evaluate <served-model-name>
  VLLM_LOCAL_KEY="$KEY" $PY experiments/llm_runs.py --provider local --model "$1" \
     --envs hyperbolic location --seeds 0:50 --concurrency 32 --out results/e4.jsonl
}
mkdir -p logs results

if [ ! -f results/.stage0 ]; then serve base; evaluate base; stop_serve; touch results/.stage0; fi
if [ ! -f results/.stage1 ]; then
  $PY train/sft_lora.py --data results/sft/oracle.jsonl results/sft/rft.jsonl --model $MODEL \
     --out /root/ckpt/sft --epochs 1 > logs/sft.log 2>&1
  serve sft /root/ckpt/sft; evaluate sft; stop_serve; touch results/.stage1
fi
if [ ! -f results/.stage2 ]; then
  $PY train/grpo_predict.py --prompts results/sft/grpo_prompts.jsonl --model $MODEL \
     --adapter /root/ckpt/sft --out /root/ckpt/grpo --steps 300 > logs/grpo.log 2>&1
  serve grpo /root/ckpt/grpo; evaluate grpo; stop_serve; touch results/.stage2
fi
echo "E4 done"
