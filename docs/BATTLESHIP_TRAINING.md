# Battleship: benchmark Gemini, train Gemma, test transfer to the wet lab

The demo claim to test: **a small open model trained with RL on Rulebound Battleship chooses
better experiments in the wet lab than the same model out of the box**, and we can say how it
compares with frontier Gemini models.

Gemini's weights are closed, so we cannot run our own RL on it. Gemini is the frontier
baseline; the RL is done on open Gemma 4 models (the same family), with the team's existing
model-size-curve pipeline (branch `size-curve`) and the lab transfer rows (branch `lab-rows`).

## What gets trained, and why this unit

The training unit is a **design row** (same schema as `datagen.py` and `lab_rows.py`): the full
game in the system prompt, a history of actions and noisy results, and six candidate next
actions. The model answers `<observe>[design]</observe>`; the reward is
`eig[chosen] / max(eig)`, where `eig` is the exact expected information gain about the hidden
(rule, layout) per unit of budget. The reference's choice scores 1.

* The reward is exact and dense: every step has its own exact label, no rollouts of whole games
  are needed, and there is no noise from lucky boards.
* The skill it trains, choosing the most informative affordable experiment given everything
  seen so far, is the same skill the lab rows measure: `lab:wetlab` rows ask which of six wet
  lab runs to do next, scored the same way. Same prompt layout, same answer format, same reward,
  different science.
* It does not train the final belief report (the inference loss). That is a second, separate
  step (see "Next" below).

Battleship rows: `bayesenv/battleship_rows.py`, `scripts/gen_battleship_rows.py`,
`tests/test_battleship_rows.py`. Actions are designs: `[0, row, col]` fires, `[1, 0, i]` scans
row i, `[1, 1, i]` scans column i. Histories come from the reference or from random play,
balanced over depth 0 to 14 (4,000 train rows, 600 held-out; about 6 minutes to generate).

Floors to beat on the Battleship rows: a random candidate scores 0.549. The best action is a
scan in 74% of rows, so the shortcut "pick any scan" already scores about 0.74. A trained model
has to clear 0.74 on Battleship before it has learned more than that shortcut. The shortcut
cannot help on the wet-lab rows, which have no scans, so any transfer there is not explained by
it.

## Measurements

| ID | What | Who | Cost |
|---|---|---|---|
| B1 | full Battleship games, no tools, exact score vs reference on the same boards | Gemini (hosted), optionally Claude, Gemma via vLLM | about 5 to 12 requests per game |
| B2 | full games with a shell, the judged setting (`scripts/eval.sh`, OpenCode) | Gemini through OpenCode | Harbor + Docker |
| B3 | design rows: Battleship held-out + `lab:wetlab` | Gemini (hosted), Gemma base | 1 request per row |
| B4 | train on Battleship rows, evaluate on Battleship held-out + all lab rows | Gemma 4 E4B (+ E2B) arms base / control / grpo (/ sft) | Modal GPU |

**Pre-registered comparison (B4).** On the `lab:wetlab` rows, paired by row:
`grpo minus base` and `grpo minus control`, with bootstrap CIs. The `control` arm gets the same
prompts and steps but is paid 1 for any valid answer, so it absorbs gains that come only from
learning the answer format. Transfer counts only if `grpo minus control` is above 0 with a CI
that excludes 0. Report the other labs (`lab:chem`, `lab:diag`, `lab:dag`) as well, whatever
they show. A null result is still reported.

## Commands

From the repo root, on a branch that has the Battleship work plus `lab-rows` and `size-curve`:

```bash
git switch battleship-env
git merge origin/lab-rows origin/size-curve      # resolve README / CLAUDE.md / render_tasks.sh if asked
git apply docs/modal_curve_rows_namespace.patch   # lets Battleship rows live beside the toy rows
M="uv run --no-project --with modal modal run --env 3-sigma-submission"
PY="uv run --no-project --with numpy --with scipy --with pyyaml --with openai python"   # hosted-model runs
```

**1. Rows** (about 7 minutes, numpy only; `data/` is not tracked):
```bash
python scripts/gen_battleship_rows.py --train 4000 --heldout 600 --out data/battleship
```

