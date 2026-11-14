# Battleship benchmark: dry-check

Boards: seeds 0:10 with salt `battleship-llm-v1` (every model plays the same boards). Commit `f003c03106` (with uncommitted changes), rules `a244e8bffe81`, protocol `b3b03248413b`, engine `1a9adbf2f842`.

* dry-reference-player: provider `dry`, temperature 0.0, max tokens 4096, several actions per reply allowed, run 2026-11-14T21:26:33 to 2026-11-14T21:26:37

| Model | Boards | Score (unclipped) [95% CI] | Gap to reference [95% CI] | Harbor | Rule acc. | Design | Inference | Parsed | Invalid/game | Actions (scans) | Leak p<.05 | Requests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline:do_nothing | 10 | +0.000 [+0.000, +0.000] | -0.534 [-0.639, -0.420] | 0.000 | 0.20 | +0.000 | -0.000 | 1.00 | 0.0 | 0.0 (0.0) | 0.00 | 0 |
| baseline:naive_human | 10 | -0.588 [-1.441, +0.188] | -1.122 [-2.052, -0.289] | 0.220 | 0.20 | +0.365 | -0.953 | 1.00 | 0.0 | 20.0 (0.0) | 0.00 | 0 |
| baseline:noise_ignoring_coder | 10 | +0.332 [+0.099, +0.528] | -0.201 [-0.351, -0.076] | 0.384 | 0.30 | +0.534 | -0.201 | 1.00 | 0.0 | 12.7 (7.3) | 0.00 | 0 |
| baseline:random_design | 10 | +0.183 [+0.006, +0.333] | -0.351 [-0.499, -0.226] | 0.242 | 0.30 | +0.183 | +0.000 | 1.00 | 0.0 | 16.2 (3.8) | 0.00 | 0 |
| baseline:reference | 10 | +0.534 [+0.420, +0.639] | +0.000 [+0.000, +0.000] | 0.534 | 0.40 | +0.534 | +0.000 | 1.00 | 0.0 | 12.7 (7.3) | 0.00 | 0 |
| dry-reference-player | 10 | +0.534 [+0.420, +0.639] | -0.000 [-0.000, +0.000] | 0.534 | 0.40 | +0.534 | -0.000 | 1.00 | 0.0 | 12.7 (7.3) | 0.00 | 137 |

Score: proper log score on the rule and every cell (prior 0, truth about 1), unclipped. Design: score of the exact posterior given the model's own actions. Inference: score minus design (0 for exact Bayesian updating). Harbor: per-game clip to [0, 1]. Leak p<.05: share of games the exact leak test flags (about 0.05 expected for honest play).
