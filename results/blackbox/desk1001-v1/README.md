# Black-box credit desk 1001 (v1): first frontier results

Task: `credit-blackbox-1001` (v1). 16 loan applicants. The agent buys $20 banded checks and approves or declines each applicant.
- **Stated in the task:** segments, PDs, payoffs, band cut-offs, priors, and that scores are a segment location plus symmetric noise.
- **Hidden:** the noise family, the scale and the locations. The agent can learn them with `simulate(segment, check, n<=50)` at $2 per draw.

**Grading:**
- V_hat = (true-model DP value at the start) − (expected value each decision gave up versus the best action) − sandbox spend.
- reward = clip(V_hat / V_ref, 0, 1). V_nodata = 0, V_ref = 725.9 (the calibrate-then-DP reference), and the true-model DP is worth 1173.

Raw grader output for each trial is in the `*.json` files next to this README. They include the true model, which is never visible to the agent.

| Agent (harness) | Reward | V_hat | Sandbox draws (spend) | Decision value before sandbox spend | Checks per applicant | Approved |
|---|---|---|---|---|---|---|
| Claude Opus 5.5 (Claude Code) | **0.057** | 41 | 557 ($1,114) | 1,155 (98% of true DP) | 2.25 | 5/16 |
| Codex gpt-5.6-terra, trial 1 | **0** | −1,503 | 1,000 ($2,000) | 497 | 1.31 | 2/16 |
| Codex gpt-5.6-terra, trial 2 | **0** | −2,282 | 900 ($1,800) | −482 | 8.00 | 4/16 |
| Codex gpt-5.6-terra, trial 3 | **0** | −1,495 | 1,000 ($2,000) | 505 | 1.94 | 4/16 |
| Reference (calibrate-then-DP, 12 draws/cell, bootstrap) | ≈0.85 mean | 619 ± 99 over 200 datasets | ≈216 ($432) | | | |

The OpenCode + gemini-4-argon and gemini-4-carbon trials (3 each) are still running. A first Argon batch crashed because of our bug: the MCP server name `3-sigma/credit-blackbox-1001` made Gemini reject the tool names. That batch is excluded, the name is now fixed to `credit-desk`, and the trials have been rerun.

## Reading

- **Opus decided almost perfectly but over-paid for information.** Its decisions are worth 98% of the true-model DP, yet it spent $1,114 on calibration against a total available gain of $1,173. Its own summary: "The sandbox calibration took most of the money, and with only five approvals the information barely paid for itself." The failure is in the value of *calibration* information (dual control), not in inference.
- **Terra bought up to the 1,000-draw cap every time**, so all three runs had negative net value.
- **Caveat (this is why v2 exists):** in v1 the gap comes mostly from over-calibration. On 3 of 7 screened desks, a reasonable guess with no sandbox use nearly matches the reference, and the reference's own reward is noisy (0 in about 1 run out of 6 before the fix).

## Screening study: 200 datasets per desk, expected episode profit in $

| desk | true DP | reference mean ± SD | guess (no sandbox) | naive Gaussian | informed MLE | one-step | over-calibration |
|---|---|---|---|---|---|---|---|
| 1001 | 1173 | 619 ± 99 | 489 | 149 | 716 | −114 | −830 |
| 1007 | 1765 | 1286 ± 86 | 1241 | 879 | 1281 | 600 | −225 |
| 1012 | 1968 | 1481 ± 41 | 136 | 1211 | 1371 | 756 | −26 |
| 1014 | 1444 | 955 ± 67 | 889 | 783 | 1008 | 149 | −551 |
| 1017 | 1690 | 1091 ± 128 | −1157 | 1212 | 1157 | 48 | −329 |
| 1019 | 1627 | 1084 ± 103 | 1020 | 447 | 1124 | 218 | −374 |
| 1020 | 1480 | 944 ± 99 | 419 | 381 | 1036 | 65 | −523 |

The baselines in this study used 8 draws per cell and the reference used 12.

## v2 (in progress)

- **Economics:** random per-check location offsets (±50) plus jitter, so guessing the levels fails; $1 per draw; 20 applicants.
- **Reproducibility:** a fixed reference sandbox seed, and E[V_ref] computed from at least 200 datasets.
- **Verifier hardening:** fixed PATH, absolute binaries, agent processes killed before grading, and the verifier fails closed if a binary was altered.
- **Instruction:** states exactly what the grader computes.
- **Desk selection:** keep only desks where the reference's reward SD is at most 0.15 and the simple baselines are clearly below it.
