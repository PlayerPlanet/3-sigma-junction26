#!/bin/bash
# Verifier: the score comes only from the server's own state via the protected /grade endpoint. Fails closed.
#   /logs/verifier/reward.txt    clip((V_hat - V_nodata) / (E[V_ref] - V_nodata), 0, 1)   (see README / instruction)
#   /logs/verifier/details.json  per-applicant breakdown (steps, true-model posteriors, DP Q-values, advantages)
# Hardening: fixed PATH and absolute binaries, isolated python, stray agent processes killed first, and the
# curl / python packages are verified against the dpkg database (any modification -> reward 0).
export PATH=/usr/bin:/bin
unset LD_PRELOAD LD_LIBRARY_PATH PYTHONPATH PYTHONHOME PYTHONSTARTUP
set -u
/bin/mkdir -p /logs/verifier
for pat in claude opencode codex node gemini aider goose; do /usr/bin/pkill -9 -f "$pat" 2>/dev/null; done
fail() { echo "$1" >&2; echo '{"score": 0.0, "reward": 0.0, "error": "'"$1"'"}' > /logs/verifier/details.json; echo 0 > /logs/verifier/reward.txt; exit 0; }
if [ -x /usr/bin/dpkg ]; then
    PKGS=$(/usr/bin/dpkg -S /usr/bin/curl /usr/bin/python3 "$(/usr/bin/readlink -f /usr/bin/python3)" 2>/dev/null | /usr/bin/cut -d: -f1 | /usr/bin/sort -u)
    MOD=$(/usr/bin/dpkg -V $PKGS 2>/dev/null | /usr/bin/grep -E " /(usr/)?(s?bin|lib)/")   # changed executables/libraries only (slim images drop docs)
    [ -n "$MOD" ] && fail "verifier binaries modified: $MOD"
fi
TOKEN="$(/bin/cat /tests/grader_token)"
if ! /usr/bin/curl -sf --max-time 500 -H "Authorization: Bearer ${TOKEN}" \
        http://mcp-server:8001/grade -o /logs/verifier/details.json; then
    fail "grader unreachable"
fi
/usr/bin/python3 -I - <<'PY' || echo 0 > /logs/verifier/reward.txt
import json, math
try:
    s = float(json.load(open("/logs/verifier/details.json"))["score"])
    s = min(1.0, max(0.0, s)) if math.isfinite(s) else 0.0
except Exception:
    s = 0.0
open("/logs/verifier/reward.txt", "w").write(f"{s:.6f}\n")
PY
/bin/cat /logs/verifier/reward.txt
