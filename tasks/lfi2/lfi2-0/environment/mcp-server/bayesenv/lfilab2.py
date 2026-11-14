"""LFI lab v2: a two-species (mRNA -> protein) autoregulated gene. Likelihood-free for the
agent, exact for the grader.

Same idea as `lfilab` (v1, docs/LFILAB.md), but the feedback acts through the PROTEIN, so the
master equation is two-dimensional (promoter x mRNA x protein, tens of thousands of states per
hypothesis), and the prior has 24,576 hypotheses. The grader solves all of them exactly offline
on Modal (62,208 sparse FSP solves, `experiments/lfilab2_modal.py::table`); in the agent's
2-vCPU, 60-minute container that is out of reach (see docs/LFILAB2.md for timings).

Model (all disclosed by `rules()` except the five rate constants):

  * promoter off -> on at u * k_on / (1 + (p / K)^2), on -> off at k_off;
    m -> m+1 at k_tx * f while on; m -> m-1 at m; p -> p+1 at k_tl * m; p -> p-1 at 0.25 p.
  * u = 1 (standard) or 1/4 (low inducer); the feedback-blocking drug removes the Hill term.
  * f = per-cell extrinsic factor sqrt(2)^j, j = Binomial(4, 1/2) - 2.
  * an assay measures ONE readout: mRNA (capture 0.2) or protein (capture 0.1).
  * prior: (k_on, k_off, K, k_tx, k_tl) uniform on a disclosed 8 x 8 x 8 x 8 x 6 grid with
    common ratio sqrt(2), so the low inducer and the extrinsic factor land on an extended grid.

Exactness: FSP with a rigorous Poisson bound for mRNA and an adaptive protein bound certified
by the FSP leak (the truncated solution is a lower bound; the missing mass is the leak, kept
below 1e-6 for every solve). Time evolution by scipy's expm_multiply. Captured-count supports
are checked to hold all but 1e-9 of the mass.
"""

from __future__ import annotations

import json
import math
import os
import time
from functools import lru_cache
from itertools import product
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from scipy.linalg import expm
from scipy.sparse.linalg import expm_multiply
from scipy.special import gammaln, logsumexp
from scipy.stats import binom, poisson

from .chem_lab import salted_key
from .lfilab_sim import EXTRINSIC_J, EXTRINSIC_P
from .lfilab2_sim import CAPTURE_PROTEIN, CAPTURE_RNA, CAPTURES, CONDITIONS, GAMMA_P, HILL, LOW_INDUCER

# ---- the disclosed model -----------------------------------------------------------------

RATIO = math.sqrt(2.0)
GRID = {
    "k_on": 0.25 * RATIO ** np.arange(8),
    "k_off": 0.25 * RATIO ** np.arange(8),
    "K": 4.0 * RATIO ** np.arange(8),
    "k_tx": 1.0 * RATIO ** np.arange(8),
    "k_tl": 0.5 * RATIO ** np.arange(6),
}
PARAMS = ("k_on", "k_off", "K", "k_tx", "k_tl")
SHAPE = tuple(len(GRID[p]) for p in PARAMS)
NTH = int(np.prod(SHAPE))
LOW_SHIFT, EXT_SHIFT = 4, 2
KON_EXT = 0.25 * RATIO ** (np.arange(SHAPE[0] + LOW_SHIFT) - LOW_SHIFT)
KTX_EXT = 1.0 * RATIO ** (np.arange(SHAPE[3] + 2 * EXT_SHIFT) - EXT_SHIFT)

READOUTS = ("rna", "protein")
EXP_CONDITIONS = ("standard", "low_inducer")
QUERY_CONDITIONS = ("standard", "low_inducer", "feedback_blocked", "blocked_low")
EXP_TIMES = (1.0, 2.0, 4.0, 8.0, 16.0)
QUERY_TIMES = (1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0)
TIMES = (1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0)      # union; expm_multiply on a step-1 grid
T_STOP = 16
TRUNC_TOL = 1e-10
LEAK_MAX = 1e-6
TAIL_MAX = 1e-9
CR = 60                           # captured mRNA support 0..CR
CP = 120                          # captured protein support 0..CP
CL = max(CR, CP) + 1
BIN_EDGES = {"rna": (0, 1, 2, 3, 5, 8, 12, 18, 26, 36),
             "protein": (0, 1, 2, 4, 6, 9, 13, 18, 25, 35)}
QUERY_TAUS = {"rna": (None, 1, 4), "protein": (None, 3, 10)}
POP, POP_BIN = 100, 5
NB_MAX = max(10, POP // POP_BIN)
CELL_BUDGET = 200
MAX_ASSAYS = 6
MIN_CELLS = 10
N_QUERIES = 10
Q_MIN = 1e-4
REF_ASSAYS, REF_CELLS = 4, 50

DESIGNS: list = []
QUERY_ITEMS: list = []

ROOT = Path(__file__).resolve().parent
CONSTANTS_FILE = ROOT / "lfilab2_constants.json"


def table_path(kind: str = "exact") -> Path:
    env = "LFILAB2_TABLE" if kind == "exact" else "LFILAB2_APPROX_TABLE"
    default = ROOT.parent / "data" / f"lfilab2_{kind}.npz"
    return Path(os.environ.get(env, default))


# ---- exact two-species FSP ---------------------------------------------------------------

def m_bound(rate: float) -> int:
    return int(poisson.isf(TRUNC_TOL, rate)) + 1


def p_guess(ktx: float, ktl: float) -> int:
    pbar = ktl * ktx / GAMMA_P
    return int(pbar + 8.0 * math.sqrt(pbar * (1.0 + ktl / (1.0 + GAMMA_P)) + 1.0) + 20)


def generator2(kon, koff, K, ktx, ktl, M, P) -> sp.csr_matrix:
    """CME generator (dp/dt = Q p) on (g, m, p), index (g * (M+1) + m) * (P+1) + p.
    Transcription out of m = M and translation out of p = P leave the projection."""
    nm, npp = M + 1, P + 1
    N = 2 * nm * npp
    g, m, p = (a.ravel() for a in np.meshgrid(np.arange(2), np.arange(nm), np.arange(npp), indexing="ij"))
    idx = np.arange(N)
    rows, cols, vals = [], [], []
    out = np.zeros(N)

    def flow(mask, dst, rate, leak_ok=None):
        rows.append(dst[mask]); cols.append(idx[mask]); vals.append(rate[mask])
        nonlocal out
        out = out + np.where(leak_ok if leak_ok is not None else mask, rate, 0.0)

    a = np.full(N, kon) if not np.isfinite(K) else kon / (1.0 + (p / K) ** HILL)
    flow(g == 0, idx + nm * npp, a)
    flow(g == 1, idx - nm * npp, np.full(N, koff))
    flow((g == 1) & (m < M), idx + npp, np.full(N, ktx), leak_ok=(g == 1))
    flow(m > 0, idx - npp, m.astype(float))
    flow(p < P, idx + 1, ktl * m, leak_ok=np.ones(N, bool))
    flow(p > 0, idx - 1, GAMMA_P * p)
    Q = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(N, N))
    return (Q - sp.diags(out)).tocsr()


