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

## E4: training a small model on the environment's experience (in progress)

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
