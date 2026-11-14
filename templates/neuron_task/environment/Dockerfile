# The agent's container (`main`). Harbor installs the agent (e.g. OpenCode) on top.
# /app/nbsim is the forward model only (NeuronBench's simulator files without the world
# registry): it contains no hidden cell, no world list and no scoring targets.
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl python3 python3-numpy python3-scipy \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY nbsim /app/nbsim
