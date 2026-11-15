"""Endpoint smoke test: python smoke.py <base-url> [partners]"""
import json, sys, time, urllib.request
sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
import prompts as P
BASE = sys.argv[1].rstrip("/")
parts = (sys.argv[2] if len(sys.argv) > 2 else "gemini,nemotron,gemma").split(",")
snaps = json.load(open(__file__.replace("smoke.py", "_vol/snaps.json"), encoding="utf-8"))
# a state where running is possible and the Gemma rule hands the choice to Gemma
state = next(x["s"] for x in snaps if x["s"]["canRun"] and P.gemma_rule(P.clean_state(x["s"]))["action"] == "run" and any(t["history"] for t in x["s"]["tickets"]))
def call(path, body=None):
    t0 = time.time()
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={"content-type": "application/json"}, method="GET" if body is None else "POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    return raw, round(time.time() - t0, 2)
raw, s = call("/"); print("GET /", len(raw), "bytes", s, "s")
raw, s = call("/api/status"); print("status", raw.decode(), s)
for p in parts:
    for k in range(int(sys.argv[3]) if len(sys.argv) > 3 else 1):
        raw, s = call(f"/api/{p}", {"game": f"smoke-{time.time():.0f}", "state": state})
        print(p, s, "s", raw.decode()[:400])
        time.sleep(2.2)
