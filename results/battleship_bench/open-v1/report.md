# Battleship benchmark: open-v1

Boards: seeds 0:14 with salt `battleship-open-v1-750` (every model plays the same boards). Commit `9c16bb18b7` (with uncommitted changes), rules `ec3eb23b1355`, protocol `818863207430`, engine `949b949eff05`, versions None.

* gemini-4-hydrogen: provider `gemini`, temperature 1.0, max tokens 16384, one action per reply, run 2026-11-15T02:51:13 to 2026-11-15T03:04:19

| Model | Boards | Score (unclipped) [95% CI] | Gap to reference [95% CI] | Harbor | Rule acc. | Rule part | Cell part | Design | Inference | Parsed | Invalid/game | Actions (scans) | Leak p<.05 | Requests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline:closed_world_bayes | 14 | +0.185 [-0.184, +0.481] | -0.309 [-0.783, +0.009] | 0.379 | 0.36 | -0.340 | +0.710 | +0.494 | -0.309 | 1.00 | 0.0 | 12.8 (7.2) | 0.00 | 0 |
| baseline:do_nothing | 14 | +0.000 [+0.000, +0.000] | -0.494 [-0.625, -0.355] | 0.000 | 0.14 | +0.000 | +0.000 | +0.000 | -0.000 | 1.00 | 0.0 | 0.0 (0.0) | 0.07 | 0 |
| baseline:naive_human | 14 | -0.221 [-0.853, +0.312] | -0.715 [-1.354, -0.156] | 0.335 | 0.36 | -0.484 | +0.042 | +0.360 | -0.581 | 1.00 | 0.0 | 20.0 (0.0) | 0.07 | 0 |
| baseline:noise_ignoring_coder | 14 | -0.112 [-0.715, +0.389] | -0.606 [-1.119, -0.198] | 0.366 | 0.43 | -0.215 | -0.008 | +0.494 | -0.606 | 1.00 | 0.0 | 12.8 (7.2) | 0.00 | 0 |
| baseline:random_design | 14 | +0.273 [+0.133, +0.407] | -0.221 [-0.362, -0.057] | 0.304 | 0.36 | +0.171 | +0.375 | +0.273 | +0.000 | 1.00 | 0.0 | 15.4 (4.6) | 0.07 | 0 |
| baseline:reference | 14 | +0.494 [+0.355, +0.625] | +0.000 [+0.000, +0.000] | 0.501 | 0.50 | +0.272 | +0.717 | +0.494 | +0.000 | 1.00 | 0.0 | 12.8 (7.2) | 0.07 | 0 |
| gemini-4-hydrogen | 2 | +0.388 [+0.091, +0.685] | -0.005 [-0.346, +0.336] | 0.388 | 0.50 | +0.140 | +0.636 | +0.302 | +0.086 | 1.00 | 0.5 | 10.5 (9.5) | 0.50 | 27 |

Score: proper log score on the rule and every cell (prior 0, truth about 1), unclipped; it is the mean of the rule part (which rule placed the ships) and the cell part (where the ships are). Design: score of the exact posterior given the model's own actions. Inference: score minus design (0 for exact Bayesian updating). Harbor: per-game clip to [0, 1]. Leak p<.05: share of games the exact leak test flags (about 0.05 expected for honest play).
