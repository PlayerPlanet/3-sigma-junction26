"""Credit underwriting / lot acceptance task with binned noisy checks; exact DP over (check, bin) counts.

Hidden state: one of K types with known default probability pd[t] and a stated prior.
Checks e = 0..E-1 each cost c; a check returns reading = mu[e, t] + noise_e, reported in one of B bins
(fixed edges). noise_e is Gaussian(0, sigma_e) ("light") or Cauchy(0, s_e) ("heavy"); bin probabilities
are computed exactly from the CDF. At most T checks in total; approve / decline at any time.
Approve pays the exact expectation given the true type: A[t] = (1 - pd[t]) * M - pd[t] * LGD; decline pays 0.

The posterior depends only on the count vector n[e, b], so the DP is keyed on that vector. It is solved by
layers (total count n = 0..T) with numpy, using a fixed enumeration of all count vectors.
"""
import math
import numpy as np
from scipy.stats import norm

K = 6
E = 3
B = 6
T = 8
M = 1000.0          # margin if repaid
COST = 20.0         # cost per check
PD = np.array([0.02, 0.05, 0.12, 0.30, 0.60, 0.90])
EDGES = np.array([560.0, 630.0, 690.0, 750.0, 820.0])     # B-1 inner edges; tail bins are wide
BIN_LABELS = ["below 560", "560 to under 630", "630 to under 690", "690 to under 750", "750 to under 820", "820 or above"]
TOL = 1e-6
SIG_RANGE = (70.0, 110.0)


def approve_values(PR):
    return (1 - PD) * M - PD * (PR * M)


# ---------------------------------------------------------------- noise models
def cdf(x, scale, tail):
    x = np.asarray(x, float)
    if tail == "light":
        return norm.cdf(x / scale)
    return 0.5 + np.arctan(x / scale) / math.pi


def ppf(u, scale, tail):
    if tail == "light":
        return scale * norm.ppf(u)
    return scale * np.tan(math.pi * (u - 0.5))


def bin_probs(mu, scale, tail):
    """P(bin b | location mu) for one check; returns (K, B)."""
    mu = np.asarray(mu, float)
    F = cdf(EDGES[None, :] - mu[:, None], scale, tail)          # K x (B-1)
    F = np.concatenate([np.zeros((len(mu), 1)), F, np.ones((len(mu), 1))], 1)
    p = np.diff(F, axis=1)
    return np.clip(p, 1e-300, 1)


def bin_of(x):
    return int(np.searchsorted(EDGES, x, side="right"))


def mutual_info(prior, L):
    """I(type; bin) for one reading; L is (K, B)."""
    pb = prior @ L
    return float(np.sum(prior[:, None] * L * (np.log(L) - np.log(pb[None, :]))))


# ---------------------------------------------------------------- instances
class Inst:
    def __init__(self, seed):
        rng = np.random.default_rng(seed)
        self.seed = seed
        pr = rng.dirichlet(np.full(K, 2.0))
        pr = np.maximum(np.round(pr, 2), 0.03)
        pr = np.round(pr / pr.sum(), 2)
        pr[np.argmax(pr)] += round(1 - pr.sum(), 2)
        self.prior = pr / pr.sum()
        mu = np.zeros((E, K))
        for e in range(E):
            gaps = rng.dirichlet(np.full(K - 1, 1.2)) * rng.uniform(150, 230)
            top = rng.uniform(760, 800)
            mu[e] = np.round((top - np.concatenate([[0], np.cumsum(gaps)])) / 5) * 5
        self.mu = mu
        self.sigma = np.round(rng.uniform(*SIG_RANGE, size=E))       # Gaussian sd per check
        # Cauchy scale per check matched on the mutual information of one binned reading (rounded to integer)
        self.cscale = np.array([self._match(e) for e in range(E)])
        self.L = {t: np.stack([bin_probs(mu[e], self._scale(e, t), t) for e in range(E)]) for t in ("light", "heavy")}
        self.mi = {t: [mutual_info(self.prior, self.L[t][e]) for e in range(E)] for t in ("light", "heavy")}

    def _scale(self, e, tail):
        return self.sigma[e] if tail == "light" else self.cscale[e]

    def scale(self, e, tail):
        return float(self._scale(e, tail))

    def _match(self, e):
        target = mutual_info(self.prior, bin_probs(self.mu[e], self.sigma[e], "light"))
        lo, hi = 1.0, 400.0
        for _ in range(60):
            mid = 0.5 * (lo + hi)
            if mutual_info(self.prior, bin_probs(self.mu[e], mid, "heavy")) > target:
                lo = mid
            else:
                hi = mid
        return float(max(1, round(0.5 * (lo + hi))))

    def world(self, idx_salt=0):
        """true type and the uniforms for the j-th run of each check; shared by both tails, stories, displays"""
        rng = np.random.default_rng(910_000 + 1000 * idx_salt + self.seed)
        h = int(rng.choice(K, p=self.prior))
        U = rng.random((E, T))
        return h, U

    def reading(self, e, h, u, tail):
        x = self.mu[e, h] + ppf(u, self.scale(e, tail), tail)
        return x, bin_of(x)


