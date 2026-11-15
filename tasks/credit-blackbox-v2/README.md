# credit-blackbox (v2): underwriting against a black-box score generator

One Harbor task family with 6 tasks, one per "desk" (desk seeds 3004, 3005, 3008, 3016, 3017 and 3019). The
rendered tasks are in `final_tasks/`.

An agent underwrites 20 loan applicants, one at a time. For each applicant it may buy live checks (`bureau`,
`income`, `bank`; $20 each; at most 8; each returns only a score band) and then must approve or decline.
- Approve pays the exact expected payoff for the applicant's true segment, (1 - PD) x 1000 - PD x 16000
  (P/R = 16).
- Decline pays 0.

**Stated to the agent:**
- the 6 segments and their PDs;
- the payoffs, costs and limits;
- the 6 band cut-offs;
- each applicant's prior;
- the *structure* of the score generator: per check kind, score = location(segment) + noise, where the noise is
  symmetric, specific to the check kind, and the same for every segment.

**Hidden from the agent:** the locations, the noise families and the scales. The server draws them per desk
(`bbsecret.desk_model`, generator v2):
- Base locations come from `credit_core.Inst(desk).mu`.
- Each check gets a random offset U(-50, 50), and each segment a jitter N(0, 12). There are no segment swaps.
- The noise family per check is Gaussian, Student-t(3) or Cauchy, and every desk has at least one Cauchy check.
- The scale per check depends on the family: Cauchy 30-55, t3 35-60, Gaussian 60-100.
- All of this lives only in the server container.

**Sandbox:** `simulate(segment, check, n)` returns n raw scores for synthetic applicants of a known segment,
drawn from the same generator.
- Price: $1 per draw; at most 50 draws per call and 1000 per episode.
- The sandbox stream is fixed per desk, so the reference run is reproducible. Live readings use a separate,
  per-trial salted stream.
- Calibrating is a value-of-information decision of its own: what to learn, how much, and when.

## Grading (exact; `bblab.Lab.grade`)

- **Per applicant i:** `V_hat_i = V*_i(start) - sum of DP advantages along the agent's trajectory`. The DP is the
  exact count-keyed DP under the true generator (`credit_core.Solver`). This is unbiased for the agent's expected
  value and has low variance. The instruction states it in plain words.
- **Agent total:** `V = sum_i V_hat_i - sandbox spend`.
- **No-information total:** `V0 = sum_i max(prior_i . A, 0)`, deciding every applicant without any information.
- **Reference constant:** `V_ref = E[value of the fair reference procedure]`. It is a Monte Carlo average over 200
  independent sandbox datasets, each evaluated exactly over live worlds (`modal_bb.py`). It is precomputed at
  render time and passed to the server as `TASK_VREF`.
- **Reward:** `clip((V - V0) / (V_ref - V0), 0, 1)`, written to `/logs/verifier/reward.txt`. `details.json` holds,
  for every step, the action, the true-model posterior, the DP Q-values and the advantage.

Because the reward is normalised to the reference's *expected* value, not to one realised reference run, it is
reproducible in distribution. `tasks_meta.json` gives, per desk, the reference reward's mean, SD and
P(reward < 0.5) over the 200 datasets, plus the score of the fixed-seed reference run.

## Fair reference (`solution/refpolicy.py`, policy `ref`; uses only the agent's tools)

1. Draw 12 sandbox scores for each of the 18 (segment, check) cells ($216).
2. For each check, set each segment's location to the median of its draws. Pool the residuals x - median over
   the 6 segments (valid because the noise is stated to be the same for every segment) and symmetrise them
   (use both r and -r).
3. Build the band table for segment k from the share of (location_k + residual) values in each band, with 0.5
   pseudo-counts per band. Average the table over 40 bootstrap resamples of each cell, so it carries its own
   estimation uncertainty.
4. Play the exact DP for each applicant under these tables.

