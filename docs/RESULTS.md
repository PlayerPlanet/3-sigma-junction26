# Bayes for better RL environments: experiment report

**Team 3-Sigma · Junction 2026.** Branch `bayes-experiments`. All numbers are reproducible from
the commands below; raw per-episode data is in `results/`.

## Claim

For agent environments where the data-generating model is known (experimental design, model
discovery, scientific simulators), grading with the **exact Bayesian posterior** makes a better RL
environment than grading against sampled outcomes (BoxingGym-style), on every axis of the
AfterQuery rubric:

| Rubric axis | What Bayesian grading adds | Evidence |
|---|---|---|
| The gap (30) | Lower-variance reward, so the frontier-vs-reference gap is reproducible in a few seeds | E1 |
| Meaningful difficulty (30) | Each agent's loss splits exactly into *bad experiments* vs *bad belief updating* | E3 |
| Reward integrity (25) | Do-nothing = 0 by construction; miscalibration is penalised; a posterior predictive check flags agents that know more than their experiments could tell them | E1, E2 |
| Craft (15) | Proper scoring rule against the true distribution, no outcome-sampling noise to explain away | E1 |

## Setup

* **Environments** (`bayesenv/envs.py`), ported from BoxingGym (MIT) with a per-episode RNG:
  *hyperbolic discounting* (binary choices, 2 parameters) and *location finding* (continuous
  signal, 2-D source). 10 experiments per episode, then predictive distributions for 30 hidden
  evaluation designs revealed only after the experiment phase.
* **Graders** (`bayesenv/task.py`):
  * *naive* (BoxingGym-style): point predictions vs one sampled outcome per design (accuracy /
    relative MSE). Also reported baseline-subtracted per seed (minus the do-nothing score on the
    same outcome draw), the fair analogue of BoxingGym's standardised error.
  * *Bayesian*: expected log score of the submitted predictive under the **true** parameters,
    normalised so the prior predictive scores 0 and knowing the parameters scores 1, clipped to [0, 1].
  * *Posterior predictive ceiling check*: T = agent score minus the exact posterior predictive's
    score given the agent's **own** data. Under "the agent only used its experiments", the true
    parameters are a posterior draw, so T(θ*) should look like T(θ̃), θ̃ ~ posterior. p-value =
    P(T(θ̃) ≥ T(θ*)).
* **Policies** (`bayesenv/policies.py`): Bayesian reference (EIG-greedy design + exact
  posterior), random design, stop-early (1 experiment), do-nothing (prior predictive), constant
  hedge, overconfident (reference experiments, sharpened predictions), nearest-neighbour
  (overfitting), and two **cheaters** that read θ* through a side channel (full, and blended 30%
  into an honest prediction).

## E1: grader reliability (7,200 episodes, 400 seeds × 9 policies × 2 envs, Modal CPU fan-out)

Mean reward (naive raw / Bayesian):

| Policy | Hyperbolic naive | Hyperbolic **Bayes** | Location naive | Location **Bayes** |
|---|---|---|---|---|
| Bayesian reference | 0.981 | **0.949** | 0.695 | **0.990** |
| random design | 0.954 | 0.539 | 0.549 | 0.753 |
| stop early (1 exp.) | 0.947 | 0.467 | 0.125 | 0.216 |
| **do nothing** | **0.919** | **0.000** | 0.000 | 0.000 |
| **overconfident** | **0.981 (= reference)** | 0.520 | **0.695 (= reference)** | **0.000** |
| constant hedge | 0.678 | 0.002 | −1.468 | 0.004 |
| nearest neighbour | 0.767 | 0.009 | −0.465 | 0.015 |

Seeds needed to show reference > policy (paired, α=0.05, power 0.8):

| Comparison | Hyperbolic naive (baseline-subtracted) | Hyperbolic **Bayes** | Location naive | Location **Bayes** |
|---|---|---|---|---|
| reference > random design | 18 | **4** | 14 | **5** |
| reference > stop early | 13 | **3** | 2 | **1** |
| reference > overconfident | **never (tie)** | **4** | **never (tie)** | **1** |
| reference > nearest neighbour | 2 | 1 | 6 | 1 |