@lru_cache(maxsize=None)
def cap_matrix(n_from: int, n_to: int, eta: float) -> np.ndarray:
    """B[x, c] = Binomial(c; x, eta), x < n_from, c < n_to."""
    x = np.arange(n_from)[:, None]
    c = np.arange(n_to)[None, :]
    return binom.pmf(c, x, eta)


def fsp2(kon, koff, K, ktx, ktl, P: int | None = None) -> dict:
    """Exact captured-count distributions of both readouts at every t in TIMES, from off,
    m = 0, p = 0. Returns {"rna": (T, CR+1), "protein": (T, CP+1), "leak", "tail", "N", "secs"}."""
    t0 = time.perf_counter()
    M = m_bound(ktx)
    P = p_guess(ktx, ktl) if P is None else P
    steps = [int(t) for t in TIMES]
    while True:
        Q = generator2(kon, koff, K, ktx, ktl, M, P)
        v = np.zeros(Q.shape[0])
        v[0] = 1.0
        sol = expm_multiply(Q, v, start=0, stop=T_STOP, num=T_STOP + 1, endpoint=True)
        sol = np.clip(sol[steps], 0.0, None).reshape(len(TIMES), 2, M + 1, P + 1)
        leak = float(1.0 - sol[-1].sum())
        pm = sol.sum((1, 3))
        pp = sol.sum((1, 2))
        if leak <= LEAK_MAX and pp[:, -1].max() < 1e-12:
            break
        P = int(P * 1.4) + 10
    rna = pm @ cap_matrix(M + 1, CR + 1 + 40, CAPTURE_RNA)
    prot = pp @ cap_matrix(P + 1, CP + 1 + 200, CAPTURE_PROTEIN)
    tail = max(float(rna[:, CR + 1:].sum(1).max()), float(prot[:, CP + 1:].sum(1).max()))
    return {"rna": rna[:, :CR + 1], "protein": prot[:, :CP + 1], "leak": max(leak, 0.0),
            "tail": tail, "N": 2 * (M + 1) * (P + 1), "secs": time.perf_counter() - t0}


def fsp_approx(kon, koff, K, ktx, ktl) -> dict:
    """The '1-D' approximation an agent might use: drop the protein layer from the master
    equation by quasi-steady elimination (p ~ k_tl m / gamma_p in the feedback), solve the
    1-D mRNA CME exactly, and model the protein as Poisson(k_tl m(t) / gamma_p) given m(t)."""
    M = m_bound(ktx)
    m = np.arange(M + 1)
    n = 2 * (M + 1)
    a = np.full(M + 1, kon) if not np.isfinite(K) else kon / (1.0 + (ktl * m / (GAMMA_P * K)) ** HILL)
    off, on = m, M + 1 + m
    Q = np.zeros((n, n))
    Q[on, off] += a
    Q[off, off] -= a
    Q[off, on] += koff
    Q[on, on] -= koff
    Q[on[1:], on[:-1]] += ktx
    Q[on, on] -= ktx
    for s in (off, on):
        Q[s[:-1], s[1:]] += m[1:]
        Q[s[1:], s[1:]] -= m[1:]
    E = expm(Q)
    p = np.zeros(n)
    p[0] = 1.0
    out_m, k = [], 0
    for t in TIMES:
        while k < int(t):
            p = E @ p
            k += 1
        out_m.append(np.clip(p[:M + 1] + p[M + 1:], 0, None))
    pm = np.array(out_m)
    rna = (pm @ cap_matrix(M + 1, CR + 1 + 40, CAPTURE_RNA))[:, :CR + 1]
    lam = CAPTURE_PROTEIN * ktl * m / GAMMA_P                       # thinned Poisson mean
    c = np.arange(CP + 1)
    pois = np.exp(c[None, :] * np.log(np.maximum(lam[:, None], 1e-300)) - lam[:, None] - gammaln(c + 1)[None, :])
    pois[0, :] = (c == 0)
    prot = pm @ pois
    return {"rna": rna, "protein": prot}


def fsp_jobs() -> list:
    """(kind, index) of every solve: "fb" over (e_on, i_off, i_K, e_tx, i_tl), "nf" over
    (e_on, i_off, e_tx, i_tl)."""
    jobs = []
    for e_on, i_off, i_K, e_tx, i_tl in product(range(len(KON_EXT)), range(SHAPE[1]), range(SHAPE[2]),
                                                range(len(KTX_EXT)), range(SHAPE[4])):
        jobs.append(("fb", (e_on, i_off, i_K, e_tx, i_tl)))
    for e_on, i_off, e_tx, i_tl in product(range(len(KON_EXT)), range(SHAPE[1]), range(len(KTX_EXT)),
                                           range(SHAPE[4])):
        jobs.append(("nf", (e_on, i_off, e_tx, i_tl)))
    return jobs


def job_rates(kind, idx) -> tuple:
    if kind == "fb":
        e_on, i_off, i_K, e_tx, i_tl = idx
        K = GRID["K"][i_K]
    else:
        e_on, i_off, e_tx, i_tl = idx
        K = math.inf
    return KON_EXT[e_on], GRID["k_off"][i_off], K, KTX_EXT[e_tx], GRID["k_tl"][i_tl]


