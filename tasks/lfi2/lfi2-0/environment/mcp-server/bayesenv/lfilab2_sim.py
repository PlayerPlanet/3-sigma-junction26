"""Exact stochastic simulator of the LFI lab v2 cells (shipped to the agent as /app/lfisim.py).

Self-contained (numpy only). Implements the generative process EXACTLY with the Gillespie
direct method, one independent trajectory per cell:

  * Promoter g in {off, on}; mRNA copy number m; protein copy number p.
    At time 0 every cell is off with m = 0 and p = 0.
  * off -> on   at rate  u * k_on / (1 + (p / K)^HILL)   (negative feedback by the PROTEIN)
                 u = 1 ("standard") or 1/4 ("low_inducer"); with the feedback blocked
                 ("feedback_blocked", "blocked_low") the rate is u * k_on whatever p is.
  * on -> off   at rate  k_off
  * m -> m + 1  at rate  k_tx * f   while on, f = the cell's extrinsic factor
  * m -> m - 1  at rate  m          (mRNA degradation; this sets the time unit)
  * p -> p + 1  at rate  k_tl * m   (translation)
  * p -> p - 1  at rate  GAMMA_P * p (protein degradation, GAMMA_P = 0.25)
  * Extrinsic factor of each cell, fixed for its lifetime: f = sqrt(2)^j with j = B - 2,
    B ~ Binomial(4, 1/2), i.e. j in {-2, -1, 0, 1, 2} with probabilities (1, 4, 6, 4, 1)/16.
  * Measurement at time t kills the cell. readout "rna": each mRNA molecule is captured
    independently with probability CAPTURE_RNA; readout "protein": each protein molecule is
    captured independently with probability CAPTURE_PROTEIN. The reading is the captured count.
    One assay measures one readout.

    import lfisim
    counts = lfisim.simulate(k_on=1.0, k_off=1.0, k_tx=4.0, K=16.0, k_tl=1.0, time=4.0,
                             n_cells=500, condition="standard", readout="protein", seed=0)

Any positive parameter values are accepted (not only the prior grid). The hidden cells of the
lab are NOT simulated by this file; they are measured only through the MCP server.
"""

from __future__ import annotations

import numpy as np

HILL = 2.0
GAMMA_P = 0.25
CAPTURE_RNA = 0.2
CAPTURE_PROTEIN = 0.1
CAPTURES = {"rna": CAPTURE_RNA, "protein": CAPTURE_PROTEIN}
LOW_INDUCER = 0.25
EXTRINSIC_J = np.arange(-2, 3)
EXTRINSIC_P = np.array([1, 4, 6, 4, 1]) / 16.0
CONDITIONS = {  # name: (inducer factor u, feedback active)
    "standard": (1.0, True),
    "low_inducer": (LOW_INDUCER, True),
    "feedback_blocked": (1.0, False),
    "blocked_low": (LOW_INDUCER, False),
}


def simulate(k_on: float, k_off: float, k_tx: float, K: float, k_tl: float, time: float,
             n_cells: int, condition: str = "standard", readout: str = "rna", seed=None,
             capture: float | None = None, return_state: bool = False):
    """Captured counts of `n_cells` independent cells measured at `time`.

    readout: "rna" or "protein" (capture CAPTURE_RNA or CAPTURE_PROTEIN unless `capture` is
    given). Returns an int array (n_cells,). With return_state=True returns a dict with the
    counts and the true m, p, promoter state and extrinsic factor of every cell."""
    if condition not in CONDITIONS:
        raise ValueError(f"condition must be one of {sorted(CONDITIONS)}")
    if readout not in CAPTURES:
        raise ValueError('readout must be "rna" or "protein"')
    eta = CAPTURES[readout] if capture is None else float(capture)
    u, feedback = CONDITIONS[condition]
    rng = seed if isinstance(seed, np.random.Generator) else np.random.default_rng(seed)
    n = int(n_cells)
    f = np.sqrt(2.0) ** (rng.binomial(4, 0.5, size=n) - 2)
    g = np.zeros(n, dtype=bool)
    m = np.zeros(n, dtype=np.int64)
    p = np.zeros(n, dtype=np.int64)
    t = np.zeros(n)
    alive = np.ones(n, dtype=bool)
    while alive.any():
        idx = np.flatnonzero(alive)
        gi, mi, pi = g[idx], m[idx], p[idx]
        if feedback:
            a_on = np.where(gi, 0.0, u * k_on / (1.0 + (pi / K) ** HILL))
        else:
            a_on = np.where(gi, 0.0, u * k_on)
        a_off = np.where(gi, k_off, 0.0)
        a_tx = np.where(gi, k_tx * f[idx], 0.0)
        a_dm = mi.astype(float)
        a_tl = k_tl * mi
        a_dp = GAMMA_P * pi
        c1 = a_on + a_off
        c2 = c1 + a_tx
        c3 = c2 + a_dm
        c4 = c3 + a_tl
        total = c4 + a_dp
        tn = t[idx] + rng.exponential(1.0, size=len(idx)) / total
        done = tn > time
        alive[idx[done]] = False
        go = ~done
        if not go.any():
            break
        ii = idx[go]
        t[ii] = tn[go]
        r = rng.random(go.sum()) * total[go]
        flip = r < c1[go]
        g[ii[flip]] = ~g[ii[flip]]
        m[ii[(r >= c1[go]) & (r < c2[go])]] += 1
        m[ii[(r >= c2[go]) & (r < c3[go])]] -= 1
        p[ii[(r >= c3[go]) & (r < c4[go])]] += 1
        p[ii[r >= c4[go]]] -= 1
    x = m if readout == "rna" else p
    counts = rng.binomial(x, eta)
    if return_state:
        return {"counts": counts, "m": m, "p": p, "on": g.astype(int), "extrinsic_factor": f}
    return counts
