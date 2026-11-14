#!/bin/bash
# E5: the judges harness (Harbor + OpenCode over MCP) with open models on the Bayesian dataset.
cd /root/work; set -a; . ./.env; set +a; export PATH=/root/.local/bin:$PATH
harbor run -p tasks/bayes -a opencode -m modal/gemma-4-26b-a4b-it \
  --base-url https://playerplanet-3-sigma-submission--bayesenv-llm-serve.us-east.modal.run/v1 \
  --api-key-name VLLM_API_KEY --api-format openai_chat_completions \
  -k 3 -n 2 -o jobs --job-name e5-opencode-gemma -y -q > logs_e5_gemma.txt 2>&1
VLLM_API_KEY=$VERDA_VLLM_API_KEY harbor run -p tasks/bayes -a opencode -m verda/nemotron-3.5-super-vl \
  --base-url http://95.133.254.110:8000/v1 --api-key-name VLLM_API_KEY --api-format openai_chat_completions \
  -k 1 -n 2 -o jobs --job-name e5-opencode-nemotron -y -q > logs_e5_nemotron.txt 2>&1
echo E5_DONE > e5.done
