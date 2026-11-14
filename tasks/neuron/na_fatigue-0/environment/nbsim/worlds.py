"""Hodgkin-Huxley forward model (deterministic) and the Chan channel description."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .blockers import resolve as _resolve_blockers

ENa, EK, EL = 50.0, -77.0, -54.4


def _ab(V):
    am = 0.1 * (V + 40) / (1 - np.exp(-(V + 40) / 10) + 1e-9); bm = 4 * np.exp(-(V + 65) / 18)
    ah = 0.07 * np.exp(-(V + 65) / 20); bh = 1 / (1 + np.exp(-(V + 35) / 10))
    an = 0.01 * (V + 55) / (1 - np.exp(-(V + 55) / 10) + 1e-9); bn = 0.125 * np.exp(-(V + 65) / 80)
    return am, bm, ah, bh, an, bn


def _clip(x, a, b):
    return a if x < a else b if x > b else x


@dataclass(frozen=True)
class Chan:
    """A novel channel: g*m^mpow*(h^hpow)*(v-E). Activation m_inf = sigmoid((V-mvh)/mk) with mk<0 =>
    hyperpolarisation-activated. Inactivation optional (hvh set): h_inf = 1/(1+exp((V-hvh)/hk))."""
    name: str; g: float; E: float
    mvh: float; mk: float; mtau: float; mpow: int = 1
    hvh: float = None; hk: float = 4.0; htau: float = 1e9; hpow: int = 1


def _minf(V, vh, k):
    return 1.0 / (1.0 + np.exp(-(V - vh) / k))


def _hinf(V, vh, k):
    return 1.0 / (1.0 + np.exp((V - vh) / k))


def build_I(segments, dt=0.01, base=20.0, tail=80.0):
    """Piecewise current I(t) from [(dur_ms, amp), ...], with a leading `base` ms and trailing `tail` ms at 0.
    Returns (I, test_start_idx) where test_start_idx is the sample index after the LAST segment whose amp<=0
    that precedes a positive test (i.e. spikes are counted from the final depolarising test onward)."""
    segs = [(base, 0.0)] + list(segments) + [(tail, 0.0)]
    chunks = [np.full(max(int(round(d / dt)), 1), a) for d, a in segs]
    I = np.concatenate(chunks)
    # count window = the LAST contiguous run of positive (depolarising) current, so spikes are counted in the
    # final test pulse (after any conditioning pre-pulse or paired-pulse gap).
    lens = [len(c) for c in chunks]; amps = [a for _, a in segs]
    start, cur, run_start = 0, 0, None
    for a, L in zip(amps, lens):
        run_start = cur if (a > 0 and run_start is None) else (None if a <= 0 else run_start)
        cur += L
        if a > 0:
            start = run_start
    return I, (start or 0)


def simulate(I, test_start, extra=(), gNa=120.0, gK=36.0, gL=0.3, slow_na=False, dt=0.01, V0=-65.0,
             trace=False, block=()):
    """Integrate base Na/K/leak (+ optional slow Na inactivation) plus `extra` channels; return the spike
    count in the test window [test_start:]. If ``trace=True``, also return the full voltage trace as
    ``(cnt, V)`` with ``V`` a length-``len(I)`` array (for qualitative visualisation). `block` is an
    iterable of channel-blocker drug names (see ``blockers``); TTX zeros base Na, TEA base K, Cd the
    Ca2+-type extra channels, XE991 the M-current."""
    gNa, gK, extra = _resolve_blockers(block, gNa, gK, extra)
    n = len(I); v = V0
    am, bm, ah, bh, an, bn = _ab(v)
    m = am / (am + bm); h = ah / (ah + bh); nn = an / (an + bn)
    s = 1.0                                            # slow Na inactivation (only if slow_na)
    xs = {c.name: _minf(v, c.mvh, c.mk) for c in extra}
    hs = {c.name: (_hinf(v, c.hvh, c.hk) if c.hvh is not None else 1.0) for c in extra}
    Vs = np.empty(n) if trace else None
    cnt = 0; pv = v
    for i in range(n):
        am, bm, ah, bh, an, bn = _ab(v)
        m += dt * (am * (1 - m) - bm * m); h += dt * (ah * (1 - h) - bh * h); nn += dt * (an * (1 - nn) - bn * nn)
        m = _clip(m, 0, 1); h = _clip(h, 0, 1); nn = _clip(nn, 0, 1)
        if slow_na:
            # slow, voltage-dependent Na inactivation: inactivates moderately during a depol pulse and
            # RECOVERS very slowly, so a single long step barely differs from plain but a paired pulse (short
            # gap => little recovery) leaves the test pulse strongly fatigued.
            s_inf = 1.0 / (1.0 + np.exp((v + 45) / 4.0))
            tau_s = 380.0 if v > -55.0 else 1500.0           # fast-ish inactivation, very slow recovery
            s += dt * (s_inf - s) / tau_s; s = _clip(s, 0, 1)
        cur = gNa * m**3 * h * (s if slow_na else 1.0) * (v - ENa) + gK * nn**4 * (v - EK) + gL * (v - EL)
        for c in extra:
            xs[c.name] += dt * (_minf(v, c.mvh, c.mk) - xs[c.name]) / c.mtau
            if c.hvh is not None:
                hs[c.name] += dt * (_hinf(v, c.hvh, c.hk) - hs[c.name]) / c.htau
            xs[c.name] = _clip(xs[c.name], 0, 1); hs[c.name] = _clip(hs[c.name], 0, 1)
            cur += c.g * xs[c.name] ** c.mpow * hs[c.name] ** c.hpow * (v - c.E)
        v += dt * (I[i] - cur); v = _clip(v, -95, 80)
        if trace:
            Vs[i] = v
        if i >= test_start and pv < 0 <= v:
            cnt += 1
        pv = v
    return (cnt, Vs) if trace else cnt
