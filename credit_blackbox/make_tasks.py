"""Render Harbor tasks credit-blackbox-<desk> from template/.

Per desk: applicants = the first N_APP applicant seeds (from 50000+100*desk+j) whose true-model DP gain over
deciding without checks is >= MIN_GAIN. V_REF = expected value of the fair reference procedure under the true
generator: mean over R independent sandbox datasets of sum_i V(reference DP policy on applicant i) - sandbox cost.
Also records the informed (MLE) reference and the true-model DP for the report.
usage: python make_tasks.py <desks comma list> [R]"""
import json, secrets, shutil, sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "template/environment/mcp-server"))
import credit_core as cc
import bbpub as P
import bbsecret as Z
import bblab as L
sys.path.append(str(HERE / "template/solution"))
import refpolicy  # noqa: E402  (N0 of the reference)

N_APP = 16
MIN_GAIN = 20.0
SEGNAMES = ["S1 super-prime", "S2 prime", "S3 near-prime", "S4 subprime", "S5 deep subprime", "S6 very high risk"]


def pick_applicants(desk):
    T = Z.true_tables(Z.desk_model(desk))
    out = []
    j = 0
    while len(out) < N_APP:
        s = 50_000 + 100 * desk + j
        S = cc.Solver(P.TableInst(cc.Inst(s).prior, T), "m", L.PR)
        if S.solve() - S.nodata() >= MIN_GAIN:
            out.append(s)
        j += 1
    return out


def ref_value(args):
    desk, seeds, rep, kind = args
    model = Z.desk_model(desk); T = Z.true_tables(model)
    r = np.random.default_rng([desk, rep, 777])
    s = {c: [(k, float(Z.draw_scores(model, c, k, r.random()))) for k in range(cc.K) for _ in range(refpolicy.N0)]
         for c in P.CHECKS}
    tab = P.fit_empirical(s)[0] if kind == "ref" else P.fit_samples(s)[0]
    tot = 0.0
    for sd in seeds:
        prior = cc.Inst(sd).prior
        St = cc.Solver(P.TableInst(prior, T), "m", L.PR); St.solve()
        Sf = cc.Solver(P.TableInst(prior, tab), "m", L.PR); Sf.solve()
        tot += St.evaluate(Sf.dp_policy())[0]
    return tot - L.SIM_PRICE * refpolicy.N0 * cc.E * cc.K


def true_value(args):
    desk, seeds = args
    T = Z.true_tables(Z.desk_model(desk)); v = nd = 0.0
    for sd in seeds:
        S = cc.Solver(P.TableInst(cc.Inst(sd).prior, T), "m", L.PR); v += S.solve(); nd += S.nodata()
    return v, nd


