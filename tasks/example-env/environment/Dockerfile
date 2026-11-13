# The agent's container (`main`). Harbor installs the agent (e.g. OpenCode) on top.
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
