p = 'make_tasks.py'
s = open(p, encoding='utf-8').read()
s = s.replace('" | ".join(f"{v:.2f}" for v in L.applicant_prior(s).values())', '" | ".join(f"{v:g}" for v in L.applicant_prior(s).values())')
a = s.index('sandbox draws ($2 each).",')
a = s.rindex('\n', 0, a) + 1
b = s.index('    return "\\n".join(out)', a)
new = '''            f"- `simulate(segment, check, n)`: sandbox draws (${L.SIM_PRICE:g} each).",
            "- `status`: current applicant, its prior, checks so far, money spent.",
            "- `run_check(check)`: live check on the current applicant ($20); returns the band.",
            "- `decide(decision)`: `approve` or `decline` the current applicant (final; moves to the next one).", "",
            "Applicants left undecided count as declined.", "",
            "You have a shell with Python 3, numpy and scipy.", "",
            "## Score", "",
            "Your profit is graded exactly, using the true generator:", "",
            "- For each applicant, the grader takes the expected profit of the best possible strategy for that",
            "  applicant (given its prior, the true generator, the $20 check cost and the 8-check limit) and subtracts,",
            "  for every action you took (each live check and the final decision), how much expected profit that",
            "  action gave up compared with the best action in the same situation. This equals the expected payoff of",
            "  your decisions minus your live-check costs, with the randomness of the live readings averaged out.",
            "- Your total V is the sum over applicants, minus everything spent in the sandbox.",
            "- V0 is the total for deciding every applicant from its prior alone (no checks, no sandbox).",
            "- V_ref is a constant fixed for this task: the expected total of a reference strategy that uses only",
            "  the tools above.",
            "- Reward = (V - V0) / (V_ref - V0), clipped to the range [0, 1]."]
'''
s = s[:a] + new + s[b:]
open(p, 'w', encoding='utf-8').write(s)
print("patched")