The reference uses no knowledge of the noise family. The informed variant `mle` (maximum likelihood over
{Gaussian, t3, Cauchy}, a set that contains the true family) is reported as an upper line. In expectation it
scores 0.83-0.97 of the fair reference.

**Choice of draw count and bootstrap.** These were chosen on v1 desks 1000-1021, which are not v2 desks:
- With 8 draws per cell and no bootstrap, the reference's value had a large spread across sandbox datasets,
  and one Harbor oracle run scored 0.
- With 12 draws per cell and the bootstrap, the spread was the smallest of the variants tried.

## Desk selection (transparent)

I screened 20 desks (3000-3019) on 40 sandbox datasets each. A desk passes if:
- the reference reward SD is <= 0.15;
- P(reference reward < 0.5) is <= 0.05;
- the guess, naive and one-step baselines each have expected normalised reward <= 0.8.

Selection had two stages, with the same rule applied at both:

1. **Screen** (40 sandbox datasets per desk, baselines on 10): take the **first 6 passing desks in numeric
   order**. These were 3001, 3002, 3004, 3005, 3008 and 3016.
2. **Confirmation** (200 datasets, baselines on 30), applying the same rule again:
   - 3001 failed: its naive baseline was 0.86.
   - 3002 failed: its reference reward SD was 0.164.
   - Both were replaced by the next screen-passing desks in numeric order, 3017 and 3019, which pass at 200
     datasets.
   - 3013, the only other near-miss, was also checked and fails again.

All 20 screen rows are in `v2_screen_table.json` and in the table below (from `screen_table.py`). The baseline
columns are expected normalised rewards; the pass column says whether the desk passed (yes) or failed (no).

| desk | true DP | ref mean | ref SD | ref reward SD | P(ref<0.5) | guess | naive | one-step | MLE | over | medfix | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3000 | 1990 | 1205 | 444 | 0.248 | 0.100 | 0.00 | 0.79 | 0.34 | 0.92 | 0.75 | 0.63 | no |
| 3001 | 1646 | 1282 | 163 | 0.104 | 0.000 | 0.00 | 0.77 | 0.47 | 0.83 | 0.49 | 0.65 | yes |
| 3002 | 1690 | 1330 | 129 | 0.074 | 0.000 | 0.00 | 0.21 | 0.10 | 0.92 | 0.50 | 0.00 | yes |
| 3003 | 1308 | 763 | 338 | 0.277 | 0.100 | 0.00 | 0.02 | 0.00 | 0.96 | 0.34 | 0.00 | no |
| 3004 | 1767 | 1465 | 86 | 0.050 | 0.000 | 0.00 | 0.64 | 0.16 | 0.86 | 0.52 | 0.52 | yes |
| 3005 | 1543 | 1135 | 117 | 0.074 | 0.000 | 0.39 | 0.68 | 0.06 | 0.97 | 0.46 | 0.00 | yes |
| 3006 | 1446 | 1021 | 150 | 0.111 | 0.000 | 0.90 | 0.58 | 0.00 | 0.83 | 0.38 | 0.19 | no |
| 3007 | 1444 | 404 | 483 | 0.435 | 0.375 | 0.00 | 0.80 | 0.42 | 0.80 | 0.75 | 0.78 | no |
| 3008 | 1535 | 1243 | 71 | 0.043 | 0.000 | 0.00 | 0.68 | 0.23 | 0.95 | 0.43 | 0.62 | yes |
| 3009 | 1613 | 1037 | 486 | 0.256 | 0.100 | 0.00 | 0.00 | 0.00 | 0.90 | 0.53 | 0.03 | no |
| 3010 | 1066 | 448 | 285 | 0.349 | 0.225 | 0.00 | 0.61 | 0.00 | 0.71 | 0.05 | 0.02 | no |
| 3011 | 1574 | 991 | 275 | 0.197 | 0.050 | 0.00 | 0.78 | 0.00 | 1.00 | 0.51 | 0.28 | no |
| 3012 | 1909 | 1578 | 77 | 0.037 | 0.000 | 0.86 | 0.75 | 0.13 | 0.98 | 0.56 | 0.18 | no |
| 3013 | 1638 | 1163 | 193 | 0.126 | 0.000 | 0.77 | 0.80 | 0.27 | 0.93 | 0.49 | 0.23 | no |
| 3014 | 1487 | 855 | 321 | 0.260 | 0.100 | 0.00 | 0.61 | 0.04 | 0.93 | 0.42 | 0.04 | no |
| 3015 | 1569 | 1122 | 232 | 0.161 | 0.050 | 0.00 | 0.76 | 0.02 | 0.76 | 0.44 | 0.40 | no |
| 3016 | 1481 | 1091 | 137 | 0.106 | 0.000 | 0.00 | 0.61 | 0.23 | 0.94 | 0.40 | 0.77 | yes |
| 3017 | 1512 | 1083 | 153 | 0.097 | 0.000 | 0.00 | 0.72 | 0.31 | 0.92 | 0.43 | 0.09 | yes |
| 3018 | 1795 | 1424 | 164 | 0.098 | 0.025 | 0.00 | 0.82 | 0.41 | 1.00 | 0.54 | 0.00 | no |
| 3019 | 1735 | 1353 | 130 | 0.065 | 0.000 | 0.00 | 0.57 | 0.12 | 0.88 | 0.54 | 0.49 | yes |

