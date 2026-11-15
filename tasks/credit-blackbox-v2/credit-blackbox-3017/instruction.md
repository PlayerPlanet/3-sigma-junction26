# Underwrite 20 loan applications

You are a credit underwriter. An MCP server named `credit-desk` is connected to you. It holds
20 personal-loan applicants, presented one at a time. For each applicant you may buy live
verification checks and then must **approve** or **decline** the loan.

## Rules

Each applicant belongs to exactly one of six risk segments, drawn at random from that applicant's
prior (table below). Segment default probabilities (PD):

| segment | PD |
|---|---|
| S1 super-prime | 0.02 |
| S2 prime | 0.05 |
| S3 near-prime | 0.12 |
| S4 subprime | 0.30 |
| S5 deep subprime | 0.60 |
| S6 very high risk | 0.90 |

**Payoffs.** Approving earns the interest margin of $1,000 if the loan is repaid and loses $16,000
(loss given default) if it defaults. You are credited with the expected payoff given the applicant's
true segment: approve = (1 - PD) x 1000 - PD x 16000; decline = $0.

**Live checks.** Three kinds: `bureau`, `income` and `bank`. Each costs $20 and returns only the band
of the applicant's score:

- band 0: score < 560
- band 1: 560 <= score < 630
- band 2: 630 <= score < 690
- band 3: 690 <= score < 750
- band 4: 750 <= score < 820
- band 5: score >= 820

At most 8 live checks per applicant (any mix of kinds). You may decide at any time, including
before any check. A decision is final and the next applicant starts.

**How scores are generated.** For each check kind, score = (a location that depends on the applicant's
segment) + noise. The noise distribution is specific to the check kind, symmetric around 0, and the same
for every segment and every applicant. The locations and noise distributions are not disclosed. Every
check run, including a repeat of the same kind, is an independent draw.

**Sandbox.** `simulate(segment, check, n)` returns n raw (unbanded) scores of that check for synthetic
applicants of a known segment, drawn from exactly the same generator. It costs $1 per draw
(at most 50 per call and 1000 per episode), can be used at any time, and
does not affect the live applicants.

## Applicant priors

| applicant | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|
| 1 | 0.33 | 0.2 | 0.07 | 0.04 | 0.16 | 0.2 |
| 2 | 0.18 | 0.07 | 0.25 | 0.37 | 0.1 | 0.03 |
| 3 | 0.17 | 0.03 | 0.23 | 0.05 | 0.32 | 0.2 |
| 4 | 0.23 | 0.08 | 0.04 | 0.42 | 0.08 | 0.15 |
| 5 | 0.2 | 0.21 | 0.15 | 0.03 | 0.26 | 0.15 |
| 6 | 0.17 | 0.11 | 0.38 | 0.15 | 0.09 | 0.1 |
| 7 | 0.16 | 0.06 | 0.31 | 0.06 | 0.12 | 0.29 |
| 8 | 0.17 | 0.03 | 0.22 | 0.1 | 0.15 | 0.33 |
| 9 | 0.13 | 0.23 | 0.24 | 0.17 | 0.09 | 0.14 |
| 10 | 0.21 | 0.13 | 0.28 | 0.14 | 0.05 | 0.19 |
| 11 | 0.39 | 0.14 | 0.03 | 0.13 | 0.03 | 0.28 |
| 12 | 0.38 | 0.11 | 0.13 | 0.21 | 0.06 | 0.11 |
| 13 | 0.28 | 0.03 | 0.13 | 0.27 | 0.15 | 0.14 |
| 14 | 0.21 | 0.2 | 0.16 | 0.03 | 0.27 | 0.13 |
| 15 | 0.25 | 0.18 | 0.05 | 0.14 | 0.17 | 0.21 |
| 16 | 0.17 | 0.22 | 0.23 | 0.12 | 0.11 | 0.15 |
| 17 | 0.13 | 0.25 | 0.04 | 0.11 | 0.28 | 0.19 |
| 18 | 0.16 | 0.05 | 0.24 | 0.03 | 0.19 | 0.33 |
| 19 | 0.12 | 0.21 | 0.14 | 0.2 | 0.15 | 0.18 |
| 20 | 0.19 | 0.13 | 0.34 | 0.1 | 0.09 | 0.15 |

## Tools

- `get_rules`: these rules as JSON.
- `simulate(segment, check, n)`: sandbox draws ($1 each).
- `status`: current applicant, its prior, checks so far, money spent.
- `run_check(check)`: live check on the current applicant ($20); returns the band.
- `decide(decision)`: `approve` or `decline` the current applicant (final; moves to the next one).

Applicants left undecided count as declined.

You have a shell with Python 3, numpy and scipy.

## Score

Your profit is graded exactly, using the true generator:

- For each applicant, the grader takes the expected profit of the best possible strategy for that
  applicant (given its prior, the true generator, the $20 check cost and the 8-check limit) and subtracts,
  for every action you took (each live check and the final decision), how much expected profit that
  action gave up compared with the best action in the same situation. This equals the expected payoff of
  your decisions minus your live-check costs, with the randomness of the live readings averaged out.
- Your total V is the sum over applicants, minus everything spent in the sandbox.
- V0 is the total for deciding every applicant from its prior alone (no checks, no sandbox).
- V_ref is a constant fixed for this task: the expected total of a reference strategy that uses only
  the tools above.
- Reward = (V - V0) / (V_ref - V0), clipped to the range [0, 1].
