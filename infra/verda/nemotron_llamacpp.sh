#!/bin/bash
# Fallback serving for Nemotron 3.5 Super VL on one RTX PRO 6000 (the path NVIDIA's model card
# recommends for RTX Pro 6000): llama.cpp + the official Q4_0 GGUF. vLLM's NVFP4 kernels produced
# degenerate output (a repeated control token) on this CC Blackwell VM, so we avoid FP4 entirely.
# Reuses the API key from the existing vLLM unit file. Run as root on the VM.
set -euxo pipefail
exec > /var/log/nemotron-llamacpp.log 2>&1
KEY=$(grep -oP '(?<=--api-key )\S+' /etc/systemd/system/nemotron.service)
systemctl disable --now nemotron || true
apt-get update && apt-get install -y build-essential cmake git libcurl4-openssl-dev
export CUDA_HOME=$(ls -d /usr/local/cuda* | head -1) PATH=$(ls -d /usr/local/cuda*/bin | head -1):$PATH
[ -d /opt/llama.cpp ] || git clone --depth 1 https://github.com/ggml-org/llama.cpp /opt/llama.cpp
cmake -S /opt/llama.cpp -B /opt/llama.cpp/build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=120 -DCMAKE_BUILD_TYPE=Release
cmake --build /opt/llama.cpp/build -j 16 --target llama-server
HF_HUB_ENABLE_HF_TRANSFER=1 /opt/vllm/bin/huggingface-cli download ggml-org/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-GGUF \
  NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-Q4_0.gguf --local-dir /root/gguf
cat > /etc/systemd/system/nemotron-llama.service <<UNIT
[Unit]
Description=llama.cpp Nemotron 3.5 Super VL (Q4_0)
After=network-online.target
[Service]
ExecStartPre=/usr/bin/nvidia-smi conf-compute -srs 1
ExecStart=/opt/llama.cpp/build/bin/llama-server -m /root/gguf/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-Q4_0.gguf -a nemotron-3.5-super-vl --host 0.0.0.0 --port 8000 --api-key ${KEY} -ngl 999 -c 131072 --parallel 8 --jinja --reasoning-format deepseek
Restart=always
RestartSec=20
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now nemotron-llama
echo DONE
