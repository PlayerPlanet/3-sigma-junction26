# credit_blackbox: v1 generator for the black-box credit desk

This is the code that rendered `tasks/credit-blackbox/credit-blackbox-1001`, the task behind the results in `results/blackbox/desk1001-v1/`. It is a snapshot of v1 as run on 2026-11-15. v2, with new economics and a hardened verifier, is in progress.

- **`make_tasks.py <desks> [R]`** renders `credit-blackbox-<desk>` tasks from `template/`. For each desk it:
  - picks 16 applicants whose true-model DP gain is at least $20;
  - computes V_REF as the expected value of the fair reference (calibrate from the sandbox, then exact DP), averaged over R sandbox datasets;
  - writes a fresh grader token.
- **`template/`** is the Harbor task:
  - `environment/mcp-server/`: `server.py` (MCP tools: `get_rules`, `simulate`, `run_check`, `decide`, `status`, plus a `/grade` endpoint that needs the token) and `bblab.py` (the desk state and the grader). The hidden generator is in `bbsecret.py`, `credit_core.py` holds the exact Bayes/DP core, and `bbpub.py` and `fitlib.py` are the estimators.
  - `solution/`: the reference policy (`refpolicy.py`) and the oracle.
  - `tests/test.sh`: asks the MCP server for the grade and writes `/logs/verifier/reward.txt`.
- **`robust.py`, `sim_lab.py`, `econ3.py`, `test_blackbox.py`**: the reference-stability study, a lab simulator for the baselines, the economics sweep and the unit tests.
- **`build_meta*.json`**: per-desk applicant seeds, V_REF and the baseline values recorded at render time.

## Known v1 issues

These are fixed in v2 and listed in `results/blackbox/desk1001-v1/README.md`.

- **Broken MCP server name.** The renderer writes the MCP server name as `3-sigma/credit-blackbox-<desk>`, which makes Gemini/OpenCode reject the tool names. The tracked `tasks/credit-blackbox/credit-blackbox-1001/task.toml` has it changed by hand to `credit-desk`, which matches `instruction.md`. The Opus and Codex trials ran with the original name, and the Argon and Carbon trials with the fixed one.
- **Forgeable verifier.** `test.sh` runs in the agent's container and uses `curl`/`python3` from PATH.
- **Noisy reference.** The sandbox salt changes every run, so the reference itself sometimes scores 0, and V_REF was averaged over only R = 8 datasets.
- **Instruction does not match the grader.** The grader scores the DP advantage minus sandbox spend.
- **`template/` is slightly newer than the rendered task.** `bbpub.py` gained `fit_empirical_boot` after rendering.

The repo is private, so the rendered task's `tests/grader_token` and the hidden generator in `bbsecret.py` are tracked here. Regenerate the tokens before publishing the repo.