def run_job(job) -> dict:
    kind, idx = job
    r = job_rates(kind, tuple(idx))
    ex = fsp2(*r)
    ap = fsp_approx(*r)
    return {"kind": kind, "idx": tuple(idx), "rna": ex["rna"].astype(np.float32),
            "protein": ex["protein"].astype(np.float32), "a_rna": ap["rna"].astype(np.float32),
            "a_protein": ap["protein"].astype(np.float32), "leak": ex["leak"], "tail": ex["tail"],
            "N": ex["N"], "secs": ex["secs"]}


def empty_tables() -> dict:
    T = len(TIMES)
    fb = (len(KON_EXT), SHAPE[1], SHAPE[2], len(KTX_EXT), SHAPE[4], T)
    nf = (len(KON_EXT), SHAPE[1], len(KTX_EXT), SHAPE[4], T)
    return {"FB_rna": np.zeros(fb + (CR + 1,), np.float32), "FB_protein": np.zeros(fb + (CP + 1,), np.float32),
            "NF_rna": np.zeros(nf + (CR + 1,), np.float32), "NF_protein": np.zeros(nf + (CP + 1,), np.float32)}


@lru_cache(maxsize=2)
def fsp_tables(kind: str = "exact") -> dict:
    p = table_path(kind)
    if not p.exists():
        raise FileNotFoundError(f"{p}: build the tables with experiments/lfilab2_modal.py::table")
    z = np.load(p)
    return {k: z[k] for k in z.files}


# ---- items, bins, scoring helpers ---------------------------------------------------------

def _derive() -> None:
    g = globals()
    g["DESIGNS"] = [(c, t, r) for c in EXP_CONDITIONS for t in EXP_TIMES for r in READOUTS]
    g["QUERY_ITEMS"] = [(c, t, r, tau) for c in QUERY_CONDITIONS for t in QUERY_TIMES
                        for r in READOUTS for tau in QUERY_TAUS[r]]


_derive()


@lru_cache(maxsize=None)
def bin_matrix(readout: str, n: int) -> np.ndarray:
    e = np.array(BIN_EDGES[readout])
    b = np.searchsorted(e, np.arange(n), side="right") - 1
    return (b[:, None] == np.arange(len(e))[None, :]).astype(float)


