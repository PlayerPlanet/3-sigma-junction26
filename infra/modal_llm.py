"""Always-on OpenAI-compatible LLM server on Modal (vLLM) for agent rollouts.

    modal deploy --env 3-sigma-submission infra/modal_llm.py

Serves Gemma 4 26B-A4B (open weights, 4B active params -> high rollout throughput) on one
RTX PRO 6000 (96 GB). `min_containers=1` keeps it warm: it is the steady, linear part of
the Modal credit burn and the workhorse for thousands of environment rollouts.
Requests need `Authorization: Bearer $VLLM_API_KEY` (Modal secret `bayesenv-vllm`).
"""

import subprocess

import modal

MODEL = "google/gemma-4-26B-A4B-it"
SERVED_NAME = "gemma-4-26b-a4b-it"
PORT = 8000

# CUDA *devel* base: FlashInfer JIT-compiles kernels for Blackwell (sm_120) at startup and
# needs nvcc; the slim image fails with "Could not find nvcc".
image = (
    modal.Image.from_registry("nvidia/cuda:12.9.1-devel-ubuntu24.04", add_python="3.12")
    .entrypoint([])
    .uv_pip_install("vllm==0.33.0", "huggingface_hub[hf_transfer]")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "CUDA_HOME": "/usr/local/cuda"})
)
hf_cache = modal.Volume.from_name("bayesenv-hf-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("bayesenv-vllm-cache", create_if_missing=True)

app = modal.App("bayesenv-llm", image=image)


@app.function(
    gpu="RTX-PRO-6000",
    min_containers=1,
    max_containers=1,
    timeout=24 * 60 * 60,
    scaledown_window=15 * 60,
    secrets=[modal.Secret.from_name("bayesenv-vllm")],
    volumes={"/root/.cache/huggingface": hf_cache, "/root/.cache/vllm": vllm_cache},
)
@modal.concurrent(max_inputs=128)
@modal.web_server(port=PORT, startup_timeout=30 * 60)
def serve() -> None:
    cmd = [
        "vllm", "serve", MODEL,
        "--served-model-name", SERVED_NAME,
        "--host", "0.0.0.0", "--port", str(PORT),
        "--api-key", '"$VLLM_API_KEY"',  # expanded by the shell from the Modal secret
        "--max-model-len", "32768",
        "--gpu-memory-utilization", "0.92",
        "--max-num-seqs", "128",
        "--enable-prefix-caching",
    ]
    subprocess.Popen(" ".join(cmd), shell=True)
