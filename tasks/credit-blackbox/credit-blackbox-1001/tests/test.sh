#!/bin/bash
# Verifier: the score comes only from the server's own state via the protected /grade endpoint. Fails closed.
#   /logs/verifier/reward.txt    mean over applicants of clip((V_hat - V_nodata) / (V_dp - V_nodata), 0, 1)
#   /logs/verifier/details.json  per-applicant breakdown (steps, posteriors, DP Q-values, realised payoff)
set -u
mkdir -p /logs/verifier
TOKEN="$(cat /tests/grader_token)"
if ! curl -sf --max-time 500 -H "Authorization: Bearer ${TOKEN}" \
        http://mcp-server:8001/grade -o /logs/verifier/details.json; then
    echo "grader unreachable" >&2
    echo '{"score": 0.0, "reward": 0.0}' > /logs/verifier/details.json
fi
python3 - <<'PY' || echo 0 > /logs/verifier/reward.txt
import json, math
try:
    s = float(json.load(open("/logs/verifier/details.json"))["score"])
    s = min(1.0, max(0.0, s)) if math.isfinite(s) else 0.0
except Exception:
    s = 0.0
open("/logs/verifier/reward.txt", "w").write(f"{s:.6f}\n")
PY
cat /logs/verifier/reward.txt