Findings:
1. **Doing nothing scores 0.92 under naive accuracy** on hyperbolic discounting (the reference
   scores 0.98), a direct rubric violation ("doing nothing earns little or no credit"). Bayesian
   grading gives it exactly 0 by construction.
2. **Miscalibration is invisible to the naive grader**: the overconfident policy ties the
   reference, so no number of seeds separates them; Bayesian grading separates them in 1–4 seeds.
3. With baseline subtraction the naive grader can be repaired for (1), but its gap is then small
   and noisy: **3–4× more seeds** for the same statistical power. Judges rerun 3 agent runs.
4. Under Bayesian grading nothing ties or beats the reference; under naive grading, overconfident
   ties it in both environments.

Figures: `results/fig_e1_forest_{hyperbolic,location}.png`.

## E2: catching reward hacking through side channels (posterior predictive check)

Flag rate at p < 0.05 (honest policies should be ≈ 5%):

| Policy | Hyperbolic | Location (80k-particle grader) |
|---|---|---|
| reference | 6.0% | 5.8% |
| random design | 4.5% | 6.2% |
| constant hedge | 4.0% | 4.8% |
| nearest neighbour | 4.5% | 5.0% |
| **cheater, 30% leak** | 19.0% | **87.8%** |
| **cheater, full leak** | 19.5% | **88.0%** |

Combining 50 episodes (Fisher), both cheaters are detected with p ≈ 0 in both environments,
while honest policies' combined p-values are uniform (`results/fig_e2_ppc_ecdf_*.png`: honest
ECDF inside the simultaneous 95% uniform band, cheaters far outside).

Notes: binary outcomes carry little information, so single-episode power on hyperbolic is low
(19%); the check is meant to run over a judge's batch of episodes. A first run with a 20k-particle
grader over-flagged the reference on location (10.2%): the grader's own Monte Carlo error must be
well below any agent's, fixed with 80k particles (5.8%).

The check needs no knowledge of *how* the agent cheats: it only asks whether the agent's
predictions are better than its own evidence allows.

## E3: LLM agents: where do they fail?

Same protocol for every model (`bayesenv/llm_agent.py`): 10 experiments as
`<observe>[...]</observe>`, then a JSON list of predictive distributions. Evaluation seeds
0–49 per environment (fewer for the expensive models). Because the grader has the exact
posterior, every agent's loss splits exactly:

* **design loss** = reference score − score of the exact posterior given *the agent's own*
  experiments (did it run informative experiments?)
* **inference loss** = that posterior's score − the agent's own predictions (did it update its
  beliefs correctly on the data it had?)

| Model (host) | n (hyp/loc) | Naive hyp | **Bayes hyp** | **Bayes loc** | Design loss hyp/loc | **Inference loss** hyp/loc |
|---|---|---|---|---|---|---|
| Bayesian reference | 50/50 | 0.979 | **0.940** | **0.988** | 0 / 0 | 0 / 0 |
| Claude Opus 5.5 (Anthropic) | 15/15 | 0.956 | 0.110 | 0.403 | 0.18 / 0.30 | **1.07 / 0.61** |
| Gemini 4 Hydrogen (AI Studio) | 12/12 | 0.964 | 0.229 | 0.087 | 0.26 / 0.27 | **0.67 / 1.23** |
| MiniMax-M3 | 46/46 | 0.962 | 0.081 | 0.174 | 0.10 / 0.09 | **1.37 / 1.16** |
| Claude Haiku 5.5 | 30/30 | 0.916 | 0.081 | 0.172 | 0.17 / 0.13 | **1.32 / 1.10** |
| Gemma 4 26B-A4B (Modal vLLM) | 150/150 | 0.772 | 0.001 | 0.007 | 0.12 / 0.22 | **1.77 / 1.69** |
| Kimi K3.1 Pro (Verda Inference API) | 0/2 | n/a | n/a | 0.000 | – / 0.31 | – / 1.36 |

