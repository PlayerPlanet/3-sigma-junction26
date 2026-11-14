# rl/ — PLACEHOLDER (do not implement yet)

The RL stack will drive `packages/sim-core` headlessly through the shared action schema.

Today the repo's Harbor environment lives at the root (`tasks/`, `baselines/`, `scripts/eval.sh`,
`tests/test_env_reward.py`) and still runs the placeholder number-guessing game. When the lab sim is
ready, the subfolders here will hold the pieces that connect it to Harbor; see `docs/DECISIONS.md`.
