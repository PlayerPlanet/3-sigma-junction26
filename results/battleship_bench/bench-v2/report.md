# Battleship benchmark: bench-v2

Boards: seeds 0:10 with salt `battleship-llm-v1` (every model plays the same boards). Commit `da873ca2e3` (with uncommitted changes), rules `a244e8bffe81`, protocol `b3b03248413b`, engine `1a9adbf2f842`, versions None.

* gemini-4-hydrogen: provider `gemini`, temperature 1.0, max tokens 16384, one action per reply, run 2026-11-15T01:00:37 to 2026-11-15T01:34:27

| Model | Boards | Score (unclipped) [95% CI] | Gap to reference [95% CI] | Harbor | Rule acc. | Rule part | Cell part | Design | Inference | Parsed | Invalid/game | Actions (scans) | Leak p<.05 | Requests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline:do_nothing | 10 | +0.000 [+0.000, +0.000] | -0.532 [-0.638, -0.419] | 0.000 | 0.20 | +0.000 | +0.000 | +0.000 | +0.000 | 1.00 | 0.0 | 0.0 (0.0) | 0.00 | 0 |
| baseline:naive_human | 10 | -0.588 [-1.441, +0.188] | -1.120 [-2.051, -0.287] | 0.220 | 0.20 | -0.930 | -0.246 | +0.365 | -0.953 | 1.00 | 0.0 | 20.0 (0.0) | 0.00 | 0 |
| baseline:noise_ignoring_coder | 10 | +0.351 [+0.116, +0.538] | -0.181 [-0.334, -0.056] | 0.403 | 0.30 | +0.272 | +0.430 | +0.532 | -0.181 | 1.00 | 0.0 | 12.8 (7.2) | 0.00 | 0 |
| baseline:random_design | 10 | +0.183 [+0.006, +0.333] | -0.349 [-0.498, -0.225] | 0.242 | 0.30 | +0.020 | +0.345 | +0.183 | +0.000 | 1.00 | 0.0 | 16.2 (3.8) | 0.00 | 0 |
| baseline:reference | 10 | +0.532 [+0.419, +0.638] | +0.000 [+0.000, +0.000] | 0.532 | 0.40 | +0.351 | +0.713 | +0.532 | +0.000 | 1.00 | 0.0 | 12.8 (7.2) | 0.00 | 0 |
| gemini-4-hydrogen | 10 | +0.343 [+0.165, +0.521] | -0.189 [-0.310, -0.071] | 0.351 | 0.50 | +0.332 | +0.354 | +0.434 | -0.091 | 1.00 | 0.5 | 9.7 (8.2) | 0.10 | 138 |

Score: proper log score on the rule and every cell (prior 0, truth about 1), unclipped; it is the mean of the rule part (which rule placed the ships) and the cell part (where the ships are). Design: score of the exact posterior given the model's own actions. Inference: score minus design (0 for exact Bayesian updating). Harbor: per-game clip to [0, 1]. Leak p<.05: share of games the exact leak test flags (about 0.05 expected for honest play).
