# The agent's container (`main`). Harbor installs the agent (e.g. OpenCode) on top.
# Python + numpy/scipy are available so agents can do their own inference if they choose to.
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl python3 python3-numpy python3-scipy nodejs npm \
    && rm -rf /var/lib/apt/lists/*
# Pre-install what Harbor's agent setup installs on every trial (Node 22 via nvm, OpenCode,
# Claude Code). Setup then only re-checks them, instead of downloading them in parallel
# trials and hitting Harbor's 6-minute agent-setup timeout. Built once per board image.
ENV NVM_DIR=/root/.nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash \
    && . "$NVM_DIR/nvm.sh" && nvm install 22 && nvm alias default 22 \
    && npm i -g opencode-ai@latest
RUN curl -fsSL https://downloads.claude.ai/claude-code-releases/bootstrap.sh | bash -s -- || true
WORKDIR /app