def instruction(seeds):
    out = [f"# Underwrite {len(seeds)} loan applications", "",
           "You are a credit underwriter. An MCP server named `credit-desk` is connected to you. It holds",
           f"{len(seeds)} personal-loan applicants, presented one at a time. For each applicant you may buy live",
           "verification checks and then must **approve** or **decline** the loan.", "",
           "## Rules", "",
           "Each applicant belongs to exactly one of six risk segments, drawn at random from that applicant's",
           "prior (table below). Segment default probabilities (PD):", ""]
    out += ["| segment | PD |", "|---|---|"] + [f"| {SEGNAMES[t]} | {cc.PD[t]:.2f} |" for t in range(cc.K)]
    out += ["", "**Payoffs.** Approving earns the interest margin of $1,000 if the loan is repaid and loses $16,000",
            "(loss given default) if it defaults. You are credited with the expected payoff given the applicant's",
            "true segment: approve = (1 - PD) x 1000 - PD x 16000; decline = $0.", "",
            "**Live checks.** Three kinds: `bureau`, `income` and `bank`. Each costs $20 and returns only the band",
            "of the applicant's score:", ""]
    out += [f"- band {b}: {t}" for b, t in enumerate(L.bands())]
    out += ["", f"At most {cc.T} live checks per applicant (any mix of kinds). You may decide at any time, including",
            "before any check. A decision is final and the next applicant starts.", "",
            "**How scores are generated.** For each check kind, score = (a location that depends on the applicant's",
            "segment) + noise. The noise distribution is specific to the check kind, symmetric around 0, and the same",
            "for every segment and every applicant. The locations and noise distributions are not disclosed. Every",
            "check run, including a repeat of the same kind, is an independent draw.", "",
            f"**Sandbox.** `simulate(segment, check, n)` returns n raw (unbanded) scores of that check for synthetic",
            f"applicants of a known segment, drawn from exactly the same generator. It costs ${L.SIM_PRICE:g} per draw",
            f"(at most {L.SIM_MAX_PER_CALL} per call and {L.SIM_MAX_TOTAL} per episode), can be used at any time, and",
            "does not affect the live applicants.", "",
            "## Applicant priors", "",
            "| applicant | " + " | ".join(f"S{t + 1}" for t in range(cc.K)) + " |", "|---|" + "---|" * cc.K]
    for i, s in enumerate(seeds):
        out.append(f"| {i + 1} | " + " | ".join(f"{v:g}" for v in L.applicant_prior(s).values()) + " |")
    out += ["", "## Tools", "",
            "- `get_rules`: these rules as JSON.",
            f"- `simulate(segment, check, n)`: sandbox draws (${L.SIM_PRICE:g} each).",
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
    return "\n".join(out) + "\n"


def main():
    desks = [int(x) for x in sys.argv[1].split(",")]
    R = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    with Pool(min(16, len(desks))) as p:
        seeds = dict(zip(desks, p.map(pick_applicants, desks)))
    jobs = [(d, seeds[d], r, "ref") for d in desks for r in range(R)] + [(d, seeds[d], r, "mle") for d in desks for r in range(max(2, R // 3))]
    with Pool(16) as p:
        vals = p.map(ref_value, jobs)
        tv = dict(zip(desks, p.map(true_value, [(d, seeds[d]) for d in desks])))
    meta = {}
    for d in desks:
        ref = [v for (dd, _, _, k), v in zip(jobs, vals) if dd == d and k == "ref"]
        mle = [v for (dd, _, _, k), v in zip(jobs, vals) if dd == d and k == "mle"]
        meta[d] = dict(seeds=seeds[d], V_ref=float(np.mean(ref)), V_ref_sd=float(np.std(ref)), V_ref_samples=[float(v) for v in ref], V_mle=float(np.mean(mle)),
                       V_true_dp=tv[d][0], V_nodata=tv[d][1], model=Z.desk_model(d), N0=refpolicy.N0)
        print(d, {k: (round(v, 1) if isinstance(v, float) else v) for k, v in meta[d].items() if k != "model"})
    old = json.load(open(HERE / "build_meta.json")) if (HERE / "build_meta.json").exists() else {}
    old.update({str(k): v for k, v in meta.items()})
    json.dump(old, open(HERE / "build_meta.json", "w"), indent=1)
    outdir = HERE / "tasks"; outdir.mkdir(exist_ok=True)
    for d in desks:
        dst = outdir / f"credit-blackbox-{d}"
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(HERE / "template", dst, ignore=shutil.ignore_patterns("__pycache__"))
        tok = secrets.token_urlsafe(24)
        for f in dst.rglob("*"):
            if f.is_file() and f.suffix in {".toml", ".md", ".yaml", ".sh", ".py", ""}:
                s = f.read_text(encoding="utf-8")
                s = (s.replace("__TASKID__", str(d)).replace("__DESK__", str(d)).replace("__SEEDS__", ",".join(map(str, seeds[d])))
                     .replace("__VREF__", f"{meta[d]['V_ref']:.4f}").replace("__TOKEN__", tok))
                f.write_text(s, encoding="utf-8", newline="\n")
        (dst / "instruction.md").write_text(instruction(seeds[d]), encoding="utf-8", newline="\n")
        (dst / "tests" / "grader_token").write_text(tok, encoding="utf-8", newline="\n")
        print("rendered", dst.name)


if __name__ == "__main__":
    main()