**2. Lab transfer rows** (see `docs/LAB_ROWS.md`), then a wet-lab-only file for hosted models:
```bash
$M experiments/lab_rows_modal.py::gen --rows 400 --wetlab-rows 200 --out data/lab_transfer \
    --sample-out data/lab_transfer/sample_rows.jsonl
python -c "import json;[print(l,end='') for l in open('data/lab_transfer/rows.jsonl') if json.loads(l)['spec']=='lab:wetlab']" \
    > data/lab_transfer/wetlab_rows.jsonl
uv run --no-project --with modal modal volume put --env 3-sigma-submission bayesenv-curve \
    data/lab_transfer/rows.jsonl lab_rows.jsonl
```

**3. Train and evaluate Gemma** (rows go to `rows_battleship/` on the Volume, runs to
`runs/battleship/`, so nothing of the toy experiments is overwritten):
```bash
export CURVE_ROWS=rows_battleship
$M train/modal_curve.py::upload --rows data/battleship/rows.jsonl
$M train/modal_curve.py::one --model E4B --arm grpo --steps 10 --n-eval 50 --tag bs-smoke \
    --extra-eval lab_transfer=lab_rows.jsonl                                   # smoke test first
$M --detach train/modal_curve.py::fanout --models E4B,E2B --arms base,control,grpo \
    --tag battleship --extra-eval lab_transfer=lab_rows.jsonl
uv run --no-project --with modal modal volume get --env 3-sigma-submission bayesenv-curve \
    runs/battleship results/curve/
python scripts/analyze_curve.py --runs results/curve/battleship
```
If the larger models write reasoning and run out of the 128-token answer cap, add
`--prefill "<observe>["` (as in the size-curve runs).

**4. Gemini on the same rows** (B3). The provider cap in `bayesenv/llm_agent.py` is 300 Gemini
requests in total, counted in `results/request_budget.json`:
```bash
$PY scripts/eval_design_rows.py --provider gemini --model <gemini-model-id> \
    --rows data/battleship/rows.jsonl --n 100 \
    --extra-eval lab_transfer=data/lab_transfer/wetlab_rows.jsonl --out results/curve/battleship
```
That is 100 Battleship rows + 200 wet-lab rows = 300 requests; use `--n 60` and the first 100
wet-lab rows (`head -100`) to leave room for B1.

**5. Gemini full games** (B1); every model plays the same boards, replays appear in the UI:
```bash
$PY experiments/battleship_llm.py --provider gemini --model <gemini-model-id> --seeds 0:10
python scripts/battleship_ui.py      # Replay tab: results/battleship_llm/<model>/seed-<n>.json
```
A reply may contain several `<observe>` tags (they run in order), which keeps a game at about
5 to 12 requests; `--one-tag` forces one action per reply (about 20).

**Suggested Gemini budget (300 requests):** 10 full games (about 100) + 60 Battleship rows +
100 wet-lab rows + margin.

## The demo chart

Mean `design_reward` with 95% CIs, two panels:

1. **Battleship held-out rows**: chance, Gemma E4B base, control, GRPO, Gemini, reference (1.0).
2. **Wet lab rows (never trained on)**: the same bars.

Then one line from B1: Gemini's full-game score against the reference on the same boards, with a
replay of one game in the UI.

## Checked here vs not yet run

Checked: rows are deterministic, never contain the hidden board, the reference's answer scores 1,
every label is recomputed exactly from the printed history in the tests, and the full-game
runner reproduces the reference's score when driven by a scripted reference player (0.366 vs
0.366 on board 0). The patch is a 5-line change to `train/modal_curve.py`.

Not run: no Gemini or Gemma call has been made on Battleship yet, so every model number above is
still to be measured. The GRPO recipe is the size-curve one (LoRA r=32, 8 generations, lr 5e-6,
300 steps); whether it transfers from Battleship to the wet lab is exactly the open question.

## Next

* Belief-report rows: the final step (report rule and cell probabilities) as a GRPO prompt with
  reward = the exact expected score under the posterior of the printed history. That reward is
  proper and has no outcome noise, because the posterior is exact; it would train the inference
  skill, which is where frontier agents lose most on the hyperbolic task.
* Full-game evaluation of the trained adapter (serve the adapter with vLLM and run B1 on it).