Notes on the table:
- Desk 3013 shows 0.80 in the naive column but did not pass: the screening flag is computed before rounding, so
  its raw value exceeds the 0.8 cut-off. Desks 3017 and 3019 passed but were not taken; only the first 6 passing
  desks are used.

**Confirmation, 200 datasets** (from `v2_final_table.json` and `v2_final_b_table.json`; the reference reward is
clip((V - V0) / (E[V_ref] - V0), 0, 1) for each dataset):

| desk | status | true DP | E[V_ref] | ref reward mean | ref reward SD | P(ref<0.5) | guess | naive | one-step | MLE | over | medfix | margin to closest of guess/naive/one-step |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3001 | dropped | 1646 | 1259 | 0.942 | 0.139 | 0.020 | 0.00 | 0.86 | 0.41 | 0.92 | 0.50 | 0.74 | 0.14 |
| 3002 | dropped | 1690 | 1248 | 0.924 | 0.164 | 0.025 | 0.00 | 0.26 | 0.17 | 0.97 | 0.54 | 0.00 | 0.74 |
| 3004 | task | 1767 | 1455 | 0.979 | 0.054 | 0.000 | 0.00 | 0.66 | 0.22 | 0.86 | 0.52 | 0.46 | 0.34 |
| 3005 | task | 1543 | 1137 | 0.962 | 0.067 | 0.000 | 0.37 | 0.53 | 0.07 | 0.92 | 0.45 | 0.00 | 0.47 |
| 3008 | task | 1535 | 1233 | 0.975 | 0.091 | 0.010 | 0.00 | 0.70 | 0.29 | 0.89 | 0.43 | 0.58 | 0.30 |
| 3013 | dropped | 1638 | 1104 | 0.910 | 0.169 | 0.035 | 0.81 | 0.79 | 0.22 | 0.95 | 0.52 | 0.32 | 0.19 |
| 3016 | task | 1481 | 1086 | 0.959 | 0.089 | 0.005 | 0.00 | 0.73 | 0.15 | 0.96 | 0.39 | 0.80 | 0.27 |
| 3017 | task | 1512 | 1096 | 0.943 | 0.117 | 0.015 | 0.00 | 0.66 | 0.30 | 0.92 | 0.41 | 0.16 | 0.34 |
| 3019 | task | 1735 | 1353 | 0.958 | 0.080 | 0.000 | 0.00 | 0.60 | 0.15 | 0.94 | 0.52 | 0.53 | 0.40 |

