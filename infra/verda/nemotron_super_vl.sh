#!/bin/bash
# Verda GPU VM startup script: serve NVIDIA Nemotron 3.5 Super VL (NVFP4, 120B-A12B) with vLLM
# on one Blackwell RTX PRO 6000 (96 GB, confidential-computing image: no Docker, so a uv venv
# + systemd). OpenAI-compatible on :8000, API-key protected.
# __API_KEY__ is substituted at upload time; never commit a real key.
exec > /var/log/nemotron-startup.log 2>&1
set -x
export HOME=/root
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh
/root/.local/bin/uv venv /opt/vllm --python 3.12
/root/.local/bin/uv pip install --python /opt/vllm/bin/python "vllm==0.32.0" "huggingface_hub[hf_transfer]"
# CC-mode GPUs refuse CUDA work until marked ready (normally after attestation with
# NVIDIA nvtrust; skipped for the hackathon demo, documented as a gap).
nvidia-smi conf-compute -srs 1
export CUDA_HOME=$(ls -d /usr/local/cuda* | head -1)
cat > /etc/systemd/system/nemotron.service <<UNIT
[Unit]
Description=vLLM Nemotron 3.5 Super VL
After=network-online.target
[Service]
Environment=HF_HUB_ENABLE_HF_TRANSFER=1
Environment=CUDA_HOME=${CUDA_HOME}
Environment=PATH=${CUDA_HOME}/bin:/opt/vllm/bin:/usr/bin:/bin
ExecStartPre=/usr/bin/nvidia-smi conf-compute -srs 1
ExecStart=/opt/vllm/bin/vllm serve nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4 --served-model-name nemotron-3.5-super-vl --trust-remote-code --host 0.0.0.0 --port 8000 --api-key __API_KEY__ --max-model-len 32768 --max-num-seqs 32 --gpu-memory-utilization 0.92 --mamba-ssm-cache-dtype float16 --block-size 64 --reasoning-parser nemotron_v3
Restart=always
RestartSec=30
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now nemotron.service
