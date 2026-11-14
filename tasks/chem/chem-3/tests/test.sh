#!/bin/bash
# Verifier: the score comes only from the environment's own state via the protected /grade
# endpoint, never from files the agent wrote. Fails closed.
set -u
mkdir -p /logs/verifier
TOKEN="$(cat /tests/grader_token)"
if curl -sf --max-time 120 -H "Authorization: Bearer ${TOKEN}" \
        http://mcp-server:8001/grade -o /logs/verifier/reward.json; then
    :
else
    echo "grader unreachable" >&2
    echo '{"reward": 0.0}' > /logs/verifier/reward.json
fi
cat /logs/verifier/reward.json