# ---------------------------------------------------------------- state enumeration (instance independent)
C = E * B
BASE = T + 1
POW = BASE ** np.arange(C, dtype=np.int64)


def _enumerate():
    layers = [np.zeros((1, C), np.int8)]
    last = [np.zeros(1, np.int64)]
    for n in range(T):
        cur, lst = layers[-1], last[-1]
        new, newlast = [], []
        for i in range(C):
            sel = lst <= i
            a = cur[sel].copy(); a[:, i] += 1
            new.append(a); newlast.append(np.full(len(a), i))
        layers.append(np.concatenate(new)); last.append(np.concatenate(newlast))
    codes, order = [], []
    for n in range(T + 1):
        cd = layers[n].astype(np.int64) @ POW
        o = np.argsort(cd)
        layers[n] = layers[n][o]
        codes.append(cd[o])
    child = []
    for n in range(T):
        ch = np.empty((len(codes[n]), C), np.int64)
        for i in range(C):
            ch[:, i] = np.searchsorted(codes[n + 1], codes[n] + POW[i])
        child.append(ch)
    return layers, codes, child


_ENUM = None


def enum():
    global _ENUM
    if _ENUM is None:
        _ENUM = _enumerate()
    return _ENUM


def code_of(counts):
    return int(np.asarray(counts, np.int64).reshape(-1) @ POW)


