# Bitshift Happens on Verda: process log

**Team 3-Sigma · Junction 2026 · Verda Compute Track** (built on the AfterQuery "Break the Agent" project)

## The idea

Make RL environments for scientific agents that can't be gamed and whose rewards are
trustworthy: when the data-generating model is known, grade agents with the **exact Bayesian
posterior**, use the same posterior to explain *why* an agent fails, and train a small open
model on the environment's experience to close that gap: exactly Verda's suggested project:
"run thousands of rollouts in your AfterQuery RL environment and fine-tune a smaller model on
the experience".

## Which Verda product for which job, and why

| Job | Verda product | Why this one |
|---|---|---|
| Serve **NVIDIA Nemotron 3.5 Super VL** (120B-A12B, NVFP4) for agent rollouts | **GPU instance**: 1× RTX PRO 6000 Blackwell 96 GB, confidential-computing VM (FIN-03) | NVFP4 weights need Blackwell; 96 GB holds the 120B model on one GPU; the CC VM keeps model I/O inside an attested enclave in a European, renewable-powered DC |
| Frontier open-weight agent (**Kimi K3.1 Pro**) | **Inference API** (`inference.verda.com/v1`) | Zero setup, per-token billing; a 1M-context reasoning model we could not host ourselves |
| Fine-tune + RL a small model (**Gemma 4 E4B**) on environment experience | **GPU instance**: 1× A100 80 GB | LoRA SFT and GRPO on a 4B-effective model fit one A100; cheaper than Blackwell for training |
| Rollout fan-out, environment hosting | (Modal for bursty CPU; see main README) | Verda CPU instances are the path to always-on hosting of the MCP environment for real users |

## Process (what actually happened)

1. **API outage, worked around.** `api.verda.com` served the web app instead of the API for
   hours (`/v1/oauth2/token` returned HTML), so CLI v1.7.2 and v1.10.0 both failed auth. The legacy
   domain `api.datacrunch.io/v1` kept working: `verda --base-url https://api.datacrunch.io/v1 ...`.
2. **Confidential-computing images ship without Docker.** The vLLM container recipe failed
   ("Operating system is not valid for this instance type"); switched the startup script to a
   `uv` venv + systemd unit (`infra/verda/nemotron_super_vl.sh`).
3. **CC GPUs start "not-ready".** vLLM failed with CUDA error 802 *system not yet initialized*.
   In CC mode the GPU refuses work until its ready state is set, normally after remote
   attestation. We set it (`nvidia-smi conf-compute -srs 1`, also as `ExecStartPre`).
   **Gap:** we did not run NVIDIA's attestation (nvtrust) first; a production deployment must.
4. **FlashInfer JIT OOM.** Blackwell (sm_120) kernels are compiled at first start with parallel
   `nvcc`; uncapped, the build was OOM-killed on the 90 GB-RAM VM. Fixed with `MAX_JOBS=4`,
   `FLASHINFER_NVCC_THREADS=1`.
5. **Inference API cost control.** Kimi K3.1 Pro reasons at length (~30–45k output tokens per
   episode). At 16 concurrent episodes it burned ~€7 in 11 minutes; we cut concurrency to 2 and
   capped the run so Verda spend tracks a linear budget line (`ops/burn_ledger.py`).
6. **Trainer VM.** A100 startup script installs vLLM + TRL + PEFT and pre-downloads Gemma 4 E4B;
   code and data are copied in with `scp`; `train/run_e4.sh` runs baseline → SFT → GRPO → eval,
   resumable per stage. FlashInfer needed `ninja` in the venv.

## Path to scale

* The environment is a Harbor task dataset (`tasks/bayes/`): adding environments = adding a
  generative model to `bayesenv/envs.py`. Grading is CPU-only and embarrassingly parallel.
* Serving: the always-warm single-GPU vLLM endpoint becomes a Verda auto-scaling container.
* Training: the same `run_e4.sh` scales from one A100 to an Instant Cluster (GRPO rollouts are
  the bottleneck and parallelise across GPUs).

## Results

See `docs/RESULTS.md` (E1–E4) and the figures in `results/`.
