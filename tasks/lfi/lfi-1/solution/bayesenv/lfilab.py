"""LFI lab: likelihood-free for the agent, exact for the grader.

A single gene with a two-state promoter and negative autoregulation is expressed in single
cells. The agent measures snapshots of captured mRNA counts (scRNA-seq-like) at chosen times
after induction, then forecasts the count distribution in held-out conditions, including a
feedback-blocking drug it never ran. The agent gets the exact stochastic simulator
(`lfilab_sim.py`, shipped as /app/lfisim.py) and NO likelihood. The grader computes the exact
likelihood of every hypothesis by a finite state projection (FSP) of the chemical master
equation, so the reference posterior, the true forecasts and the reward are exact.

Model (all disclosed by `rules()`; only the four rate constants are hidden):

  * promoter off -> on at u * k_on / (1 + (m / K)^2), on -> off at k_off, transcription
    k_tx * f while on, degradation 1 per molecule. Cells start off with m = 0 at t = 0.
  * u = 1 (standard) or 1/4 (low inducer); the feedback-blocking drug removes the Hill term.
  * f = per-cell extrinsic factor sqrt(2)^j, j = Binomial(4, 1/2) - 2.
  * capture: each molecule is counted with probability 0.3 (0.6 for "deep" queries).
  * Prior: (k_on, k_off, K, k_tx) uniform on a disclosed 10 x 10 x 10 x 10 grid of
    log-spaced values with common ratio sqrt(2). Because the ratio is common, the low inducer
    (k_on / 4) and the extrinsic factor land on grid points of an extended grid, so the whole
    model needs 21,560 FSP solves (`build_fsp_tables`), done once and cached.

Exactness: the posterior is a finite sum over the 10,000 grid hypotheses with FSP
likelihoods. The FSP truncation for transcription rate r is M(r) = the 1 - 1e-10 quantile of
Poisson(r), a rigorous bound (m is stochastically dominated by an always-on immigration-death
process, whose law at any time is Poisson with mean <= r); the leaked mass is also measured
and must stay below 1e-6. Times are reached with expm(Q * 0.5) and repeated products.

    lab = LfiLab(); lab.reset(seed=0, salt="demo")
    lab.step({"condition": "standard", "time": 2, "cells": 100})
    qs = lab.finish()["queries"]
    lab.submit(lab.belief.predict(lab.queries))
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
from scipy.linalg import expm
from scipy.special import gammaln, logsumexp
from scipy.stats import binom, poisson

from .chem_lab import salted_key
from .lfilab_sim import CONDITIONS, EXTRINSIC_J, EXTRINSIC_P, HILL, LOW_INDUCER

# ---- the disclosed model -----------------------------------------------------------------

RATIO = math.sqrt(2.0)
NG = 10
GRID = {  # name: values, all log-spaced with ratio sqrt(2)
    "k_on": 0.25 * RATIO ** np.arange(NG),
    "k_off": 0.25 * RATIO ** np.arange(NG),
    "K": 1.0 * RATIO ** np.arange(NG),
    "k_tx": 2.0 * RATIO ** np.arange(NG),
}
PARAMS = ("k_on", "k_off", "K", "k_tx")
NTH = NG ** 4
LOW_SHIFT = 4                     # k_on / 4 = 4 grid steps down
EXT_SHIFT = 2                     # extrinsic j in [-2, 2] grid steps of k_tx
KON_EXT = 0.25 * RATIO ** (np.arange(NG + LOW_SHIFT) - LOW_SHIFT)
KTX_EXT = 2.0 * RATIO ** (np.arange(NG + 2 * EXT_SHIFT) - EXT_SHIFT)
CAPTURE = 0.2
QUERY_CAPTURES = (0.2, 0.9)
EXP_CONDITIONS = ("standard", "low_inducer")
QUERY_CONDITIONS = ("standard", "low_inducer", "feedback_blocked", "blocked_low")
EXP_TIMES = (0.5, 1.0, 2.0, 4.0, 8.0)
QUERY_TIMES = (0.5, 1.0, 2.0, 3.0, 4.0, 8.0, 16.0)
TIMES = (0.5, 1.0, 2.0, 3.0, 4.0, 8.0, 16.0)   # union, all multiples of DT
DT = 0.5
M_MAX = 160                       # count support 0..M_MAX (>= M(r) for every rate used)
BIN_EDGES = (0, 1, 2, 3, 5, 8, 12, 18, 26, 36)  # single-cell bins [edge_b, edge_{b+1}), last open
QUERY_TAUS = (None, 1, 5, 15)     # None: one cell's count; tau: how many of POP cells have >= tau
POP, POP_BIN = 100, 5             # population queries: bins 0-4, 5-9, ..., 95-100
NB_MAX = 0                        # derived (see _derive)
DESIGNS: list = []
QUERY_ITEMS: list = []
CELL_BUDGET = 200
MAX_ASSAYS = 6
MIN_CELLS = 10
N_QUERIES = 10
Q_MIN = 1e-4                      # submitted bin probabilities are floored here, renormalised
TRUNC_TOL = 1e-10
LEAK_MAX = 1e-6

ROOT = Path(__file__).resolve().parent
CONSTANTS_FILE = ROOT / "lfilab_constants.json"


def table_path() -> Path:
    return Path(os.environ.get("LFILAB_TABLE", ROOT.parent / "data" / "lfilab_fsp.npz"))


# ---- finite state projection -------------------------------------------------------------

def m_bound(rate: float) -> int:
    """Truncation M(rate): P(Poisson(rate) > M) < TRUNC_TOL."""
    return int(poisson.isf(TRUNC_TOL, rate)) + 1


def generator(kon: float, koff: float, K: float, ktx: float, M: int) -> np.ndarray:
    """CME generator (dp/dt = Q p) on states (g, m), index g * (M + 1) + m, m <= M.
    Transcription out of m = M leaves the projection (the leak). K = inf: no feedback."""
    m = np.arange(M + 1)
    n = 2 * (M + 1)
    a = np.full(M + 1, kon) if not np.isfinite(K) else kon / (1.0 + (m / K) ** HILL)
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
    return Q


def fsp(kon: float, koff: float, K: float, ktx: float, times=TIMES,
        M: int | None = None) -> tuple[np.ndarray, float]:
    """P(m | t) for every t in `times` (multiples of DT), starting off with m = 0.
    Returns (len(times), M_MAX + 1) array (or M + 1 if M is given) and the max leak."""
    M = m_bound(ktx) if M is None else int(M)
    out_len = max(M_MAX, M) + 1
    E = expm(generator(kon, koff, K, ktx, M) * DT)
    p = np.zeros(2 * (M + 1))
    p[0] = 1.0
    steps = [int(round(t / DT)) for t in times]
    res = np.zeros((len(times), out_len))
    k, leak = 0, 0.0
    for i, s in enumerate(steps):
        while k < s:
            p = E @ p
            k += 1
        pm = np.clip(p[:M + 1] + p[M + 1:], 0.0, None)
        leak = max(leak, 1.0 - pm.sum())
        res[i, :M + 1] = pm
    return res, leak


def _fsp_job(args):
    kind, idx, kon, koff, K, ktx = args
    res, leak = fsp(kon, koff, K, ktx)
    return kind, idx, res[:, :M_MAX + 1].astype(np.float32), leak


def fsp_jobs() -> list:
    jobs = []
    for e_on, i_off, i_K, e_tx in product(range(len(KON_EXT)), range(NG), range(NG), range(len(KTX_EXT))):
        jobs.append(("fb", (e_on, i_off, i_K, e_tx), KON_EXT[e_on], GRID["k_off"][i_off],
                     GRID["K"][i_K], KTX_EXT[e_tx]))
    for e_on, i_off, e_tx in product(range(len(KON_EXT)), range(NG), range(len(KTX_EXT))):
        jobs.append(("nf", (e_on, i_off, e_tx), KON_EXT[e_on], GRID["k_off"][i_off],
                     math.inf, KTX_EXT[e_tx]))
    return jobs


def build_fsp_tables(processes: int | None = None, path: Path | None = None, verbose=True) -> dict:
    """All FSP solves the model needs (21,560), in parallel, saved to `path` (npz)."""
    import multiprocessing as mp

    for v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        os.environ.setdefault(v, "1")
    jobs = fsp_jobs()
    T, C = len(TIMES), M_MAX + 1
    FB = np.zeros((len(KON_EXT), NG, NG, len(KTX_EXT), T, C), np.float32)
    NF = np.zeros((len(KON_EXT), NG, len(KTX_EXT), T, C), np.float32)
    t0, leak = time.time(), 0.0
    processes = processes or os.cpu_count() or 1
    if processes > 1:
        with mp.get_context("spawn").Pool(processes) as pool:
            results = pool.imap_unordered(_fsp_job, jobs, chunksize=16)
            for kind, idx, res, lk in results:
                (FB if kind == "fb" else NF)[idx] = res
                leak = max(leak, lk)
    else:
        for job in jobs:
            kind, idx, res, lk = _fsp_job(job)
            (FB if kind == "fb" else NF)[idx] = res
            leak = max(leak, lk)
    secs = time.time() - t0
    if leak > LEAK_MAX:
        raise RuntimeError(f"FSP leak {leak} exceeds {LEAK_MAX}")
    out = {"FB": FB, "NF": NF, "max_leak": np.float64(leak), "seconds": np.float64(secs),
           "processes": np.int64(processes)}
    if path is not None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez(path, **out)
    if verbose:
        print(f"FSP tables: {len(jobs)} solves, {secs:.1f} s on {processes} processes, "
              f"max leak {leak:.2e}")
    return out


@lru_cache(maxsize=1)
def fsp_tables() -> dict:
    p = table_path()
    if p.exists():
        z = np.load(p)
        return {k: z[k] for k in z.files}
    return build_fsp_tables(path=p)


# ---- capture and binning -----------------------------------------------------------------

@lru_cache(maxsize=None)
def capture_matrix(eta: float, n: int = M_MAX + 1) -> np.ndarray:
    """B[m, c] = Binomial(c; m, eta)."""
    m = np.arange(n)[:, None]
    c = np.arange(n)[None, :]
    return binom.pmf(c, m, eta)


@lru_cache(maxsize=None)
def bin_matrix(n: int = M_MAX + 1) -> np.ndarray:
    c = np.arange(n)
    b = np.searchsorted(np.array(BIN_EDGES), c, side="right") - 1
    return (b[:, None] == np.arange(len(BIN_EDGES))[None, :]).astype(float)


@lru_cache(maxsize=None)
def pop_bin_matrix() -> np.ndarray:
    k = np.arange(POP + 1)
    b = np.minimum(k // POP_BIN, POP // POP_BIN - 1)
    return (b[:, None] == np.arange(POP // POP_BIN)[None, :]).astype(float)


def item_nbins(item) -> int:
    return len(BIN_EDGES) if item[3] is None else POP // POP_BIN


def item_mask(items) -> np.ndarray:
    return np.array([[b < item_nbins(it) for b in range(NB_MAX)] for it in items])


def item_labels(item) -> list[str]:
    if item[3] is None:
        e = list(BIN_EDGES)
        out = []
        for i, lo in enumerate(e):
            hi = e[i + 1] - 1 if i + 1 < len(e) else None
            out.append(f"{lo}+" if hi is None else (str(lo) if hi == lo else f"{lo}-{hi}"))
        return out
    nb = POP // POP_BIN
    return [f"{POP_BIN * b}-{POP_BIN * b + POP_BIN - 1}" if b < nb - 1 else f"{POP_BIN * b}-{POP}"
            for b in range(nb)]


def item_dist(pc: np.ndarray, item) -> np.ndarray:
    """Distribution of query `item` over its bins (padded to NB_MAX), from P(captured count c)
    over the last axis of pc (any leading shape) at the item's capture."""
    tau = item[3]
    out = np.zeros(pc.shape[:-1] + (NB_MAX,))
    n = pc.shape[-1]
    if tau is None:
        out[..., :len(BIN_EDGES)] = pc @ bin_matrix(n)
    else:
        s = np.clip(pc[..., tau:].sum(-1), 0.0, 1.0)              # P(count >= tau)
        k = np.arange(POP + 1)
        lc = gammaln(POP + 1) - gammaln(k + 1) - gammaln(POP - k + 1)
        with np.errstate(divide="ignore", invalid="ignore"):
            lp = (lc + k * np.log(s[..., None]) + (POP - k) * np.log1p(-s[..., None]))
        pk = np.exp(np.nan_to_num(lp, nan=-np.inf))                # Binomial(POP, s), exact
        pk = np.where(s[..., None] == 0.0, (k == 0).astype(float), pk)
        pk = np.where(s[..., None] == 1.0, (k == POP).astype(float), pk)
        out[..., :POP // POP_BIN] = pk @ pop_bin_matrix()
    return out / out.sum(-1, keepdims=True)


def clamp_dist(q: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Floor every valid bin at Q_MIN and renormalise; padded bins stay 0."""
    q = np.where(mask, np.maximum(np.asarray(q, dtype=float), Q_MIN), 0.0)
    return q / q.sum(-1, keepdims=True)


def log_gain(truth: np.ndarray, q: np.ndarray, p0: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """sum_b p*_b (log q_b - log p0_b) over valid bins, q already clamped."""
    with np.errstate(divide="ignore", invalid="ignore"):
        d = np.where(mask, np.log(np.where(mask, q, 1.0)) - np.log(np.where(mask, p0, 1.0)), 0.0)
    return (truth * d).sum(-1)


# ---- hypothesis-level tables -------------------------------------------------------------

def theta_index(i_on: int, i_off: int, i_K: int, i_tx: int) -> int:
    return ((i_on * NG + i_off) * NG + i_K) * NG + i_tx


def theta_indices(h: int) -> tuple[int, int, int, int]:
    i_tx = h % NG
    i_K = (h // NG) % NG
    i_off = (h // NG ** 2) % NG
    i_on = h // NG ** 3
    return i_on, i_off, i_K, i_tx


def theta_values(h: int) -> dict:
    return {p: float(GRID[p][i]) for p, i in zip(PARAMS, theta_indices(h))}


def mixture_m(cond: str, extrinsic: bool = True) -> np.ndarray:
    """P(m | theta, cond, t) for all 10,000 hypotheses: (NTH, len(TIMES), M_MAX + 1)."""
    tab = fsp_tables()
    u, fb = CONDITIONS[cond]
    shift = LOW_SHIFT if u == 1.0 else 0
    js = list(zip(EXTRINSIC_J, EXTRINSIC_P)) if extrinsic else [(0, 1.0)]
    out = np.zeros((NG, NG, NG, NG, len(TIMES), M_MAX + 1), np.float32)
    for j, w in js:
        sl = slice(EXT_SHIFT + j, EXT_SHIFT + j + NG)
        if fb:
            out += np.float32(w) * tab["FB"][shift:shift + NG, :, :, sl]
        else:
            out += np.float32(w) * tab["NF"][shift:shift + NG, :, None, sl]
    return out.reshape(NTH, len(TIMES), M_MAX + 1)


class Model:
    """Likelihood and query tables over the 10,000 hypotheses (from the FSP tables).

    logL[h, d, c]  log P(captured count c | hypothesis h, design d)
    QT[h, q, b]    P(bin b | h, query item q), padded to NB_MAX bins
    p0[q, b]       prior predictive of query item q (floored like a submission)
    C              prior average gain of submitting the truth (the normalising constant)
    """

    def __init__(self, extrinsic: bool = True):
        self.extrinsic = extrinsic
        L = np.zeros((NTH, len(DESIGNS), M_MAX + 1), np.float32)
        QT = np.zeros((NTH, len(QUERY_ITEMS), NB_MAX), np.float32)
        caps = set(QUERY_CAPTURES) | {CAPTURE}
        B = {e: capture_matrix(e).astype(np.float32) for e in caps}
        for cond in dict.fromkeys(tuple(QUERY_CONDITIONS) + tuple(EXP_CONDITIONS)):
            pm = mixture_m(cond, extrinsic)
            for ti, t in enumerate(TIMES):
                if cond in EXP_CONDITIONS and t in EXP_TIMES:
                    L[:, DESIGNS.index((cond, t))] = pm[:, ti] @ B[CAPTURE]
                if cond in QUERY_CONDITIONS and t in QUERY_TIMES:
                    for e in QUERY_CAPTURES:
                        pc = (pm[:, ti] @ B[e]).astype(np.float64)
                        for tau in QUERY_TAUS:
                            it = (cond, t, e, tau)
                            QT[:, QUERY_ITEMS.index(it)] = item_dist(pc, it)
        self.L = L
        # float32 log-likelihoods, floored at log(1e-37) = -85 per cell: a count whose FSP
        # probability is below 1e-37 is treated as impossible (it is, up to the truncation)
        self.logL = np.log(np.maximum(L, np.float32(1e-37)))
        self.QT = QT
        self.mask = item_mask(QUERY_ITEMS)
        # the baseline of the score: the prior predictive with the same floor as submissions
        p0 = QT.astype(np.float64).mean(0)
        for _ in range(100):          # a fixed point of the floor, so that submitting p0 scores 0
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
def model(extrinsic: bool = True) -> Model:
    return Model(extrinsic)


@lru_cache(maxsize=1)
def constants() -> dict:
    """Prior predictive of every query item and the normalising constant C (computed from the
    full FSP tables by `write_constants`, stored in lfilab_constants.json so that the server
    does not need the tables to score)."""
    if _OVERRIDES or not CONSTANTS_FILE.exists():   # tuning runs: computed from the tables
        mdl = model(True)
        return {"p0": mdl.p0, "C": mdl.C, "items": [list(x) for x in QUERY_ITEMS]}
    d = json.loads(CONSTANTS_FILE.read_text())
    p0 = np.zeros((len(d["p0"]), NB_MAX))
    for i, row in enumerate(d["p0"]):
        p0[i, :len(row)] = row
    return {"p0": p0, "C": float(d["C"]), "items": d["items"]}


def p0_of(items) -> np.ndarray:
    p0 = constants()["p0"]
    return np.array([p0[QUERY_ITEMS.index(tuple(it))] for it in items])


_OVERRIDES: dict = {}
TUNABLE = ("CAPTURE", "QUERY_CAPTURES", "EXP_CONDITIONS", "QUERY_CONDITIONS", "EXP_TIMES",
           "QUERY_TIMES", "QUERY_TAUS", "BIN_EDGES", "CELL_BUDGET", "MAX_ASSAYS", "N_QUERIES",
           "REF_ASSAYS", "REF_CELLS", "POP", "POP_BIN")


def _derive() -> None:
    g = globals()
    g["NB_MAX"] = max(len(BIN_EDGES), POP // POP_BIN)
    g["DESIGNS"] = [(c, t) for c in EXP_CONDITIONS for t in EXP_TIMES]
    g["QUERY_ITEMS"] = [(c, t, e, tau) for c in QUERY_CONDITIONS for t in QUERY_TIMES
                        for e in QUERY_CAPTURES for tau in QUERY_TAUS]


_derive()


def configure(**kw) -> None:
    """Tuning only: override module constants that do not change the FSP tables, recompute the
    derived ones and clear every cache. configure() with no arguments is a no-op."""
    g = globals()
    for k, v in kw.items():
        if k not in TUNABLE:
            raise KeyError(f"{k} is not tunable")
        g[k] = tuple(v) if isinstance(v, list) else v
        _OVERRIDES[k] = v
    _derive()
    for f in (model, constants, bin_matrix, capture_matrix, pop_bin_matrix, _prior_eig):
        f.cache_clear()


def write_constants() -> dict:
    mdl = model(True)
    d = {"C": mdl.C,
         "p0": [mdl.p0[i, :item_nbins(it)].tolist() for i, it in enumerate(QUERY_ITEMS)],
         "items": [list(x) for x in QUERY_ITEMS],
         "note": "prior predictive of each query item and the normalising constant C, exact "
                 "sums over the 10,000-point prior grid of FSP probabilities"}
    CONSTANTS_FILE.write_text(json.dumps(d))
    constants.cache_clear()
    return d


# ---- one hypothesis, computed directly (the server uses this, not the tables) ------------

def hypothesis_pmfs(h: int) -> dict:
    """P(m | cond, t, extrinsic j) for one hypothesis, by direct FSP:
    {cond: (5, len(TIMES), M_MAX + 1)}. Same function and arguments as the tables."""
    i_on, i_off, i_K, i_tx = theta_indices(h)
    out = {}
    for cond in CONDITIONS:
        u, fb = CONDITIONS[cond]
        e_on = i_on + (LOW_SHIFT if u == 1.0 else 0)
        arr = np.zeros((len(EXTRINSIC_J), len(TIMES), M_MAX + 1))
        for k, j in enumerate(EXTRINSIC_J):
            res, leak = fsp(KON_EXT[e_on], GRID["k_off"][i_off],
                            GRID["K"][i_K] if fb else math.inf, KTX_EXT[i_tx + EXT_SHIFT + j])
            assert leak < LEAK_MAX
            arr[k] = res[:, :M_MAX + 1].astype(np.float32)   # same rounding as the tables
        out[cond] = arr
    return out


def query_truth(pmfs: dict, item) -> np.ndarray:
    cond, t, eta, _ = item
    pm = (EXTRINSIC_P.astype(np.float32) @ pmfs[cond][:, TIMES.index(t)].astype(np.float32))
    return item_dist(pm.astype(np.float64) @ capture_matrix(eta), item)


# ---- belief over the grid ----------------------------------------------------------------

class Belief:
    """Exact posterior over the 10,000 hypotheses (uniform prior) from the assays so far."""

    def __init__(self, extrinsic: bool = True):
        self.mdl = model(extrinsic)
        self.lw = np.zeros(NTH)
        self.log: list[tuple[int, np.ndarray]] = []      # (design index, counts)

    def add(self, d: int, counts) -> None:
        c = np.asarray(counts, dtype=np.int64)
        hist = np.bincount(c, minlength=M_MAX + 1).astype(np.float32)
        self.lw = self.lw + (self.mdl.logL[:, d, :] @ hist).astype(np.float64)
        self.log.append((d, c))

    def log_weights(self) -> np.ndarray:
        return self.lw - logsumexp(self.lw)

    def weights(self) -> np.ndarray:
        return np.exp(self.log_weights())

    def predict(self, items, w: np.ndarray | None = None) -> np.ndarray:
        w = self.weights() if w is None else w
        qi = [QUERY_ITEMS.index(tuple(it)) for it in items]
        return np.einsum("h,hqb->qb", w, self.mdl.QT[:, qi, :].astype(np.float64))

    def support(self, mass: float = 1 - 1e-9, cap: int = NTH) -> np.ndarray:
        w = self.weights()
        order = np.argsort(-w)
        k = int(np.searchsorted(np.cumsum(w[order]), mass)) + 1
        return order[:min(k, cap, NTH)]

    def eig(self, n_cells: int = 100, samples: int = 192, seed: int = 0) -> np.ndarray:
        """Monte Carlo expected information gain about the hypothesis of a batch of n_cells
        cells, for every design (common random numbers across designs)."""
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
            hist = r.multinomial(n_cells, Ld[hs])                       # (S, C)
            ll = hist.astype(np.float32) @ self.mdl.logL[sup, d, :].T   # (S, K)
            ll = ll.astype(np.float64)
            out[d] = float(np.mean(ll[np.arange(samples), hs] - logsumexp(ll + lw, axis=1)))
        return out


@lru_cache(maxsize=4)
def _prior_eig(n_cells: int, samples: int) -> tuple:
    return tuple(Belief().eig(n_cells, samples))


# ---- the lab -----------------------------------------------------------------------------

def parse_assay(action) -> tuple[str, float, int]:
    if not isinstance(action, dict):
        raise ValueError('an assay is {"condition": ..., "time": ..., "cells": ...}')
    extra = set(action) - {"condition", "time", "cells"}
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
    cells = action.get("cells")
    if isinstance(cells, bool) or not isinstance(cells, (int, float)) or int(cells) != cells:
        raise ValueError("cells must be an integer")
    return cond, t, int(cells)


def parse_distributions(dists, items) -> np.ndarray:
    """One distribution per query, each over that query's bins. Returns the floored and
    renormalised distributions padded to NB_MAX bins. (Rows padded with zeros to NB_MAX are
    accepted too, for in-process callers.)"""
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


class LfiLab:
    """reset -> step* -> finish -> submit. The server builds this with tables=False: it then
    needs only the FSP of the hidden hypothesis (a second), not the 10,000-hypothesis tables."""

    TAG_THETA, TAG_CELLS, TAG_QUERY = 0x1F1, 0x1F2, 0x1F3

    def __init__(self, tables: bool = True):
        self.tables = tables
        self._h: int | None = None

    def reset(self, seed: int, salt: str | None = None) -> dict:
        self.seed, self.salt = int(seed), salt
        key = lambda tag: np.random.default_rng(salted_key(seed, salt, tag))
        self._h = int(key(self.TAG_THETA).integers(NTH))
        self._cell_seed = salted_key(seed, salt, self.TAG_CELLS)
        rq = key(self.TAG_QUERY)
        self._queries = [QUERY_ITEMS[i] for i in sorted(rq.choice(len(QUERY_ITEMS), N_QUERIES,
                                                                  replace=False))]
        self.pmfs = hypothesis_pmfs(self._h)
        self.truth = np.array([query_truth(self.pmfs, it) for it in self._queries])
        self.belief = Belief() if self.tables else None
        self.history: list[dict] = []
        self.cells_used = 0
        self.finished = False
        self.result: dict | None = None
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
        cond, t, n = parse_assay(action)
        left = CELL_BUDGET - self.cells_used
        if n < MIN_CELLS or n > left:
            raise ValueError(f"cells must be between {MIN_CELLS} and the {left} cells remaining")
        k = len(self.history)
        rng = np.random.default_rng(self._cell_seed + [k])
        j = rng.choice(len(EXTRINSIC_J), size=n, p=EXTRINSIC_P)
        pm = self.pmfs[cond][:, TIMES.index(t)].astype(np.float64)
        pm = pm / pm.sum(1, keepdims=True)
        cdf = np.cumsum(pm, 1)
        m = np.array([min(int(np.searchsorted(cdf[jj], x, side="right")), M_MAX)
                      for jj, x in zip(j, rng.random(n))])
        counts = rng.binomial(m, CAPTURE)
        self.cells_used += n
        d = DESIGNS.index((cond, t))
        if self.belief is not None:
            self.belief.add(d, counts)
        rec = {"index": k, "condition": cond, "time": t, "cells": n, "counts": counts.tolist()}
        self.history.append(rec)
        return {"result": rec, "cells_remaining": CELL_BUDGET - self.cells_used,
                "assays_remaining": MAX_ASSAYS - len(self.history)}

    def queries_public(self) -> list[dict]:
        out = []
        for k, it in enumerate(self._queries):
            c, t, e, tau = it
            nb = item_nbins(it)
            p0 = p0_of([it])[0, :nb]
            q = {"index": k, "condition": c, "time": t, "capture": e}
            if tau is None:
                q["question"] = "the captured count of ONE fresh cell"
            else:
                q["question"] = (f"how many of {POP} fresh cells (independent) have a captured "
                                 f"count >= {tau}")
                q["threshold"] = tau
            q["bins"] = item_labels(it)
            q["prior_predictive"] = [round(float(x), 7) for x in p0]
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
        raw = g / c
        return {"reward_raw": raw, "score": min(1.0, max(0.0, raw)), "gain": g,
                "gain_truth": g_truth, "raw_knowing_truth": g_truth / c, "norm": c}

    def submit(self, dists, with_reference: bool = False) -> dict:
        if self._h is None:
            raise RuntimeError("call reset first")
        if self.result is not None:
            raise RuntimeError("already submitted")
        if not self.finished:
            raise RuntimeError("call finish first: the queries have not been revealed")
        out = self.score(dists)
        out["n_assays"] = len(self.history)
        out["cells_used"] = self.cells_used
        if with_reference and self.belief is not None:
            ref = run_policy("reference", self.seed, self.salt)
            out["reference_raw"] = ref.result["reward_raw"]
            out["gap_to_reference"] = out["reward_raw"] - out["reference_raw"]
            out["exact_on_own_data_raw"] = self.score(self.belief.predict(self._queries))["reward_raw"]
        self.result = out
        return out


# ---- rules shown to the agent ------------------------------------------------------------

def rules() -> dict:
    fmt = lambda a: [float(round(x, 6)) for x in a]
    cst = constants()
    return {
        "description": (
            "Single cells express one gene whose promoter switches between off and on and whose "
            "mRNA represses its own promoter. Four rate constants are hidden. You measure "
            "snapshots of captured mRNA counts in batches of cells (each cell is measured once, "
            "destructively), at chosen times after induction, within a total cell budget. Then "
            "call finish_experiments, which reveals the queries: each asks for the distribution "
            "of the captured count in some condition, time and capture efficiency, including a "
            "feedback-blocking drug and a deeper sequencing protocol that you cannot run. You "
            "submit one probability distribution over count bins per query. Only the four rate "
            "constants are hidden; everything else is given exactly below."),
        "model": {
            "state": "promoter g in {off, on}; mRNA copy number m >= 0 (an integer).",
            "initial_state": "at time 0 (induction) every cell is off with m = 0.",
            "reactions": [
                "off -> on   at rate  u * k_on / (1 + (m / K)^2)   (negative autoregulation; "
                "Hill exponent exactly 2)",
                "on -> off   at rate  k_off",
                "m -> m + 1  at rate  k_tx * f   (only while on)",
                "m -> m - 1  at rate  m   (degradation rate 1 per molecule; this defines the time unit)",
            ],
            "dynamics": ("a continuous-time Markov jump process (chemical master equation); "
                         "cells are independent."),
            "conditions": {
                "standard": "u = 1, feedback active",
                "low_inducer": f"u = {LOW_INDUCER}, feedback active",
                "feedback_blocked": "u = 1, a drug removes the feedback: off -> on at rate k_on whatever m is",
                "blocked_low": f"u = {LOW_INDUCER} and the feedback removed: off -> on at rate {LOW_INDUCER} * k_on",
            },
            "extrinsic_noise": ("each cell has its own factor f = sqrt(2)^j, fixed for the cell's "
                                "lifetime, with j = B - 2 and B ~ Binomial(4, 1/2) independently "
                                "per cell: j = -2, -1, 0, 1, 2 with probabilities 1/16, 4/16, "
                                "6/16, 4/16, 1/16."),
            "measurement": (f"at the measurement time each of the cell's m molecules is captured "
                            f"independently with probability {CAPTURE} (the 'capture "
                            "efficiency'); the reading is the number captured. Some queries ask "
                            "about a deeper protocol with a higher capture probability."),
        },
        "prior": {
            "how_drawn": ("the four rate constants are drawn independently, each uniformly "
                          "from its list of 10 values below (so 10,000 equally likely "
                          "combinations). Consecutive values differ by a factor sqrt(2)."),
            **{p: fmt(GRID[p]) for p in PARAMS},
        },
        "simulator": ("/app/lfisim.py in your container implements this generative process "
                      "exactly (Gillespie algorithm, one trajectory per cell): "
                      "lfisim.simulate(k_on, k_off, k_tx, K, time, n_cells, condition, "
                      "capture, seed). It is free to call; only your time and CPU limit it. "
                      "It does not know the hidden constants."),
        "experiments": {
            "assay": ('{"condition": one of ' + json.dumps(list(EXP_CONDITIONS)) +
                      ', "time": one of ' + json.dumps(list(EXP_TIMES)) +
                      f', "cells": integer >= {MIN_CELLS}}}; returns the captured count of '
                      f"every cell, capture {CAPTURE}. Fresh cells are induced at time 0 for "
                      "every assay."),
            "cell_budget": CELL_BUDGET,
            "max_assays": MAX_ASSAYS,
            "not_available": ("the conditions and capture probabilities not listed above exist "
                              "only as queries."),
            "invalid_actions": "rejected with an error; they consume nothing",
        },
        "queries": {
            "count": N_QUERIES,
            "kinds": {
                "single_cell": ("threshold null: the captured count of ONE fresh cell, as a "
                                f"distribution over the bins {item_labels((None, None, None, None))}."),
                "population": (f"threshold tau: the number of cells, out of {POP} fresh "
                               "independent cells, whose captured count is >= tau, as a "
                               f"distribution over the bins {item_labels((None, None, None, 1))}."),
            },
            "how_drawn": (f"drawn uniformly without replacement from the {len(QUERY_ITEMS)} "
                          f"combinations of condition {list(QUERY_CONDITIONS)}, time "
                          f"{list(QUERY_TIMES)}, capture {list(QUERY_CAPTURES)} and threshold "
                          f"{list(QUERY_TAUS)}, independently of the hidden constants and of "
                          "your experiments; revealed only by finish_experiments, each with its "
                          "bins and its prior predictive. Every query concerns fresh cells "
                          "induced at time 0 like the assay cells."),
        },
        "scoring": {
            "floor": Q_MIN,
            "formula": (
                "Let p*_k be the TRUE bin distribution of query k (computed exactly from the "
                "hidden constants, no sampling), q_k yours with every bin floored at 0.0001 "
                "and renormalised, and p0_k the prior predictive shown with the query. "
                "S = mean_k sum_b p*_kb (log q_kb - log p0_kb); raw = S / C; "
                "score = min(1, max(0, raw))."),
            "C": cst["C"],
            "C_meaning": ("the prior average of S for an answer equal to the truth; a fixed "
                          "constant, computed once."),
            "prior_predictive": "submitting p0 (or nothing) scores exactly 0.",
            "advice": ("The expected score is maximised by the exact posterior predictive "
                       "distribution given your data. Overconfident answers are punished: "
                       "log(0.0001) = -9.2."),
        },
    }


# ---- policies and baselines --------------------------------------------------------------

REF_ASSAYS, REF_CELLS = 4, 50
POLICY_DESIGNS = ("reference", "random", "steady_state", "standard_only")


def choose_design(belief: Belief, design: str, k: int, rng=None) -> int:
    if design == "reference":
        g = _prior_eig(REF_CELLS, 192) if not belief.log else belief.eig(REF_CELLS)
        return int(np.argmax(g))
    if design == "standard_only":
        g = _prior_eig(REF_CELLS, 192) if not belief.log else belief.eig(REF_CELLS)
        g = np.array(g)
        g[[i for i, (c, _) in enumerate(DESIGNS) if c != "standard"]] = -np.inf
        return int(np.argmax(g))
    if design == "random":
        return int(rng.integers(len(DESIGNS)))
    if design == "steady_state":
        return DESIGNS.index(("standard", 8.0))
    raise KeyError(design)


def run_policy(design: str, seed: int, salt: str | None = None, submit: bool = True) -> LfiLab:
    lab = LfiLab()
    lab.reset(seed, salt)
    rng = np.random.default_rng([int(seed), 0x1F9])
    if design != "prior":
        for k in range(REF_ASSAYS):
            c, t = DESIGNS[choose_design(lab.belief, design, k, rng)]
            lab.step({"condition": c, "time": t, "cells": REF_CELLS})
    lab.finish()
    if submit:
        lab.submit(p0_of(lab.queries)
                   if design == "prior" else lab.belief.predict(lab.queries))
    return lab


def reference_trajectory(seed: int, salt: str | None = None) -> dict:
    lab = run_policy("reference", seed, salt)
    return {"history": lab.history, "result": lab.result}


# -- shortcut inference rules, applied to a dataset [(design index, counts)] --

def telegraph_moments(kon, koff, ktx, u, t) -> tuple[float, float]:
    """Exact mean and variance of m(t) in the telegraph model WITHOUT feedback or extrinsic
    noise (linear moment equations), from off, m = 0. Vector state (1, g, m, gm, m^2)."""
    a = u * kon
    A = np.zeros((5, 5))
    A[1, 0] = a
    A[1, 1] = -a - koff
    A[2, 1] = ktx
    A[2, 2] = -1
    A[3, 2] = a
    A[3, 3] = -a - koff - 1
    A[3, 1] = ktx
    A[4, 3] = 2 * ktx
    A[4, 1] = ktx
    A[4, 4] = -2
    A[4, 2] = 1
    x = expm(A * t) @ np.array([1.0, 0, 0, 0, 0])
    mean, m2 = x[2], x[4]
    return mean, max(m2 - mean ** 2, 1e-9)


def fit_telegraph(data) -> np.ndarray:
    """Least-squares fit of (k_on, k_off, k_tx) of the misspecified telegraph model to the
    observed mean and variance of every assay (thinned by the capture)."""
    from scipy.optimize import least_squares

    obs = []
    for d, c in data:
        cond, t = DESIGNS[d]
        n = len(c)
        mu, var = float(np.mean(c)), float(np.var(c, ddof=1))
        obs.append((CONDITIONS[cond][0], t, mu, var, n))
    e = CAPTURE

    def res(x):
        kon, koff, ktx = np.exp(x)
        r = []
        for u, t, mu, var, n in obs:
            m, v = telegraph_moments(kon, koff, ktx, u, t)
            pm, pv = e * m, e * e * v + e * (1 - e) * m
            r.append((mu - pm) / math.sqrt(max(var, 0.25) / n))
            r.append((var - pv) / (max(var, 0.25) * math.sqrt(2.0 / max(n - 1, 1))))
        return r

    best = None
    lo, hi = np.log([1e-3, 1e-3, 0.1]), np.log([100, 100, 200])
    for x0 in product(np.log([0.3, 1.5, 5]), np.log([0.3, 1.5, 5]), np.log([5, 20, 60])):
        try:
            f = least_squares(res, np.array(x0), bounds=(lo, hi))
        except Exception:
            continue
        if best is None or f.cost < best.cost:
            best = f
    return np.exp(best.x)


def telegraph_predict(params, items) -> np.ndarray:
    kon, koff, ktx = params
    cache = {}
    out = []
    for it in items:
        cond, t, eta, _ = it
        u = CONDITIONS[cond][0]
        if u not in cache:
            M = max(m_bound(ktx), 20)
            cache[u] = fsp(u * kon, koff, math.inf, ktx, M=M)[0]
        pm = cache[u][TIMES.index(t)]
        out.append(item_dist(pm @ capture_matrix(eta, len(pm)), it))
    return np.array(out)


def abc_predict(data, items, rng, n_sim: int = 20_000, accept: int = 200,
                rich: bool = False) -> np.ndarray:
    """Rejection ABC on per-assay summaries (mean and variance; rich=True adds the share of
    zeros and the 25/50/75/90% quantiles), n_sim prior simulations of the same design, the
    closest `accept` kept. Forecasts are the EXACT query distributions averaged over the
    accepted hypotheses (generous: only the inference is approximate)."""
    mdl = model(True)
    hs = rng.integers(NTH, size=n_sim)
    cgrid = np.arange(M_MAX + 1)

    def summ(hist):
        n = hist.sum(-1, keepdims=True)
        p = hist / n
        mean = (p * cgrid).sum(-1)
        var = (p * cgrid ** 2).sum(-1) - mean ** 2
        s = [mean, var]
        if rich:
            cdf = np.cumsum(p, -1)
            s.append(p[..., 0])
            for qq in (0.25, 0.5, 0.75, 0.9):
                s.append((cdf < qq).sum(-1).astype(float))
        return np.stack(s, -1)

    S_sim, S_obs = [], []
    for d, c in data:
        L = mdl.L[hs, d, :].astype(np.float64)
        L = L / L.sum(-1, keepdims=True)
        S_sim.append(summ(rng.multinomial(len(c), L).astype(float)))
        S_obs.append(summ(np.bincount(c, minlength=M_MAX + 1)[None, :].astype(float))[0])
    S_sim, S_obs = np.concatenate(S_sim, -1), np.concatenate(S_obs, -1)
    scale = np.median(np.abs(S_sim - np.median(S_sim, 0)), 0) + 1e-9
    dist = np.sqrt((((S_sim - S_obs) / scale) ** 2).sum(-1))
    keep = hs[np.argsort(dist)[:accept]]
    qi = [QUERY_ITEMS.index(tuple(it)) for it in items]
    return mdl.QT[keep][:, qi, :].astype(np.float64).mean(0)


def shortcut_predictions(belief: Belief, items, seed: int) -> dict[str, np.ndarray]:
    w = belief.weights()
    out = {"exact": belief.predict(items)}
    onehot = np.zeros(NTH)
    onehot[int(np.argmax(w))] = 1.0
    out["plugin_map"] = belief.predict(items, onehot)
    nb = Belief(extrinsic=False)
    for d, c in belief.log:
        nb.add(d, c)
    out["fsp_no_extrinsic"] = nb.predict(items)
    rng = np.random.default_rng([seed, 0xABC])
    out["abc_mean_var"] = abc_predict(belief.log, items, rng)
    out["abc_rich"] = abc_predict(belief.log, items, rng, rich=True)
    out["telegraph_moments"] = telegraph_predict(fit_telegraph(belief.log), items)
    return out


def evaluate_seed(seed: int, salt: str | None = "calibration") -> dict:
    out: dict = {"seed": int(seed)}
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
    for design in ("random", "steady_state", "standard_only"):
        lab = run_policy(design, seed, salt, submit=False)
        out[design] = lab.score(lab.belief.predict(lab.queries))["reward_raw"]
    w = ref.belief.weights()
    out.update(post_true=float(w[ref.hypothesis]), post_max=float(w.max()),
               post_eff_n=float(1.0 / np.sum(w ** 2)),
               post_entropy=float(-np.sum(w[w > 0] * np.log(w[w > 0]))),
               map_is_true=float(np.argmax(w) == ref.hypothesis),
               n_low_inducer=float(sum(r["condition"] == "low_inducer" for r in ref.history)))
    return out


def diagnose_seed(seed: int, salt: str | None = "tune") -> dict:
    """Tuning: the reference's data, then the per-item gain (nats) of every inference rule on
    ALL query items (not only the episode's 10), plus the design baselines' exact gains."""
    ref = run_policy("reference", seed, salt, submit=False)
    items = QUERY_ITEMS
    truth = np.array([query_truth(ref.pmfs, it) for it in items])
    p0, mask = constants()["p0"], item_mask(items)
    gain = lambda q: log_gain(truth, clamp_dist(q, mask), p0, mask).tolist()
    out = {k: gain(v) for k, v in shortcut_predictions(ref.belief, items, seed).items()}
    out["truth"] = gain(truth)
    for design in ("random", "steady_state", "standard_only"):
        lab = run_policy(design, seed, salt, submit=False)
        out[design] = gain(lab.belief.predict(items))
    out["designs"] = [(r["condition"], r["time"]) for r in ref.history]
    out["post_eff_n"] = float(1.0 / np.sum(ref.belief.weights() ** 2))
    return out


DIAG = ("seed", "reference_seconds", "post_true", "post_max", "post_eff_n", "post_entropy",
        "map_is_true", "n_low_inducer")


def summarise(rows: list[dict], n_boot: int = 4000, seed: int = 0) -> dict:
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
    diag["median_post_eff_n"] = float(np.median([r["post_eff_n"] for r in rows]))
    return {"n": len(rows), "policies": out, "diagnostics": diag}


def table(summary: dict) -> str:
    lines = [f"{'policy':20s} {'raw':>7s} {'score':>6s}  ref-raw [95% CI]            ref-score [95% CI]"]
    for k, s in summary["policies"].items():
        a, b = s["ref_minus_raw_ci95"], s["ref_minus_score_ci95"]
        lines.append(f"{k:20s} {s['mean_raw']:7.3f} {s['mean_score']:6.3f}  "
                     f"{s['ref_minus_raw']:7.3f} [{a[0]:7.3f},{a[1]:7.3f}]   "
                     f"{s['ref_minus_score']:6.3f} [{b[0]:6.3f},{b[1]:6.3f}]")
    return "\n".join(lines)
