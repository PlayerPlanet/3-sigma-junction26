"""Build the black-box v2 results table and figure for the paper.

Input: v2_trials.txt, one line per trial as printed by v2sum.py, prefixed by nothing:
    <job> <desk-folder> <reward> Vhat <V> draws <n> checks <c> decided <k>
Lines without a score are ignored. Job names map to agents below.

    python v2_table.py            # prints the LaTeX rows and per-trial decomposition, writes fig_v2.pdf
"""
import collections
import re
import sys

# desk -> (true-model DP value, E[V_ref]); from credit_blackbox README, 200 sandbox datasets
DESK = {
    "3004": (1767, 1455), "3005": (1543, 1137), "3008": (1535, 1233),
    "3016": (1481, 1086), "3017": (1512, 1096), "3019": (1735, 1353),
}
REF_SPEND = 216
BS, NL = chr(92), chr(10)
AGENT = [  # (job-name regex, label, harness)
    (r"oracle", "Reference", "oracle"),
    (r"opus", "Claude Opus 5.5", "Claude Code"),
    (r"sonnet", "Claude Sonnet 5.5", "Claude Code"),
    (r"argon", "Gemini 4 Argon", "OpenCode"),
    (r"carbon", "Gemini 4 Carbon", "OpenCode"),
    (r"kimi", "Kimi K3.1 Pro", "OpenCode"),
    (r"minimax", "MiniMax-M3", "OpenCode"),
    (r"deepseek", "DeepSeek V4.1 Flash", "OpenCode"),
    (r"terra", "GPT-5.6 Terra", "OpenCode"),
    (r"nemotron(?!-bad)", "Nemotron 3 Ultra", "OpenCode"),
]


def load(path):
    rows = []
    for line in open(path, encoding="utf-8"):
        m = re.match(r"(\S+)\s+credit-blackbox-(\d+)\S*\s+([-\d.]+) Vhat (-?\d+) draws (\d+) checks ([\d.]+) decided (\d+)", line.strip())
        if not m:
            continue
        job, desk, rew, v, draws, checks, dec = m.groups()
        if "bad404" in job:
            continue
        for pat, label, harness in AGENT:
            if re.search(pat, job):
                dp, vref = DESK[desk]
                v, draws = int(v), int(draws)
                if draws == 0 and int(dec) == 0:
                    break  # the agent never acted (API failure): infrastructure, not a result
                rows.append(dict(agent=label, harness=harness, desk=desk, reward=float(rew), raw=v / vref, V=v,
                                 draws=draws, checks=float(checks), play_loss=dp - (v + draws), done=int(dec) == 20))
                break
    return rows


def main():
    rows = load(sys.argv[1] if len(sys.argv) > 1 else "v2_trials.txt")
    by = collections.defaultdict(list)
    for r in rows:
        by[r["agent"]].append(r)
    order = [a[1] for a in AGENT if a[1] in by]
    mean = lambda xs: sum(xs) / len(xs)
    import statistics
    med = statistics.median
    lines = []
    for a in order:
        rs = by[a]
        fin = [r for r in rs if r["done"]] or rs
        lo, hi = min(r['reward'] for r in rs), max(r['reward'] for r in rs)
        name = "Reference (oracle run)" if a == "Reference" else a
        lines.append(f"{name} & {rs[0]['harness']} & {len(rs)} & {len(rs) - sum(r['done'] for r in rs)} & "
                     f"{mean([r['reward'] for r in rs]):.2f} & {lo:.2f}--{hi:.2f} & "
                     f"{med([r['draws'] for r in fin]):.0f} & {med([r['play_loss'] for r in fin]):.0f} & "
                     f"{med([r['checks'] for r in fin]):.2f} " + BS + BS)
        if a == "Reference":
            lines.append(BS + "midrule")
    open("v2_rows.tex", "w", encoding="utf-8").write(NL.join(lines) + NL + BS + "bottomrule" + NL)
    print(NL.join(lines))
    print()
    for a in order:
        for r in sorted(by[a], key=lambda r: r["desk"]):
            print(f"{a:22s} {r['desk']} reward {r['reward']:.3f} raw {r['raw']:+.2f} draws {r['draws']:4d} "
                  f"play_loss {r['play_loss']:5d} checks {r['checks']} {'' if r['done'] else 'TIMEOUT'}")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    # fixed categorical order (Okabe-Ito), one marker shape per agent so identity is not colour-alone
    style = {
        "Claude Opus 5.5": ("#0072B2", "o"), "Claude Sonnet 5.5": ("#56B4E9", "s"),
        "Gemini 4 Argon": ("#009E73", "D"), "Gemini 4 Carbon": ("#882255", "h"), "Kimi K3.1 Pro": ("#E69F00", "^"),
        "MiniMax-M3": ("#CC79A7", "v"), "DeepSeek V4.1 Flash": ("#D55E00", "P"),
        "GPT-5.6 Terra": ("#000000", "X"), "Nemotron 3 Ultra": ("#999999", "*"),
    }
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    ymax = 2700
    for total in (400, 1000, 1600):
        ax.plot([0, total], [total, 0], color="#bbbbbb", lw=0.8, zorder=1)
        ax.text(8, total + 25, f"total loss \\${total}", color="#888888", fontsize=6.5, va="bottom")
    refx = [REF_SPEND] * len(DESK)
    refy = [dp - vref - REF_SPEND for dp, vref in DESK.values()]
    ax.scatter(refx, refy, marker="_", s=260, color="#444444", lw=2, zorder=3, label="Reference (expected, 6 desks)")
    for a in order:
        if a not in style:
            continue
        c, mk = style[a]
        rs = [r for r in by[a] if r["done"]]
        if not rs:
            continue
        ax.scatter([r["draws"] for r in rs], [min(r["play_loss"], ymax) for r in rs], marker=mk, s=46, color=c,
                   edgecolor="white", linewidth=0.6, zorder=4, label=f"{a} (n={len(rs)})")
    ax.set_xlim(0, 1050)
    ax.set_ylim(-60, ymax + 60)
    ax.set_xlabel("Sandbox spend (\\$; 1 per calibration draw)")
    ax.set_ylabel("Play loss vs. true-model DP (\\$)")
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(color="#eeeeee", lw=0.6, zorder=0)
    ax.legend(fontsize=7, frameon=False, loc="upper left", bbox_to_anchor=(1.01, 1.0))
    fig.tight_layout()
    fig.savefig("fig_v2.pdf")
    fig.savefig("fig_v2.png", dpi=160)


if __name__ == "__main__":
    main()
