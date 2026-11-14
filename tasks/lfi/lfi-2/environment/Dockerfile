# The agent's container (`main`). Harbor installs the agent on top.
# Python + numpy/scipy, and the lab's exact stochastic simulator at /app/lfisim.py.
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl python3 python3-numpy python3-scipy \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY lfisim.py /app/lfisim.py