V0 = 0 on every desk: without information, declining is best for every applicant at P/R 16.

How close the fair reference gets to the privileged true-model DP: E[V_ref] / V_true_dp = 0.82 (3004), 0.74
(3005), 0.80 (3008), 0.73 (3016), 0.72 (3017) and 0.78 (3019). This includes the $216 sandbox spend, which the
true DP does not pay.

## Harbor validation (VM, final tasks)

| job | 3004 | 3005 | 3008 | 3016 | 3017 | 3019 |
|---|---|---|---|---|---|---|
| oracle (`solve.sh`, fair reference) | 1.000 | 0.824 | 1.000 | 1.000 | 1.000 | 1.000 |
| nop (Harbor do-nothing) | 0.000 | 0.000 | 0.000 | 0.000 | - | - |
| stop-early (`POLICY=onestep`) | 0.016 | - | 0.138 | - | - | - |

- **Reproducibility.** The sandbox stream is fixed per desk, so these oracle runs are reproducible. The remaining
  spread (3005: 0.82) is live-reading noise at states where the reference and the true DP disagree.
- **Same engine, run in-process** (`modal_bb.py::oracle`, 3 salts): the reference scored 0.90-1.0 on 3004, 0.65-1.0
  on 3005, 0.99-1.0 on 3008 and 0.85-1.0 on 3016.
- **Caveat on the fixed stream.** A baseline that makes exactly the reference's sandbox calls gets exactly the
  reference's dataset. On desk 3004 that dataset happens to favour the naive Gaussian attractor (about 0.9 on it,
  against 0.66 in expectation over 200 datasets). Baselines are therefore compared in expectation over sandbox
  datasets.
- **Engine tests** (`test_blackbox.py`, run on Modal): determinism, salt and stream independence, invalid actions
  and limits, decline = 0, and ref above guess, over and decline.

## Baselines (all go through the same grader)

| policy | meaning |
|---|---|
| `decline` | decline everyone; no checks, no sandbox |
| `guess` | no calibration: guessed Gaussian model (locations evenly spaced 790..590, sd 60), then the DP |
| `naive` | Gaussian attractor: same draws as ref, per-cell mean and pooled sd, Gaussian bands, DP |
| `medfix` | simple strategy: per-cell median plus a fixed Gaussian table (sd 60), DP |
| `onestep` | the ref tables with one-step lookahead instead of the DP |
| `over` | over-calibration: spends the whole 1000-draw allowance, then plays as ref |
| `mle` | informed upper line (family MLE) |

## v1 history (kept as evidence)

v1 used locations that were monotone and roughly where a sensible guess would put them, $2 per draw, and 16
applicants. On v1 desk 1001:
- Opus scored 0.057 (557 draws).
- Codex gpt-5.6-terra scored 0, 0 and 0 (900-1000 draws each).
- An OpenCode+Argon run died on an invalid MCP tool name (fixed in v2).

In v1 the gap came mostly from over-calibration. A guessed model needing no sandbox was nearly as good as the
reference on 3 of 7 desks. v2 fixes both problems.

## Leak checks and verifier hardening

**Leak checks:**
- The generator, seeds and salt exist only in the `mcp-server` container.
- The agent has no access to `/tests` or `/solution`.
- Sandbox and live readings come from independent streams: using the sandbox does not change live readings
  (see `test_blackbox.py`).
- Invalid actions are rejected without cost, and budgets are enforced in the server.

**Verifier (`tests/test.sh`):**
- Runs with `PATH=/usr/bin:/bin`, absolute binaries, `python3 -I`, and `LD_PRELOAD` / `PYTHON*` unset.
- Kills stray agent processes before grading.
- Checks the curl and python packages with `dpkg -V` and fails closed with 0 on any modification.

An agent with root in the shared container could still subvert this in principle, because Harbor runs the
verifier there. These measures close the trivial attacks, such as a fake `curl` on PATH.
