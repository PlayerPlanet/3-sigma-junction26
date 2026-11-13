#!/bin/bash
# Verifier: copied to /tests and run in the agent's container after the agent finishes.
# The score comes only from the environment's own state (via the protected /grade
# endpoint), never from files the agent wrote, so it can't be faked from inside `main`.
set -u
mkdir -p /logs/verifier

TOKEN="$(cat /tests/grader_token)"
if curl -sf --max-time 20 -H "Authorization: Bearer ${TOKEN}" \
        http://mcp-server:8001/grade -o /logs/verifier/grade.json; then
    cp /logs/verifier/grade.json /logs/verifier/reward.json
else
    # Fail closed: an unreachable grader is a zero, never a pass.
    echo "grader unreachable" >&2
    echo '{"reward": 0.0}' > /logs/verifier/reward.json
fi
cat /logs/verifier/reward.json