@lru_cache(maxsize=None)
def pop_bin_matrix() -> np.ndarray:
    k = np.arange(POP + 1)
    b = np.minimum(k // POP_BIN, POP // POP_BIN - 1)
    return (b[:, None] == np.arange(POP // POP_BIN)[None, :]).astype(float)


def item_nbins(item) -> int:
    return len(BIN_EDGES[item[2]]) if item[3] is None else POP // POP_BIN


def item_mask(items) -> np.ndarray:
    return np.array([[b < item_nbins(it) for b in range(NB_MAX)] for it in items])


def item_labels(item) -> list[str]:
    if item[3] is None:
        e = list(BIN_EDGES[item[2]])
        out = []
        for i, lo in enumerate(e):
            hi = e[i + 1] - 1 if i + 1 < len(e) else None
            out.append(f"{lo}+" if hi is None else (str(lo) if hi == lo else f"{lo}-{hi}"))
        return out
    nb = POP // POP_BIN
    return [f"{POP_BIN * b}-{POP_BIN * b + POP_BIN - 1}" if b < nb - 1 else f"{POP_BIN * b}-{POP}"
            for b in range(nb)]


def item_dist(pc: np.ndarray, item) -> np.ndarray:
    """Distribution over the item's bins (padded to NB_MAX) from P(captured count) on the last
    axis of pc (the item's readout)."""
    tau = item[3]
    out = np.zeros(pc.shape[:-1] + (NB_MAX,))
    if tau is None:
        nb = len(BIN_EDGES[item[2]])
        out[..., :nb] = pc @ bin_matrix(item[2], pc.shape[-1])
    else:
        s = np.clip(pc[..., tau:].sum(-1), 0.0, 1.0)
        k = np.arange(POP + 1)
        lc = gammaln(POP + 1) - gammaln(k + 1) - gammaln(POP - k + 1)
        with np.errstate(divide="ignore", invalid="ignore"):
            lp = lc + k * np.log(s[..., None]) + (POP - k) * np.log1p(-s[..., None])
        pk = np.exp(np.nan_to_num(lp, nan=-np.inf))
        pk = np.where(s[..., None] == 0.0, (k == 0).astype(float), pk)
        pk = np.where(s[..., None] == 1.0, (k == POP).astype(float), pk)
        out[..., :POP // POP_BIN] = pk @ pop_bin_matrix()
    return out / out.sum(-1, keepdims=True)


def clamp_dist(q: np.ndarray, mask: np.ndarray) -> np.ndarray:
    q = np.where(mask, np.maximum(np.asarray(q, dtype=float), Q_MIN), 0.0)
    return q / q.sum(-1, keepdims=True)


def log_gain(truth, q, p0, mask) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        d = np.where(mask, np.log(np.where(mask, q, 1.0)) - np.log(np.where(mask, p0, 1.0)), 0.0)
    return (truth * d).sum(-1)


# ---- hypotheses --------------------------------------------------------------------------

def theta_indices(h: int) -> tuple:
    return tuple(int(x) for x in np.unravel_index(h, SHAPE))


def theta_values(h: int) -> dict:
    return {p: float(GRID[p][i]) for p, i in zip(PARAMS, theta_indices(h))}


def mixture(cond: str, readout: str, kind: str = "exact", extrinsic: bool = True) -> np.ndarray:
    """P(captured count | h, cond, t) for all hypotheses: (NTH, len(TIMES), C+1)."""
    tab = fsp_tables(kind)
    u, fb = CONDITIONS[cond]
    s = LOW_SHIFT if u == 1.0 else 0
    n_on, n_off, n_K, n_tx, n_tl = SHAPE
    js = list(zip(EXTRINSIC_J, EXTRINSIC_P)) if extrinsic else [(0, 1.0)]
    C = (CR if readout == "rna" else CP) + 1
    out = np.zeros((n_on, n_off, n_K, n_tx, n_tl, len(TIMES), C), np.float32)
    for j, w in js:
        sl = slice(EXT_SHIFT + j, EXT_SHIFT + j + n_tx)
        if fb:
            out += np.float32(w) * tab[f"FB_{readout}"][s:s + n_on, :, :, sl]
        else:
            out += np.float32(w) * tab[f"NF_{readout}"][s:s + n_on, :, None, sl]
    return out.reshape(NTH, len(TIMES), C)


class Model:
    """logL[h, d, c] (padded to CL counts), L, QT[h, q, b], p0[q, b], C, over all hypotheses.
    kind="approx" builds the same tables from the 1-D approximation (a baseline)."""

    def __init__(self, kind: str = "exact"):
        self.kind = kind
        L = np.zeros((NTH, len(DESIGNS), CL), np.float32)
        QT = np.zeros((NTH, len(QUERY_ITEMS), NB_MAX), np.float32)
        for cond in QUERY_CONDITIONS:
            for r in READOUTS:
                pm = mixture(cond, r, kind)
                C = pm.shape[-1]
                for ti, t in enumerate(TIMES):
                    if cond in EXP_CONDITIONS and t in EXP_TIMES:
                        L[:, DESIGNS.index((cond, t, r)), :C] = pm[:, ti]
                    if t in QUERY_TIMES:
                        for tau in QUERY_TAUS[r]:
                            it = (cond, t, r, tau)
                            QT[:, QUERY_ITEMS.index(it)] = item_dist(pm[:, ti].astype(np.float64), it)
                del pm
        self.L = L
        self.logL = np.log(np.maximum(L, np.float32(1e-37)))
        self.QT = QT
        self.mask = item_mask(QUERY_ITEMS)
        p0 = QT.astype(np.float64).mean(0)
        for _ in range(100):
            p0 = clamp_dist(p0, self.mask)
        self.p0 = p0

    @property
    def C(self) -> float:
        tot = 0.0
        for q in range(len(QUERY_ITEMS)):
            t = self.QT[:, q].astype(np.float64)
            tot += log_gain(t, clamp_dist(t, self.mask[q]), self.p0[q], self.mask[q]).mean()
        return float(tot / len(QUERY_ITEMS))


@lru_cache(maxsize=2)
def model(kind: str = "exact") -> Model:
    return Model(kind)


@lru_cache(maxsize=1)
def constants() -> dict:
    if _OVERRIDES or not CONSTANTS_FILE.exists():
        mdl = model("exact")
        return {"p0": mdl.p0, "C": mdl.C}
    d = json.loads(CONSTANTS_FILE.read_text())
    p0 = np.zeros((len(d["p0"]), NB_MAX))
    for i, row in enumerate(d["p0"]):
        p0[i, :len(row)] = row
    return {"p0": p0, "C": float(d["C"])}


def p0_of(items) -> np.ndarray:
    p0 = constants()["p0"]
    return np.array([p0[QUERY_ITEMS.index(tuple(it))] for it in items])


def write_constants(path: Path = CONSTANTS_FILE) -> dict:
    mdl = model("exact")
    d = {"C": mdl.C, "p0": [mdl.p0[i, :item_nbins(it)].tolist() for i, it in enumerate(QUERY_ITEMS)],
         "items": [list(x) for x in QUERY_ITEMS],
         "note": "internal: prior predictive of each query item (NOT shown to the agent) and the "
                 "normalising constant C, exact sums over the 24,576-point prior grid"}
    Path(path).write_text(json.dumps(d))
    constants.cache_clear()
    return d


_OVERRIDES: dict = {}
TUNABLE = ("EXP_CONDITIONS", "EXP_TIMES", "CELL_BUDGET", "MAX_ASSAYS", "N_QUERIES", "REF_ASSAYS",
           "REF_CELLS", "QUERY_TAUS")


def configure(**kw) -> None:
    g = globals()
    for k, v in kw.items():
        if k not in TUNABLE:
            raise KeyError(k)
        g[k] = {a: tuple(b) for a, b in v.items()} if isinstance(v, dict) else (tuple(v) if isinstance(v, list) else v)
        _OVERRIDES[k] = v
    _derive()
    for f in (model, constants, _prior_eig):
        f.cache_clear()


# ---- one hypothesis (the server: from the exact tables, no Model needed) -----------------

def hypothesis_pmfs(h: int) -> dict:
    """{(cond, readout): (5 extrinsic levels, len(TIMES), C+1)} for one hypothesis."""
    tab = fsp_tables("exact")
    i_on, i_off, i_K, i_tx, i_tl = theta_indices(h)
    out = {}
    for cond in QUERY_CONDITIONS:
        u, fb = CONDITIONS[cond]
        e_on = i_on + (LOW_SHIFT if u == 1.0 else 0)
        for r in READOUTS:
            rows = []
            for j in EXTRINSIC_J:
                e_tx = i_tx + EXT_SHIFT + j
                a = tab[f"FB_{r}"][e_on, i_off, i_K, e_tx, i_tl] if fb else tab[f"NF_{r}"][e_on, i_off, e_tx, i_tl]
                rows.append(a)
            out[(cond, r)] = np.array(rows)
    return out


def query_truth(pmfs: dict, item) -> np.ndarray:
    cond, t, r, _ = item
    pm = EXTRINSIC_P.astype(np.float32) @ pmfs[(cond, r)][:, TIMES.index(t)]
    return item_dist(pm.astype(np.float64), item)


# ---- belief ------------------------------------------------------------------------------

class Belief:
    def __init__(self, kind: str = "exact"):
        self.mdl = model(kind)
        self.lw = np.zeros(NTH)
        self.log: list[tuple[int, np.ndarray]] = []

    def add(self, d: int, counts) -> None:
        c = np.asarray(counts, dtype=np.int64)
        hist = np.bincount(c, minlength=CL).astype(np.float32)[:CL]
        if len(np.bincount(c)) > CL:
            raise ValueError("count outside the support")
        self.lw = self.lw + (self.mdl.logL[:, d, :] @ hist).astype(np.float64)
        self.log.append((d, c))

    def log_weights(self) -> np.ndarray:
        return self.lw - logsumexp(self.lw)

    def weights(self) -> np.ndarray:
        return np.exp(self.log_weights())

    def predict(self, items, w=None) -> np.ndarray:
        w = self.weights() if w is None else w
        qi = [QUERY_ITEMS.index(tuple(it)) for it in items]
        return np.einsum("h,hqb->qb", w, self.mdl.QT[:, qi, :].astype(np.float64))

    def support(self, mass: float = 1 - 1e-9) -> np.ndarray:
        w = self.weights()
        order = np.argsort(-w)
        k = int(np.searchsorted(np.cumsum(w[order]), mass)) + 1
        return order[:min(k, NTH)]

    def eig(self, n_cells: int = 50, samples: int = 192, seed: int = 0) -> np.ndarray:
        sup = self.support()
        w = self.weights()[sup]
        w = w / w.sum()
        lw = np.log(np.maximum(w, 1e-300))
        rng = np.random.default_rng([seed, len(self.log), 0xE16])
        hs = rng.choice(len(sup), size=samples, p=w)
        out = np.zeros(len(DESIGNS))
        for d in range(len(DESIGNS)):
            Ld = self.mdl.L[sup, d, :].astype(np.float64)
            Ld = Ld / Ld.sum(-1, keepdims=True)
            r = np.random.default_rng([seed, len(self.log), d])
            hist = r.multinomial(n_cells, Ld[hs])
            ll = (hist.astype(np.float32) @ self.mdl.logL[sup, d, :].T).astype(np.float64)
            out[d] = float(np.mean(ll[np.arange(samples), hs] - logsumexp(ll + lw, axis=1)))
        return out


@lru_cache(maxsize=4)
def _prior_eig(n_cells: int, samples: int) -> tuple:
    return tuple(Belief().eig(n_cells, samples))


# ---- the lab -----------------------------------------------------------------------------

def parse_assay(action) -> tuple:
    if not isinstance(action, dict):
        raise ValueError('an assay is {"condition", "time", "readout", "cells"}')
    extra = set(action) - {"condition", "time", "readout", "cells"}
    if extra:
        raise ValueError(f"unknown fields {sorted(extra)}")
    cond = action.get("condition")
    if cond not in EXP_CONDITIONS:
        raise ValueError(f"condition must be one of {list(EXP_CONDITIONS)} "
                         "(the other conditions exist only as queries)")
    try:
        t = float(action.get("time"))
    except (TypeError, ValueError):
        raise ValueError(f"time must be one of {list(EXP_TIMES)}") from None
    if t not in EXP_TIMES:
        raise ValueError(f"time must be one of {list(EXP_TIMES)}")
    r = action.get("readout")
    if r not in READOUTS:
        raise ValueError('readout must be "rna" or "protein"')
    cells = action.get("cells")
    if isinstance(cells, bool) or not isinstance(cells, (int, float)) or int(cells) != cells:
        raise ValueError("cells must be an integer")
    return cond, t, r, int(cells)


def parse_distributions(dists, items) -> np.ndarray:
    k = len(items)
    if not isinstance(dists, (list, tuple, np.ndarray)) or len(dists) != k:
        raise ValueError(f"submit a list of {k} distributions, one per query, in query order")
    out = np.zeros((k, NB_MAX))
    for i, (row, it) in enumerate(zip(dists, items)):
        nb = item_nbins(it)
        try:
            r = np.asarray(row, dtype=float).reshape(-1)
        except (TypeError, ValueError):
            raise ValueError(f"query {i}: a distribution is a list of {nb} numbers") from None
        if len(r) == NB_MAX and nb < NB_MAX and np.all(r[nb:] == 0):
            r = r[:nb]
        if len(r) != nb:
            raise ValueError(f"query {i} has {nb} bins; got {len(r)} numbers")
        if not np.all(np.isfinite(r)) or np.any(r < 0):
            raise ValueError(f"query {i}: every probability must be finite and >= 0")
        if abs(r.sum() - 1) > 1e-3:
            raise ValueError(f"query {i}: the distribution must sum to 1 (within 0.001)")
        out[i, :nb] = r
    return clamp_dist(out, item_mask(items))


class LfiLab2:
    """reset -> step* -> finish -> submit. Needs the exact FSP tables (for the hidden
    hypothesis only); tables=True also builds the Model for the exact posterior."""

    TAG_THETA, TAG_CELLS, TAG_QUERY = 0x2F1, 0x2F2, 0x2F3

    def __init__(self, tables: bool = True):
        self.tables = tables
        self._h = None

    def reset(self, seed: int, salt: str | None = None) -> dict:
        self.seed, self.salt = int(seed), salt
        key = lambda tag: np.random.default_rng(salted_key(seed, salt, tag))
        self._h = int(key(self.TAG_THETA).integers(NTH))
        self._cell_seed = salted_key(seed, salt, self.TAG_CELLS)
        rq = key(self.TAG_QUERY)
        self._queries = [QUERY_ITEMS[i] for i in sorted(rq.choice(len(QUERY_ITEMS), N_QUERIES, replace=False))]
        self.pmfs = hypothesis_pmfs(self._h)
        self.truth = np.array([query_truth(self.pmfs, it) for it in self._queries])
        self.belief = Belief() if self.tables else None
        self.history: list[dict] = []
        self.cells_used = 0
        self.finished = False
        self.result = None
        return {"cells_remaining": CELL_BUDGET, "assays_remaining": MAX_ASSAYS}

    @property
    def theta(self) -> dict:
        return theta_values(self._h)

    @property
    def hypothesis(self) -> int:
        return self._h

    def step(self, action) -> dict:
        if self._h is None:
            raise RuntimeError("call reset first")
        if self.finished:
            raise RuntimeError("the experiment phase is over")
        if len(self.history) >= MAX_ASSAYS:
            raise RuntimeError(f"assay limit reached ({MAX_ASSAYS})")
        cond, t, r, n = parse_assay(action)
        left = CELL_BUDGET - self.cells_used
        if n < MIN_CELLS or n > left:
            raise ValueError(f"cells must be between {MIN_CELLS} and the {left} cells remaining")
        k = len(self.history)
        rng = np.random.default_rng(self._cell_seed + [k])
        j = rng.choice(len(EXTRINSIC_J), size=n, p=EXTRINSIC_P)
        pm = self.pmfs[(cond, r)][:, TIMES.index(t)].astype(np.float64)
        cdf = np.cumsum(pm / pm.sum(1, keepdims=True), 1)
        counts = np.array([min(int(np.searchsorted(cdf[jj], x, side="right")), pm.shape[1] - 1)
                           for jj, x in zip(j, rng.random(n))])
        self.cells_used += n
        if self.belief is not None:
            self.belief.add(DESIGNS.index((cond, t, r)), counts)
        rec = {"index": k, "condition": cond, "time": t, "readout": r, "cells": n,
               "counts": counts.tolist()}
        self.history.append(rec)
        return {"result": rec, "cells_remaining": CELL_BUDGET - self.cells_used,
                "assays_remaining": MAX_ASSAYS - len(self.history)}

    def queries_public(self) -> list[dict]:
        out = []
        for k, it in enumerate(self._queries):
            c, t, r, tau = it
            q = {"index": k, "condition": c, "time": t, "readout": r}
            if tau is None:
                q["question"] = f"the captured {r} count of ONE fresh cell"
            else:
                q["question"] = (f"how many of {POP} fresh independent cells have a captured {r} "
                                 f"count >= {tau}")
                q["threshold"] = tau
            q["bins"] = item_labels(it)
            out.append(q)
        return out

    def finish(self) -> dict:
        if self._h is None:
            raise RuntimeError("call reset first")
        self.finished = True
        return {"queries": self.queries_public(), "n_queries": N_QUERIES}

    @property
    def queries(self) -> list:
        if not self.finished:
            raise RuntimeError("queries are revealed by finish()")
        return list(self._queries)

    def score(self, dists) -> dict:
        items = self._queries
        mask = item_mask(items)
        q = parse_distributions(dists, items)
        p0, p = p0_of(items), self.truth
        g = float(np.mean(log_gain(p, q, p0, mask)))
        g_truth = float(np.mean(log_gain(p, clamp_dist(p, mask), p0, mask)))
        c = constants()["C"]
        return {"reward_raw": g / c, "score": min(1.0, max(0.0, g / c)), "gain": g,
                "gain_truth": g_truth, "raw_knowing_truth": g_truth / c, "norm": c}

    def submit(self, dists) -> dict:
        if self._h is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("already submitted")
        if not self.finished:
            raise RuntimeError("call finish first: the queries have not been revealed")
        out = self.score(dists)
        out["n_assays"] = len(self.history)
        out["cells_used"] = self.cells_used
        self.result = out
        return out


# ---- rules shown to the agent ------------------------------------------------------------

def rules() -> dict:
    fmt = lambda a: [float(round(x, 6)) for x in a]
    return {
        "description": (
            "Single cells express one gene: the promoter switches off and on, mRNA is "
            "transcribed while it is on, protein is translated from the mRNA, and the PROTEIN "
            "represses the promoter. Five rate constants are hidden. Each assay measures ONE "
            "readout (captured mRNA count or captured protein count) in a batch of fresh "
            "cells at a chosen time after induction, within a total cell budget. Then call "
            "finish_experiments, which reveals the queries: distributions of a readout in some "
            "condition and time, including a feedback-blocking drug you cannot run, and how "
            "many of 100 fresh cells exceed a threshold. You submit one probability "
            "distribution per query. Only the five rate constants are hidden; everything else "
            "is given exactly below."),
        "model": {
            "state": "promoter g in {off, on}; mRNA copy number m; protein copy number p (integers).",
            "initial_state": "at time 0 (induction) every cell is off with m = 0 and p = 0.",
            "reactions": [
                "off -> on   at rate  u * k_on / (1 + (p / K)^2)   (negative feedback by the protein; Hill exponent exactly 2)",
                "on -> off   at rate  k_off",
                "m -> m + 1  at rate  k_tx * f   (only while on)",
                "m -> m - 1  at rate  m   (mRNA degradation rate 1 per molecule; defines the time unit)",
                "p -> p + 1  at rate  k_tl * m   (translation)",
                f"p -> p - 1  at rate  {GAMMA_P} * p   (protein degradation)",
            ],
            "dynamics": "a continuous-time Markov jump process (chemical master equation); cells are independent.",
            "conditions": {
                "standard": "u = 1, feedback active",
                "low_inducer": f"u = {LOW_INDUCER}, feedback active",
                "feedback_blocked": "u = 1, a drug removes the feedback: off -> on at rate k_on whatever p is",
                "blocked_low": f"u = {LOW_INDUCER} and the feedback removed: off -> on at rate {LOW_INDUCER} * k_on",
            },
            "extrinsic_noise": ("each cell has its own factor f = sqrt(2)^j, fixed for the cell's "
                                "lifetime, with j = B - 2 and B ~ Binomial(4, 1/2) independently per "
                                "cell: j = -2, -1, 0, 1, 2 with probabilities 1/16, 4/16, 6/16, 4/16, 1/16."),
            "measurement": (f"readout 'rna': each mRNA molecule is captured independently with "
                            f"probability {CAPTURE_RNA}; readout 'protein': each protein molecule "
                            f"is captured independently with probability {CAPTURE_PROTEIN}. The "
                            "reading is the captured count. Measuring kills the cell; an assay "
                            "measures one readout."),
        },
        "prior": {
            "how_drawn": (f"the five rate constants are drawn independently, each uniformly from "
                          f"its list below ({' x '.join(str(s) for s in SHAPE)} = {NTH} equally "
                          "likely combinations). Consecutive values differ by a factor sqrt(2)."),
            **{p: fmt(GRID[p]) for p in PARAMS},
        },
        "simulator": ("/app/lfisim.py in your container implements this generative process "
                      "exactly (Gillespie algorithm, one trajectory per cell): "
                      "lfisim.simulate(k_on, k_off, k_tx, K, k_tl, time, n_cells, condition, "
                      "readout, seed). It is free to call; only your time and CPU limit it. It "
                      "does not know the hidden constants."),
        "experiments": {
            "assay": ('{"condition": one of ' + json.dumps(list(EXP_CONDITIONS)) +
                      ', "time": one of ' + json.dumps(list(EXP_TIMES)) +
                      ', "readout": "rna" or "protein", "cells": integer >= ' + str(MIN_CELLS) +
                      "}; returns the captured count of every cell. Fresh cells are induced at "
                      "time 0 for every assay."),
            "cell_budget": CELL_BUDGET,
            "max_assays": MAX_ASSAYS,
            "not_available": "feedback_blocked and blocked_low exist only as queries.",
            "invalid_actions": "rejected with an error; they consume nothing",
        },
        "queries": {
            "count": N_QUERIES,
            "kinds": {
                "single_cell": ("no threshold: the captured count (of the query's readout) of ONE "
                                f"fresh cell, over the bins {item_labels((0, 0, 'rna', None))} for "
                                f"rna and {item_labels((0, 0, 'protein', None))} for protein."),
                "population": (f"threshold tau: how many of {POP} fresh independent cells have a "
                               "captured count >= tau, over the bins "
                               f"{item_labels((0, 0, 'rna', 1))}."),
            },
            "how_drawn": (f"drawn uniformly without replacement from the {len(QUERY_ITEMS)} "
                          f"combinations of condition {list(QUERY_CONDITIONS)}, time "
                          f"{list(QUERY_TIMES)}, readout and kind (rna: no threshold, tau = "
                          f"{QUERY_TAUS['rna'][1]}, tau = {QUERY_TAUS['rna'][2]}; protein: no "
                          f"threshold, tau = {QUERY_TAUS['protein'][1]}, tau = "
                          f"{QUERY_TAUS['protein'][2]}), independently of the hidden constants "
                          "and of your experiments; revealed only by finish_experiments, each "
                          "with its bins. Queries concern fresh cells induced at time 0 like the "
                          "assay cells, measured with the same capture as the assays."),
        },
        "scoring": {
            "floor": Q_MIN,
            "formula": (
                "Let p*_k be the TRUE bin distribution of query k (computed exactly from the "
                "hidden constants, no sampling), q_k yours with every bin floored at 0.0001 and "
                "renormalised, and p0_k the prior predictive of query k (the distribution "
                "implied by the prior alone; not shown). S = mean_k sum_b p*_kb (log q_kb - "
                "log p0_kb); raw = S / C; score = min(1, max(0, raw))."),
            "C": constants()["C"],
            "C_meaning": "the prior average of S for an answer equal to the truth; a fixed constant.",
            "no_submission": "scores 0, as does submitting the prior predictive.",
            "advice": ("The expected score is maximised by the exact posterior predictive "
                       "distribution given your data. Overconfident answers are punished: "
                       "log(0.0001) = -9.2."),
        },
    }


# ---- policies and baselines --------------------------------------------------------------

def choose_design(belief: Belief, design: str, k: int, rng=None) -> int:
    if design == "reference":
        g = _prior_eig(REF_CELLS, 192) if not belief.log else belief.eig(REF_CELLS)
        return int(np.argmax(g))
    if design == "random":
        return int(rng.integers(len(DESIGNS)))
    if design == "steady_state":
        return DESIGNS.index(("standard", max(EXP_TIMES), READOUTS[k % 2]))
    raise KeyError(design)


def run_policy(design: str, seed: int, salt=None, submit: bool = True) -> LfiLab2:
    lab = LfiLab2()
    lab.reset(seed, salt)
    rng = np.random.default_rng([int(seed), 0x2F9])
    if design != "prior":
        for k in range(REF_ASSAYS):
            c, t, r = DESIGNS[choose_design(lab.belief, design, k, rng)]
            lab.step({"condition": c, "time": t, "readout": r, "cells": REF_CELLS})
    lab.finish()
    if submit:
        lab.submit(p0_of(lab.queries) if design == "prior" else lab.belief.predict(lab.queries))
    return lab


def _summaries(hist: np.ndarray, readout: str, kind: str) -> np.ndarray:
    n = hist.sum(-1, keepdims=True)
    p = hist / n
    c = np.arange(hist.shape[-1])
    if kind == "hist":   # square roots of the binned proportions (Hellinger geometry)
        return np.sqrt(p @ bin_matrix(readout, hist.shape[-1]))
    mean = (p * c).sum(-1)
    var = (p * c ** 2).sum(-1) - mean ** 2
    s = [mean, var]
    if kind == "rich":
        cdf = np.cumsum(p, -1)
        s.append(p[..., 0])
        for qq in (0.25, 0.5, 0.75, 0.9):
            s.append((cdf < qq).sum(-1).astype(float))
    return np.stack(s, -1)


def abc_predict(data, items, rng, n_sim=20_000, accept=200, kind="meanvar") -> np.ndarray:
    """Rejection ABC with n_sim prior simulations of the same assays. kind "meanvar" / "rich":
    per-assay summaries scaled by their prior MAD, Euclidean distance; kind "hist": the binned
    histogram of every assay, Hellinger distance (a strong, nearly sufficient summary).
    Forecasts are the EXACT query distributions averaged over the accepted hypotheses."""
    mdl = model("exact")
    hs = rng.integers(NTH, size=n_sim)
    S_sim, S_obs = [], []
    for d, c in data:
        r = DESIGNS[d][2]
        obs = np.bincount(c, minlength=CL)[None, :CL].astype(float)
        sims = np.zeros((n_sim, CL))
        for lo in range(0, n_sim, 50_000):
            L = mdl.L[hs[lo:lo + 50_000], d, :].astype(np.float64)
            L /= L.sum(-1, keepdims=True)
            sims[lo:lo + 50_000] = rng.multinomial(len(c), L)
        S_sim.append(_summaries(sims, r, kind))
        S_obs.append(_summaries(obs, r, kind)[0])
    S_sim, S_obs = np.concatenate(S_sim, -1), np.concatenate(S_obs, -1)
    if kind == "hist":
        dist = ((S_sim - S_obs) ** 2).sum(-1)
    else:
        scale = np.median(np.abs(S_sim - np.median(S_sim, 0)), 0) + 1e-9
        dist = (((S_sim - S_obs) / scale) ** 2).sum(-1)
    keep = hs[np.argsort(dist)[:accept]]
    qi = [QUERY_ITEMS.index(tuple(it)) for it in items]
    return mdl.QT[keep][:, qi, :].astype(np.float64).mean(0)


def shortcut_predictions(belief: Belief, items, seed: int) -> dict:
    w = belief.weights()
    out = {"exact": belief.predict(items)}
    onehot = np.zeros(NTH)
    onehot[int(np.argmax(w))] = 1.0
    out["plugin_map"] = belief.predict(items, onehot)
    ab = Belief("approx")
    for d, c in belief.log:
        ab.add(d, c)
    out["approx_1d"] = ab.predict(items)
    rng = np.random.default_rng([seed, 0xABC])
    out["abc_mean_var"] = abc_predict(belief.log, items, rng, kind="meanvar")
    out["abc_rich"] = abc_predict(belief.log, items, rng, kind="rich")
    out["good_sbi"] = abc_predict(belief.log, items, rng, n_sim=200_000, accept=1000, kind="hist")
    return out


def evaluate_seed(seed: int, salt="calibration") -> dict:
    out = {"seed": int(seed)}
    t0 = time.perf_counter()
    ref = run_policy("reference", seed, salt, submit=False)
    out["reference_seconds"] = time.perf_counter() - t0
    preds = shortcut_predictions(ref.belief, ref.queries, seed)
    sc = ref.score(preds["exact"])
    out["reference"] = sc["reward_raw"]
    out["truth"] = sc["raw_knowing_truth"]
    out["prior"] = ref.score(p0_of(ref.queries))["reward_raw"]
    for k, p in preds.items():
        if k != "exact":
            out[k] = ref.score(p)["reward_raw"]
    for design in ("random", "steady_state"):
        lab = run_policy(design, seed, salt, submit=False)
        out[design] = lab.score(lab.belief.predict(lab.queries))["reward_raw"]
    w = ref.belief.weights()
    srt = np.sort(w)[::-1]
    out.update(post_true=float(w[ref.hypothesis]), post_max=float(srt[0]),
               post_eff_n=float(1.0 / np.sum(w ** 2)),
               n_for_99=float(np.searchsorted(np.cumsum(srt), 0.99) + 1),
               n_for_999=float(np.searchsorted(np.cumsum(srt), 0.999) + 1),
               map_is_true=float(np.argmax(w) == ref.hypothesis),
               n_protein=float(sum(r["readout"] == "protein" for r in ref.history)),
               n_low_inducer=float(sum(r["condition"] == "low_inducer" for r in ref.history)))
    return out


def diagnose_seed(seed: int, salt="tune") -> dict:
    """Tuning: per-item gains (nats) on ALL query items for every rule and design."""
    ref = run_policy("reference", seed, salt, submit=False)
    items = QUERY_ITEMS
    truth = np.array([query_truth(ref.pmfs, it) for it in items])
    p0, mask = constants()["p0"], item_mask(items)
    gain = lambda q: log_gain(truth, clamp_dist(q, mask), p0, mask).tolist()
    out = {k: gain(v) for k, v in shortcut_predictions(ref.belief, items, seed).items()}
    out["truth"] = gain(truth)
    for design in ("random", "steady_state"):
        lab = run_policy(design, seed, salt, submit=False)
        out[design] = gain(lab.belief.predict(items))
    out["designs"] = [(r["condition"], r["time"], r["readout"]) for r in ref.history]
    w = ref.belief.weights()
    out["post_eff_n"] = float(1.0 / np.sum(w ** 2))
    out["n_for_99"] = float(np.searchsorted(np.cumsum(np.sort(w)[::-1]), 0.99) + 1)
    return out


DIAG = ("seed", "reference_seconds", "post_true", "post_max", "post_eff_n", "n_for_99",
        "n_for_999", "map_is_true", "n_protein", "n_low_inducer")


def summarise(rows: list, n_boot: int = 4000, seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    names = [k for k in rows[0] if k not in DIAG]
    v = {k: np.array([r[k] for r in rows]) for k in names}
    idx = rng.integers(len(rows), size=(n_boot, len(rows)))
    clip = lambda a: np.clip(a, 0.0, 1.0)
    out = {}
    for k in names:
        d_raw, d_clip = v["reference"] - v[k], clip(v["reference"]) - clip(v[k])
        ci = lambda d: [float(x) for x in np.percentile(d[idx].mean(1), [2.5, 97.5])]
        out[k] = {"mean_raw": float(v[k].mean()), "mean_score": float(clip(v[k]).mean()),
                  "ref_minus_raw": float(d_raw.mean()), "ref_minus_raw_ci95": ci(d_raw),
                  "ref_minus_score": float(d_clip.mean()), "ref_minus_score_ci95": ci(d_clip),
                  "share_ref_better": float(np.mean(d_raw > 1e-12))}
    diag = {k: float(np.mean([r[k] for r in rows])) for k in DIAG if k != "seed"}
    for k in ("post_eff_n", "n_for_99", "n_for_999"):
        diag["median_" + k] = float(np.median([r[k] for r in rows]))
    return {"n": len(rows), "policies": out, "diagnostics": diag}


def table(summary: dict) -> str:
    lines = [f"{'policy':16s} {'raw':>7s} {'score':>6s}  ref-raw [95% CI]            ref-score [95% CI]"]
    for k, s in summary["policies"].items():
        a, b = s["ref_minus_raw_ci95"], s["ref_minus_score_ci95"]
        lines.append(f"{k:16s} {s['mean_raw']:7.3f} {s['mean_score']:6.3f}  "
                     f"{s['ref_minus_raw']:7.3f} [{a[0]:7.3f},{a[1]:7.3f}]   "
                     f"{s['ref_minus_score']:6.3f} [{b[0]:6.3f},{b[1]:6.3f}]")
    return "\n".join(lines)
