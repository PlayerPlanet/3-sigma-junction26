#!/bin/bash
# Verda CPU instance: runs Harbor evaluations of the Bayesian task dataset (Docker, multi-
# container MCP tasks) against remote model endpoints (Gemma on Modal, Nemotron on Verda,
# frontier APIs). Keeps evaluation load off laptops; the path to always-on hosted evals.
exec > /var/log/harbor-runner-startup.log 2>&1
set -x
export HOME=/root
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done
curl -LsSf https://astral.sh/uv/0.9.7/install.sh | sh
/root/.local/bin/uv tool install harbor==0.25.0
touch /root/READY