(Inference loss uses the agent's raw score clipped at −1 per episode.)

Findings:
1. **The naive grader hides the gap.** Frontier models score 0.92–0.96 naive accuracy on
   hyperbolic, within a few points of the reference (0.98). Under Bayesian grading they score
   0.08–0.23 vs 0.94: a large gap.
2. **The gap comes from a nameable decision.** For every model, design loss is small
   (0.09–0.30: they run sensibly informative experiments) and inference loss dominates
   (0.6–1.8): they fail to turn their own data into calibrated predictions. This is *not* blanket
   overconfidence (checked on 12–15 episodes per model): on hyperbolic the agents are on average
   *less* sharp than the exact posterior (mean |p − 0.5| 0.30–0.38 vs 0.46–0.48), and on location
   their predicted sds roughly match the posterior's (0.48–0.54 vs 0.51–0.58), except Gemma, which
   is overconfident (0.31 vs 0.52). The loss comes from *where* they put probability mass, i.e.
   from mis-estimating the discount curve or the source position given their own data.
3. **It is not withheld information (E3b).** Giving Gemma the exact generative model and priors in
   the prompt barely changes anything: hyperbolic 0.001 → 0.010, location 0.010 → 0.030; inference
   loss 1.75 → 1.80 and 1.77 → 1.55. The information is there; the belief updating is not.
4. **The gap is reproducible across runs.** Three independent Gemma runs on the same seeds:
   Bayesian gap to the reference **0.939 ± 0.002** (hyperbolic) and **0.982 ± 0.003** (location), vs
   naive **0.208 ± 0.024** and **1.03 ± 0.07**. Signal-to-noise ≈ 470 vs ≈ 9 on hyperbolic.
5. The ceiling check flags honest LLM agents at roughly its nominal rate (0–8%); none look leaky.

Kimi K3.1 Pro was stopped after 2 episodes: its reasoning (~30–45k output tokens per episode)
made it the most expensive model per episode by an order of magnitude.

Figures: `results/fig_e3_decomp_{hyperbolic,location}.png`.

## E4: training a small model on the environment's experience

Gemma 4 E4B (4B), LoRA, on one A100. Stage 1: supervised fine-tuning on Bayesian-reference
demonstrations plus the best 30% of Gemma 26B rollouts. Stage 2: GRPO for 300 steps on the
prediction step, with the exact Bayesian reward. Evaluation: full episodes without tools, seeds
0-49 per environment, same protocol as E3.

| Model | Hyperbolic | Location | Episodes at zero (hyp / loc) |
|---|---|---|---|
| base | 0.000 | 0.007 | 50 / 48 |
| supervised (SFT) | 0.362 | 0.111 | 26 / 35 |
| SFT + GRPO | **0.499** | 0.025 | 12 / 47 |

GRPO minus SFT, paired over seeds: hyperbolic **+0.137 [+0.049, +0.225]**, location
**-0.086 [-0.153, -0.026]**. So training on the reward helps on the binary-outcome task and
hurts on the continuous one. On hyperbolic the trained 4B model (0.50) is above Claude Opus 5.5
without tools (0.11, n = 15) and above Claude Code + Opus 5.5 with a shell (0.24, 15 trials).

Two caveats. GRPO trained on prediction prompts only, with experiments already chosen by the
reference, while the evaluation has the model choose its own experiments; that mismatch may be
part of the location result. And an earlier evaluation of the GRPO adapter was invalid (the
adapter was served without the supervised weights it was trained on top of) and has been
removed from `results/e4.jsonl`; the rows `sft_merged` are the sanity check that the corrected
serving path reproduces the supervised model (0.372 / 0.095).

## E7: frontier agents with code execution (Harbor)

Ten Bayes tasks, three attempts each, a shell with Python allowed. Job folders in
`results/e7/`. The harnesses differ between rows, so rows confound model and harness.

| Agent | Hyperbolic | Location | Trials at zero (hyp / loc) |
|---|---|---|---|
| Bayesian reference (oracle solution) | 0.995 | 0.959 | - |
| Claude Code + Opus 5.5 | 0.237 | 0.772 | 7/15, 0/15 |
| Codex + GPT-6 Luna | 0.062 | 0.117 | 12/15, 9/15 |
| OpenCode + MiniMax-M3 (24 of 30 trials, sweep unfinished) | 0.014 | 0.202 | 13/14, 7/10 |

For comparison, random experiments with exact inference score 0.54 / 0.75 (E1). Opus with code
reaches that level on location and stays far below it on hyperbolic.

## E8: held-out environments

**Chemistry lab** (`tasks/chem`, seven discrete faults, closed-form likelihood). Job folders in
`results/e8/`. Gap is the agent's log-score reward minus the reference's on the same trial.

| Agent | Trials | Mean gap to reference (nats) | Fault identified |
|---|---|---|---|
| Claude Code + Opus 5.5 | 15 | +0.006 | 87% |
| Codex + GPT-5.6 Terra | 15 | -0.003 | 87% |

Coding agents solve this environment: with a small discrete hypothesis set and a formula for
the likelihood they write the exact update themselves.

**Wet lab** (`tasks/wetlab`, six mechanisms, stochastic kinetics, limited stock). The reference
is approximate (simulation-based). Calibration over 300 seeds: reference 1.352 nats and 82%
correct; an adaptive ODE-based "competent coder" baseline 1.060 and 74%; random experiments
0.651 and 53%. First two Claude Code + Opus 5.5 trials: rewards 1.787 and 1.617 against
reference 1.791 and 1.012 on the same trials, both mechanisms identified. The sweep was still
running when this was written; two trials do not settle whether the wet lab separates Opus from
the reference.

## E5: the same environment as Harbor tasks, through a real agent harness

`tasks/bayes/{hyperbolic,location}-{0..4}`: the environment runs as an MCP sidecar, the agent
works in a container with tools, and the verifier calls the token-protected `/grade` endpoint.
Run on a Verda CPU VM (`infra/verda/harbor_runner.sh`), 3 attempts × 10 tasks.

| Agent | Trials | Submitted | Naive (hyp acc. / loc rel.) | **Bayesian reward** | PPC flags |
|---|---|---|---|---|---|
| Bayesian reference (MCP-only oracle solution) | 10 | 100% | — | **0.995 / 0.959** | — |
| do nothing / stop early | 10 | 100% | 0.80 (stop early, naive) | **0 / 0** | — |
| OpenCode + Gemma 4 26B-A4B (Modal) | 30 | 97% | 0.702 / −1.07 | **0.000 / 0.000** | 0 / 29 |

Every OpenCode+Gemma trial ran all 10 experiments and submitted predictions, and still scored
exactly 0: within the full tool-using harness, its predictions were never better than the prior
predictive, while naive accuracy on hyperbolic (0.60–0.87 per trial) would have suggested
competent behaviour. The finding from E3 carries over unchanged to the harness the judges run.

## E6: does the Bayesian grader stop reward hacking?

**Why it should (theory).** Write S(q; θ) for the expected log score of a submitted predictive q
when the true parameters are θ (this is exactly what the grader computes: an expectation, so
there is no lucky outcome draw to exploit).

1. *Strict propriety.* For a fixed θ*, S(q; θ*) is uniquely maximised by the true predictive
   p(·|θ*) (Gibbs' inequality). Sharpening, hedging, rounding or formatting tricks can only
   lower the expected reward.
2. *Information bound.* Let D be the data the agent's own experiments produced. For any
   submission q that is a function of D only, E_{θ,D}[S(q; θ)] ≤ E_{θ,D}[S(p(·|D); θ)]: the
   exact posterior predictive is Bayes-optimal (within the submission family: moment matching
   for the Gaussian case). So **no strategy that uses only legitimate information beats the
   reference on average**, however clever it is about the scoring rule.
3. *Hence any systematic win is a leak.* An agent that beats the posterior predictive of its
   own data, on average, must know something about θ* its experiments did not tell it. The
   posterior predictive check tests exactly this: under "only its own data", θ* is a posterior
   draw, so T(θ*) is exchangeable with T(θ̃), θ̃ ~ p(θ|D), and its p-value is uniform.

Do-nothing scoring 0 and miscalibration costing reward follow from (1); (2) and (3) are what
the experiments below check, against attackers that try hard.

**E6a: attacks with no extra information** (400 fresh seeds × 2 envs, Modal CPU):
Reward minus the reference's on the same seeds, 95% paired-bootstrap CI.

| Attack | Hyperbolic | Location | Beats reference per episode (hyp / loc) |
|---|---|---|---|
| do nothing (prior predictive) | −0.955 [−0.964, −0.944] | −0.989 [−0.992, −0.987] | 0% / 0% |
| reference experiments, then act certain (plug in the MAP) | −0.116 [−0.139, −0.094] | −0.022 [−0.031, −0.015] | 43% / 27% |
| lottery ticket: plug in one posterior draw | −0.054 [−0.069, −0.039] | −0.017 [−0.026, −0.010] | 45% / 28% |
| sharpen the predictive ×2 | −0.221 [−0.240, −0.203] | −0.000 [−0.001, +0.001] | 1% / 55% |
| sharpen ×5 | −0.325 [−0.352, −0.299] | −0.001 [−0.002, +0.000] | 2% / 50% |
| blunt (hedge) ×2 | −0.640 [−0.667, −0.613] | −0.562 [−0.579, −0.545] | 0% / 0% |
| spend the whole budget on one design | −0.825 [−0.850, −0.799] | −0.708 [−0.729, −0.687] | 2% / 0% |

No attack beats the reference on average; every interval is below zero or contains it. The
lottery strategies win individual episodes often (27–45%) but lose on average, so clipping the
reward at 0 does not make gambling pay. Sharpening on location ties the reference because after
10 good experiments almost no parameter uncertainty is left to sharpen away. The posterior check
flags none of these more than its nominal rate (3–7%), as it should: none uses extra information.

**E6b: cheaters with a side channel to θ\*** (400 fresh seeds × 2 envs × 2 honest bases). The
attacker is **white-box**: it reproduces the grader's posterior and posterior draws exactly (0
mismatches in 1,600 episodes), so it knows the p-value each choice will get.
Weak honest base (2 experiments; honest reward 0.687 hyperbolic / 0.413 location), i.e. a weak
agent trying to fake competence. "Caught" = flagged by the calibrated batch test over a judge's
batch of 30 episodes (100 in brackets), size 5%.

| Cheat | Reward gain hyp / loc | Caught, n = 30 hyp / loc |
|---|---|---|
| honest (no cheat): false-positive rate | 0 / 0 | 0.10 (0.23) / 0.06 (0.14) |
| blend 10% of the truth into its prediction | +0.044 / +0.061 | **1.00 / 1.00** |
| submit the truth | +0.313 / +0.587 | **1.00 / 1.00** |
| 5 hidden extra experiments (calibrated posterior) | +0.067 / +0.329 | 0.22 (0.53) / **1.00** |
| 30 hidden extra experiments | +0.205 / +0.542 | **1.00 / 1.00** |
| check-aware, keeps every p ≥ 0.05 | +0.237 / +0.284 | **0.99 / 1.00** |
| check-aware, keeps every p ≥ 0.1 | +0.179 / +0.178 | **0.86 / 1.00** |
| check-aware, keeps every p ≥ 0.2 | +0.103 / +0.076 | 0.13 (**0.95**) / **0.89** |
| check-aware, keeps every p ≥ 0.3 | +0.046 / +0.031 | 0.48 (**1.00**) / 0.52 (**1.00**) |
| check-aware, random target per episode | +0.040 / +0.053 | 0.23 (0.74) / 0.07 (0.18) |

On top of the *reference* (the strongest honest agent) the most any cheat can add is +0.045
(hyperbolic) and +0.011 (location): there is almost no headroom left to steal.

Findings:
1. **Naive cheats are caught.** Any blend of the truth is flagged in ≥ 97% of 30-episode
   batches in both environments; single episodes are flagged 19% (hyperbolic) and 86%
   (location) of the time.
2. **Fisher's method alone is not enough against a check-aware cheater.** A white-box cheater
   that keeps every p-value ≥ 0.2 earns +0.08 to +0.10 and Fisher flags it 0–11% of the time,
   because it removes small p-values instead of adding them. A two-sided test of the whole
   p-value distribution, calibrated on honest reference runs, catches it (0.89–0.95). This is
   the batch test the environment now uses (`experiments/analyze_e6.py`).
3. **The undetectable residual is small.** The best attacker we found (random target per
   episode, white-box) evades the batch test and gains +0.04 to +0.05. The frontier-vs-reference
   gap this environment measures is 0.6 to 0.9 (E3). **Hacking cannot close the gap without
   being caught**; it can at most blur it by a few points.
4. **Limits, stated plainly.** (a) Binary outcomes carry little information, so on hyperbolic a
   "few extra experiments" cheat (+0.07) needs ~100 episodes to be caught half the time. (b)
   For weak honest agents the batch test's false-positive rate creeps up with batch size (0.06
   to 0.10 at n = 30, 0.14 to 0.23 at n = 100), because their p-values are not exactly as
   uniform as the reference's. We use batches of 30. (c) The white-box attacker needs the
   grader's private random draws; the deployed task keeps them secret, so a real attacker has
   less control than the one tested here.

