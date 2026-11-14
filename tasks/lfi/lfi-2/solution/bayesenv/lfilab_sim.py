"""Exact stochastic simulator of the LFI lab's cells (shipped to the agent as /app/lfisim.py).

This file is self-contained (numpy only) and implements the generative process of the lab
EXACTLY, with the Gillespie direct method, one independent trajectory per cell:

  * Promoter g in {off, on}; mRNA copy number m. At time 0 every cell is off with m = 0.
  * off -> on   at rate  u * k_on / (1 + (m / K)^HILL)    (negative autoregulation)
                 u = 1 ("standard") or 1/4 ("low_inducer"); with the feedback blocked
                 ("feedback_blocked", "blocked_low") the rate is u * k_on whatever m is.
  * on -> off   at rate  k_off
  * m -> m + 1  at rate  k_tx * f   while on, f = the cell's extrinsic factor
  * m -> m - 1  at rate  m          (degradation; this sets the time unit)
  * Extrinsic factor of each cell, fixed for its lifetime: f = sqrt(2)^j with j = B - 2,
    B ~ Binomial(4, 1/2), i.e. j in {-2, -1, 0, 1, 2} with probabilities (1, 4, 6, 4, 1)/16.
  * Measurement at time t kills the cell: each of its m molecules is captured independently
    with probability `capture`; the reading is the captured count.

    import lfisim
    counts = lfisim.simulate(k_on=1.0, k_off=2.0, k_tx=20.0, K=5.0, time=2.0, n_cells=500,
                             condition="standard", capture=0.2, seed=0)

Any positive parameter values are accepted (not only the prior grid). The hidden cells of the
lab are NOT simulated by this file; they are measured only through the MCP server.
"""

from __future__ import annotations

import numpy as np

HILL = 2.0
CAPTURE = 0.2
LOW_INDUCER = 0.25
EXTRINSIC_J = np.arange(-2, 3)
EXTRINSIC_P = np.array([1, 4, 6, 4, 1]) / 16.0
CONDITIONS = {  # name: (inducer factor u, feedback active)
    "standard": (1.0, True),
    "low_inducer": (LOW_INDUCER, True),
    "feedback_blocked": (1.0, False),
    "blocked_low": (LOW_INDUCER, False),
}


def simulate(k_on: float, k_off: float, k_tx: float, K: float, time: float, n_cells: int,
             condition: str = "standard", capture: float = CAPTURE, seed=None,
             return_state: bool = False):
    """Captured mRNA counts of `n_cells` independent cells measured at `time`.

    Returns an int array (n_cells,). With return_state=True returns a dict with the captured
    counts, the true mRNA m, the promoter state and the extrinsic factor of every cell."""
    if condition not in CONDITIONS:
        raise ValueError(f"condition must be one of {sorted(CONDITIONS)}")
    u, feedback = CONDITIONS[condition]
    rng = seed if isinstance(seed, np.random.Generator) else np.random.default_rng(seed)
    n = int(n_cells)
    j = rng.binomial(4, 0.5, size=n) - 2
    f = np.sqrt(2.0) ** j
    g = np.zeros(n, dtype=bool)
    m = np.zeros(n, dtype=np.int64)
    t = np.zeros(n)
    alive = np.ones(n, dtype=bool)
    while alive.any():
        idx = np.flatnonzero(alive)
        gi, mi = g[idx], m[idx]
        if feedback:
            a_on = np.where(gi, 0.0, u * k_on / (1.0 + (mi / K) ** HILL))
        else:
            a_on = np.where(gi, 0.0, u * k_on)
        a_off = np.where(gi, k_off, 0.0)
        a_tx = np.where(gi, k_tx * f[idx], 0.0)
        a_deg = mi.astype(float)
        total = a_on + a_off + a_tx + a_deg
        dt = rng.exponential(1.0, size=len(idx)) / total
        tn = t[idx] + dt
        done = tn > time
        alive[idx[done]] = False
        go = ~done
        if not go.any():
            break
        ii = idx[go]
        t[ii] = tn[go]
        r = rng.random(go.sum()) * total[go]
        c1 = a_on[go]
        c2 = c1 + a_off[go]
        c3 = c2 + a_tx[go]
        flip = r < c2                      # on or off switch
        g[ii[flip]] = ~g[ii[flip]]
        m[ii[(r >= c2) & (r < c3)]] += 1
        m[ii[r >= c3]] -= 1
    counts = rng.binomial(m, capture)
    if return_state:
        return {"counts": counts, "m": m, "on": g.astype(int), "extrinsic_factor": f}
    return counts
