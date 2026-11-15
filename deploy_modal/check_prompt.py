"""Asserts deploy_modal/bs_prompt.py renders the same prompts as the transfer eval (tasks.BSEpisode).
usage (from the transfer suite folder): python check_prompt.py <transfer pkg dir> <repo>/deploy_modal"""
import sys, numpy as np
pkg, dep = sys.argv[1], sys.argv[2]
sys.path.insert(0, pkg)
import tasks as X
sys.path.insert(0, dep); sys.path.insert(0, pkg + "/bayesenv")
import bs_prompt as P
rng = np.random.default_rng(0); n = 0
for seed in range(6):
    ep = X.BSEpisode(seed, "transfer-bs")
    while ep.prompt() is not None:
        moves = [(int(B_a), int(h["result"])) for h, B_a in ((h, X.B.parse_action(h)[0]) for h in ep.lab.history)]
        mv, spent = P.validate([list(m) for m in moves])
        b = P.belief_of(mv)
        assert P.messages(b, mv, spent) == ep.prompt(), (seed, len(moves)); n += 1
        kind = "random" if seed % 2 else "reference"
        ep.act(X.bs_policy_action(ep, kind, rng))
for t in ["fire 2 3", "scan col 4", "Stop", "hello", "scan row 9"]:
    assert P.bs_parse(t, 5) == X.bs_parse(t, 5)
print("identical prompts:", n)