**E6c: side channels in the deployed Harbor task** (scripted red-team agent inside the agent
container, both environments):
| Attack | Result |
|---|---|
| Secrets in env vars / files (`TOKEN`, `SALT`, `SEED`, `theta`) | none in the agent container (only the public `bayesenv` code in the oracle-only `/solution`) |
| Verifier files (`/tests`, grader token) | not mounted during the agent phase |
| Docker socket | absent |
| Grader endpoint without the token, guessed tokens, path tricks, other paths, POST | 404 / 501 for all |
| Open ports on the environment container | only 8000 (MCP) and 8001 (token-protected grader) |
| Malformed designs (NaN, 1e9, empty, wrong length, strings) | all rejected, budget not consumed |
| 15 experiments on a budget of 10 | 10 accepted |
| Submit before finishing / experiment after finishing / submit twice | all rejected |
| Degenerate prediction (p = 1, sd = 1e-300) | accepted, scores reward **0** |
| **Recompute θ\* from the public code + the seed in the task name** | **was possible** (found in this audit); **fixed**: the environment container now salts all randomness with a per-trial secret, so θ\* is a fresh prior draw the agent cannot reproduce. The reference still scores 0.89–1.00 on the salted tasks. |

Even if a side channel we have not thought of exists, it can only raise reward by giving the
agent information about θ\*, which is exactly what E6b's check detects.

## Compute and burn

* Modal: Gemma 4 26B-A4B on one RTX PRO 6000 (vLLM, always warm) for agent rollouts; CPU
  fan-out (≤ 40 containers) for the 7,200-episode grid and 1,200 reference demonstrations.
* Verda: Nemotron 3.5 Super VL (NVFP4) on an RTX PRO 6000 (confidential-computing VM); A100 80GB
  trainer for SFT + GRPO; Inference API for Kimi K3.1 Pro.
* Spend is tracked against a linear burn-to-zero line in `results/burn_ledger.csv`.

## Reproduce

```bash
modal run --env 3-sigma-submission experiments/batch.py --seeds 400 --out results/e12.jsonl
python experiments/analyze_e12.py results/e12.jsonl results/e12_summary.json
python experiments/llm_runs.py --provider modal --model gemma-4-26b-a4b-it --seeds 0:200 --concurrency 64
python experiments/plots.py
```