# ---------------------------------------------------------------- solver
class Solver:
    """Exact DP for (instance, tail, PR). `belief_tail` lets a policy compute posteriors with a different
    (misspecified) likelihood; values are always under the true tail."""

    def __init__(self, inst, tail, PR, c=COST):
        self.I, self.tail, self.PR, self.c = inst, tail, float(PR), float(c)
        self.A = approve_values(PR)
        self.L = inst.L[tail]                      # E x K x B
        self.logL = np.log(self.L).transpose(0, 2, 1).reshape(C, K)   # cell (e,b) -> log P(b|t,e)
        self.V = None

    def post_counts(self, counts):
        cnt = np.asarray(counts, float).reshape(-1)
        lp = np.log(self.I.prior) + cnt @ self.logL
        lp -= lp.max()
        q = np.exp(lp)
        return q / q.sum()

    def _post_layer(self, n, logL=None):
        layers, _, _ = enum()
        lp = np.log(self.I.prior)[None, :] + layers[n].astype(float) @ (self.logL if logL is None else logL)
        lp -= lp.max(1, keepdims=True)
        q = np.exp(lp)
        return q / q.sum(1, keepdims=True)

    def stop_vals(self, q):
        va = q @ self.A
        return va, np.zeros_like(va)

    def solve(self):
        layers, codes, child = enum()
        V = [None] * (T + 1)
        Qc = [None] * T
        q = self._post_layer(T)
        V[T] = np.maximum(q @ self.A, 0)
        for n in range(T - 1, -1, -1):
            q = self._post_layer(n)
            stop = np.maximum(q @ self.A, 0)
            Q = np.empty((len(q), E))
            for e in range(E):
                pb = q @ self.L[e]                 # N x B predictive
                vb = V[n + 1][child[n][:, e * B:(e + 1) * B]]
                Q[:, e] = -self.c + (pb * vb).sum(1)
            Qc[n] = Q
            V[n] = np.maximum(stop, Q.max(1))
        self.V, self.Qc = V, Qc
        return float(V[0][0])

    def V0(self):
        if self.V is None:
            self.solve()
        return float(self.V[0][0])

    def nodata(self):
        return float(max(self.I.prior @ self.A, 0.0))

    def analyse(self, counts):
        """grading info at a count state (E x B array)"""
        if self.V is None:
            self.solve()
        counts = np.asarray(counts).reshape(E, B)
        n = int(counts.sum())
        q = self.post_counts(counts)
        va = float(q @ self.A)
        if n < T:
            _, codes, _ = enum()
            i = int(np.searchsorted(codes[n], code_of(counts)))
            assert codes[n][i] == code_of(counts)
            qc = self.Qc[n][i].copy()
        else:
            qc = np.full(E, -np.inf)
        V = max(va, 0.0, float(qc.max()))
        return dict(q=q, v_approve=va, v_decline=0.0, q_cont=qc, V=V)

    # ---- exact evaluation of arbitrary count-based policies under the TRUE model
    def evaluate(self, act):
        """act[n] = int array over layer-n states: -2 decline, -1 approve, e>=0 run check e.
        Returns (value, expected #checks, P(approve))"""
        layers, codes, child = enum()
        W = N = PA = None
        for n in range(T, -1, -1):
            q = self._post_layer(n)
            a = act[n]
            w = np.where(a == -1, q @ self.A, 0.0)
            nn = np.zeros(len(q)); pa = (a == -1).astype(float)
            if n < T:
                for e in range(E):
                    m = a == e
                    if not m.any():
                        continue
                    pb = q[m] @ self.L[e]
                    ch = child[n][m][:, e * B:(e + 1) * B]
                    w[m] = -self.c + (pb * W[ch]).sum(1)
                    nn[m] = 1 + (pb * N[ch]).sum(1)
                    pa[m] = (pb * PA[ch]).sum(1)
            W, N, PA = w, nn, pa
        return float(W[0]), float(N[0]), float(PA[0])

    def dp_policy(self):
        if self.V is None:
            self.solve()
        act = []
        for n in range(T + 1):
            q = self._post_layer(n)
            va = q @ self.A
            a = np.where(va >= 0, -1, -2)
            if n < T:
                best = self.Qc[n].max(1)
                cont = best > np.maximum(va, 0) + TOL
                a = np.where(cont, self.Qc[n].argmax(1), a)
            act.append(a)
        return act

    def lookahead_policy(self, k=1):
        """continue iff some plan of <= k more checks (then forced stop) beats stopping now"""
        layers, codes, child = enum()
        act = []
        for n in range(T + 1):
            q = self._post_layer(n)
            stop = np.maximum(q @ self.A, 0)
            a = np.where(q @ self.A >= 0, -1, -2)
            if n < T:
                best, arg = self._look(q, min(k, T - n))
                cont = best > stop + TOL
                a = np.where(cont, arg, a)
            act.append(a)
        return act

    def _look(self, q, k):
        """value of best plan with at most k more checks for posteriors q (N x K); returns (best_cont, argmax)"""
        Q = np.empty((len(q), E))
        for e in range(E):
            pb = q @ self.L[e]                      # N x B
            tot = -self.c * np.ones(len(q))
            for b in range(B):
                w = q * self.L[e][:, b][None, :]
                w = w / np.maximum(w.sum(1, keepdims=True), 1e-300)
                sv = np.maximum(w @ self.A, 0)
                if k > 1:
                    bc, _ = self._look(w, k - 1)
                    sv = np.maximum(sv, bc)
                tot += pb[:, b] * sv
            Q[:, e] = tot
        return Q.max(1), Q.argmax(1)


def misspecified_policy(inst, true_tail, belief_tail, PR):
    """DP-optimal policy of an agent that believes `belief_tail` (as a count-based act list)."""
    Sb = Solver(inst, belief_tail, PR)
    return Sb.dp_policy()


# ---------------------------------------------------------------- independent brute force (small T)
def brute_V(inst, tail, PR, Tmax, hist=(), c=COST):
    """explicit recursion over ordered histories, linear-space posterior, no count keys"""
    A = approve_values(PR)
    L = inst.L[tail]
    w = inst.prior.copy()
    for e, b in hist:
        w = w * L[e][:, b]
    q = w / w.sum()
    v = max(float(q @ A), 0.0)
    if len(hist) < Tmax:
        for e in range(E):
            pb = q @ L[e]
            v = max(v, -c + sum(pb[b] * brute_V(inst, tail, PR, Tmax, hist + ((e, b),), c) for b in range(B)))
    return v
