# Underwrite 16 loan applications

You are a credit underwriter. An MCP server named `credit-desk` is connected to you. It holds
16 personal-loan applicants, presented one at a time. For each applicant you may buy live
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
applicants of a known segment, drawn from exactly the same generator. It costs $2 per draw
(at most 50 per call and 1000 per episode), can be used at any time, and
does not affect the live applicants.

## Applicant priors

| applicant | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|
| 1 | 0.26 | 0.04 | 0.24 | 0.17 | 0.14 | 0.15 |
| 2 | 0.16 | 0.27 | 0.09 | 0.19 | 0.25 | 0.04 |
| 3 | 0.15 | 0.31 | 0.26 | 0.16 | 0.06 | 0.06 |
| 4 | 0.10 | 0.33 | 0.03 | 0.15 | 0.07 | 0.32 |
| 5 | 0.22 | 0.27 | 0.24 | 0.15 | 0.07 | 0.05 |
| 6 | 0.20 | 0.25 | 0.20 | 0.06 | 0.18 | 0.11 |
| 7 | 0.17 | 0.16 | 0.28 | 0.12 | 0.16 | 0.11 |
| 8 | 0.17 | 0.15 | 0.29 | 0.10 | 0.10 | 0.19 |
| 9 | 0.16 | 0.52 | 0.06 | 0.05 | 0.03 | 0.18 |
| 10 | 0.34 | 0.13 | 0.16 | 0.30 | 0.03 | 0.04 |
| 11 | 0.14 | 0.14 | 0.12 | 0.04 | 0.17 | 0.39 |
| 12 | 0.14 | 0.08 | 0.17 | 0.33 | 0.14 | 0.14 |
| 13 | 0.19 | 0.16 | 0.20 | 0.06 | 0.19 | 0.20 |
| 14 | 0.15 | 0.07 | 0.11 | 0.15 | 0.16 | 0.36 |
| 15 | 0.07 | 0.22 | 0.03 | 0.12 | 0.33 | 0.23 |
| 16 | 0.09 | 0.05 | 0.10 | 0.24 | 0.15 | 0.37 |

## Tools

- `get_rules`: these rules as JSON.
- `simulate(segment, check, n)`: sandbox draws ($2 each).
- `status`: current applicant, its prior, checks so far, money spent.
- `run_check(check)`: live check on the current applicant ($20); returns the band.
- `decide(decision)`: `approve` or `decline` the current applicant (final; moves to the next one).

Applicants you leave undecided count as declined.

You have a shell with Python 3, numpy and scipy.

## Score

Your profit is the sum over applicants of the expected payoff of your decision, minus $20 per live check
and minus all sandbox spending. The score compares your profit with a reference strategy on the same
episode (1.0 = at least as good as the reference, 0 = no better than deciding every applicant without
any information).
