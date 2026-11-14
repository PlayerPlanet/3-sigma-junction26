"""Reference solver for the NeuronBench task (docs/NEURON.md). numpy only; no neuronbench import.

It uses only what an agent can legitimately use: the rules from `get_rules`, the observations
from `run_experiment`, and a forward model. NeuronBench's own forward model
(`World.simulate` / `stochastic.run_particles`) advances ONE mechanism per call and costs
1-2 s per call, so a library of candidates would take tens of minutes. `simulate_batch` below
is our own re-implementation of the same stochastic Hodgkin-Huxley model (Fox-Lu channel
noise, same constants, same integration step, same update order), vectorised over candidates
and particles: one call advances every candidate. It is checked against NeuronBench in
tests/test_neuron.py (means agree within Monte Carlo error; the random streams differ).

The method is approximate (stated per the repo rules):
  1. a fixed spread of protocols with repeats (no adaptive design),
  2. a library of candidate extra currents drawn from broad priors over generic textbook
     families (none, slow Na inactivation, I_h, low-threshold inward with inactivation,
     inactivating K, non-inactivating slow K),
  3. a Gaussian synthetic likelihood on summary features of each recording (mean test-window
     spike count; median sub-sampled voltage in each protocol segment),
  4. forecast = posterior-weighted mean simulated spike count on each test protocol.
The families were written by someone who had read the NeuronBench source, so the library is
not a blind one; see docs/NEURON.md.
"""

from __future__ import annotations

import numpy as np

ENA, EK, EL = 50.0, -77.0, -54.4
GNA, GK, GL = 120.0, 36.0, 0.3
DT = 0.025            # ms, as neuronbench.stochastic.DT
OBS_EVERY_MS = 4.0    # the recording is sub-sampled every 4 ms
BASE_MS, TAIL_MS = 20.0, 80.0

FIELDS = ("g", "E", "mvh", "mk", "mtau", "mpow", "has_h", "hvh", "hk", "htau", "hpow", "slow_na")
PLAIN = dict(g=0.0, E=0.0, mvh=-50.0, mk=5.0, mtau=10.0, mpow=1.0, has_h=0.0, hvh=-80.0, hk=4.0,
             htau=100.0, hpow=1.0, slow_na=0.0)


def build_current(segments, dt=DT):
    """Same construction as neuronbench.worlds.build_I: 20 ms baseline, the segments, 80 ms
    tail; the spike-count window starts at the last contiguous run of positive current (the
    whole trace if there is none). Returns (I, test_start, segment_bounds)."""
    segs = [(BASE_MS, 0.0)] + [(float(d), float(a)) for d, a in segments] + [(TAIL_MS, 0.0)]
    lens = [max(int(round(d / dt)), 1) for d, _ in segs]
    current = np.concatenate([np.full(n, a) for n, (_, a) in zip(lens, segs)])
    start, cur, run_start = 0, 0, None
    for (_, a), n in zip(segs, lens):
        run_start = cur if (a > 0 and run_start is None) else (None if a <= 0 else run_start)
        cur += n
        if a > 0:
            start = run_start
    bounds = np.concatenate([[0], np.cumsum(lens)])
    return current, int(start or 0), bounds


def _rates(v):
    am = 0.1 * (v + 40) / (1 - np.exp(-(v + 40) / 10) + 1e-9)
    bm = 4.0 * np.exp(-(v + 65) / 18)
    ah = 0.07 * np.exp(-(v + 65) / 20)
    bh = 1.0 / (1 + np.exp(-(v + 35) / 10))
    an = 0.01 * (v + 55) / (1 - np.exp(-(v + 55) / 10) + 1e-9)
    bn = 0.125 * np.exp(-(v + 65) / 80)
    return am, bm, ah, bh, an, bn


def stack(cands: list[dict]) -> dict:
    """List of candidate dicts (missing fields from PLAIN) -> dict of arrays."""
    return {k: np.array([float({**PLAIN, **c}[k]) for c in cands]) for k in FIELDS}


def simulate_batch(segments, cand: dict, particles: int, n_channels: float, rng,
                   blockers=(), dt=DT) -> dict:
    """Advance `particles` stochastic cells for each candidate under one protocol.

    cand: dict of arrays of length C (see FIELDS): one optional extra current
    g * m^mpow * h^hpow * (V - E) per candidate plus the slow-Na-inactivation flag.
    Returns arrays of shape (C, particles): `count` (upward 0 mV crossings in the test window)
    and `trace` of shape (C, particles, n_obs), the noise-free voltage every 4 ms.
    Blockers follow neuronbench.blockers: TTX g_Na=0, TEA g_K=0, Cd removes an extra current
    with E >= 100 mV; XE991 (by channel name "M") is not modelled here."""
    current, test_start, _ = build_current(segments, dt)
    c = {k: np.repeat(np.asarray(v, float), particles) for k, v in cand.items()}
    rows = len(c["g"])
    g_extra = c["g"].copy()
    if "Cd" in blockers:
        g_extra[c["E"] >= 100.0] = 0.0
    gna = 0.0 if "TTX" in blockers else GNA
    gk = 0.0 if "TEA" in blockers else GK
    slow = c["slow_na"] > 0.5
    any_slow = bool(slow.any())
    has_h = c["has_h"] > 0.5
    n_inv = 1.0 / float(n_channels)
    step = int(round(OBS_EVERY_MS / dt))
    v = np.full(rows, -65.0)
    am, bm, ah, bh, an, bn = _rates(v)
    m, h, n = am / (am + bm), ah / (ah + bh), an / (an + bn)
    s = np.full(rows, 1.0 / (1.0 + np.exp((-65.0 + 45.0) / 4.0)))
    x = 1.0 / (1.0 + np.exp(-(v - c["mvh"]) / c["mk"]))
    y = np.where(has_h, 1.0 / (1.0 + np.exp((v - c["hvh"]) / c["hk"])), 1.0)
    count = np.zeros(rows)
    trace = np.empty((rows, len(range(0, len(current), step))))
    sq = np.sqrt(dt)
    prev = v.copy()
    for i in range(len(current)):
        z = rng.standard_normal((6, rows))
        am, bm, ah, bh, an, bn = _rates(v)
        m = np.clip(m + dt * (am * (1 - m) - bm * m)
                    + np.sqrt(np.maximum((am * (1 - m) + bm * m) * n_inv, 0.0)) * sq * z[0], 0, 1)
        h = np.clip(h + dt * (ah * (1 - h) - bh * h)
                    + np.sqrt(np.maximum((ah * (1 - h) + bh * h) * n_inv, 0.0)) * sq * z[1], 0, 1)
        n = np.clip(n + dt * (an * (1 - n) - bn * n)
                    + np.sqrt(np.maximum((an * (1 - n) + bn * n) * n_inv, 0.0)) * sq * z[2], 0, 1)
        g_na = gna * m ** 3 * h
        if any_slow:
            s_inf = 1.0 / (1.0 + np.exp((v + 45.0) / 4.0))
            tau_s = np.where(v > -55.0, 380.0, 1500.0)
            s = np.clip(s + dt * (s_inf - s) / tau_s
                        + np.sqrt(np.maximum((s_inf * (1 - s) + (1 - s_inf) * s) / tau_s * n_inv, 0.0))
                        * sq * z[3], 0, 1)
            g_na = np.where(slow, g_na * s, g_na)
        x_inf = 1.0 / (1.0 + np.exp(-(v - c["mvh"]) / c["mk"]))
        x = np.clip(x + dt * (x_inf - x) / c["mtau"]
                    + np.sqrt(np.maximum((x_inf * (1 - x) + (1 - x_inf) * x) / c["mtau"] * n_inv, 0.0))
                    * sq * z[4], 0, 1)
        y_inf = 1.0 / (1.0 + np.exp((v - c["hvh"]) / c["hk"]))
        y_new = np.clip(y + dt * (y_inf - y) / c["htau"]
                        + np.sqrt(np.maximum((y_inf * (1 - y) + (1 - y_inf) * y) / c["htau"] * n_inv, 0.0))
                        * sq * z[5], 0, 1)
        y = np.where(has_h, y_new, 1.0)
        cur = (g_na * (v - ENA) + gk * n ** 4 * (v - EK) + GL * (v - EL)
               + g_extra * x ** c["mpow"] * y ** c["hpow"] * (v - c["E"]))
        v = np.clip(v + dt * (current[i] - cur), -95.0, 60.0)
        if i - 1 >= test_start:
            count += (prev < 0) & (v >= 0)
        if i % step == 0:
            trace[:, i // step] = v
        prev = v
    n_c = rows // particles
    return {"count": count.reshape(n_c, particles), "trace": trace.reshape(n_c, particles, -1)}


# ---- candidate library ---------------------------------------------------------------------

def _logu(rng, lo, hi, n):
    return np.exp(rng.uniform(np.log(lo), np.log(hi), n))


def library(rng, per_family: int = 40) -> tuple[list[dict], list[str]]:
    """Candidate mechanisms: generic textbook families with broad parameter priors."""
    k = per_family
    cands, fam = [dict(PLAIN), dict(PLAIN, slow_na=1.0)], ["plain", "slow_na_inactivation"]

    def add(name, **cols):
        for j in range(k):
            cands.append({**PLAIN, **{a: float(b[j]) if np.ndim(b) else float(b) for a, b in cols.items()}})
            fam.append(name)

    add("h_current", g=_logu(rng, 1, 10, k), E=rng.uniform(-45, -20, k), mvh=rng.uniform(-100, -80, k),
        mk=-rng.uniform(4, 8, k), mtau=_logu(rng, 50, 300, k))
    add("low_threshold_inward", g=_logu(rng, 1, 8, k), E=120.0, mvh=rng.uniform(-62, -48, k),
        mk=rng.uniform(4, 8, k), mtau=_logu(rng, 1, 6, k), mpow=2.0, has_h=1.0,
        hvh=rng.uniform(-92, -78, k), hk=rng.uniform(3, 6, k), htau=_logu(rng, 10, 200, k))
    add("inactivating_K", g=_logu(rng, 2, 20, k), E=-77.0, mvh=rng.uniform(-45, -20, k),
        mk=rng.uniform(6, 14, k), mtau=_logu(rng, 1, 8, k), has_h=1.0,
        hvh=rng.uniform(-90, -65, k), hk=rng.uniform(3, 7, k), htau=_logu(rng, 20, 400, k))
    add("slow_K", g=_logu(rng, 0.5, 6, k), E=-77.0, mvh=rng.uniform(-45, -25, k),
        mk=rng.uniform(6, 14, k), mtau=_logu(rng, 20, 150, k))
    return cands, fam


# ---- features and synthetic likelihood -------------------------------------------------------

def segment_medians(trace, segments):
    """Median sub-sampled voltage in the second half of each protocol segment (incl. baseline
    and tail). trace: (..., n_obs). Medians ignore the few samples that land on a spike."""
    _, _, bounds = build_current(segments)
    step = int(round(OBS_EVERY_MS / DT))
    out = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        lo, hi = int(np.ceil((a + b) / 2 / step)), int(np.ceil(b / step))
        lo = min(lo, trace.shape[-1] - 1)
        out.append(np.median(trace[..., lo:max(hi, lo + 1)], axis=-1))
    return np.stack(out, axis=-1)


def plan(rules: dict) -> list[dict]:
    """A fixed spread: every non-standard pool protocol twice, then standard steps."""
    labels = [p["label"] for p in rules["protocol_pool"]]
    advanced = [lab for lab in labels if "then" in lab or "paired" in lab or "gap" in lab]
    standard = [lab for lab in labels if lab not in advanced]
    budget, runs = int(rules["budget"]), []
    reps = 2 if budget >= 2 * len(advanced) else 1
    for lab in advanced:
        if budget >= reps:
            runs.append({"protocol": lab, "reps": reps})
            budget -= reps
    for lab in sorted(standard, key=lambda s: "long" not in s):
        if budget >= 1:
            runs.append({"protocol": lab, "reps": 1})
            budget -= 1
    return runs


class Reference:
    def __init__(self, rules: dict, seed: int = 0, per_family: int = 40, particles: int = 6):
        self.rules = rules
        self.rng = np.random.default_rng(seed)
        self.cands, self.family = library(self.rng, per_family)
        self.cand = stack(self.cands)
        self.particles = particles
        self.n_channels = float(rules["n_channels"])
        self.segments = {p["label"]: p["segments"] for p in rules["protocol_pool"]}
        self.loglik = np.zeros(len(self.cands))

    def update(self, run: dict, obs: dict) -> None:
        """Add one recording: run = the action sent, obs = what run_experiment returned."""
        seg = obs["segments"]
        sim = simulate_batch(seg, self.cand, self.particles, self.n_channels, self.rng,
                             blockers=tuple(run.get("blockers", ())))
        reps = int(obs["reps"])
        mu, sd = sim["count"].mean(1), np.maximum(sim["count"].std(1), 1.0) / np.sqrt(reps)
        ll = -0.5 * ((obs["spike_count"] - mu) / sd) ** 2 - np.log(sd)
        f = segment_medians(sim["trace"], seg)                       # (C, P, n_seg)
        f_obs = segment_medians(np.asarray(obs["voltage"], float), seg)
        fm, fs = f.mean(1), np.maximum(f.std(1), 1.5)
        ll += (-0.5 * ((f_obs - fm) / fs) ** 2 - np.log(fs)).sum(-1)
        self.loglik += ll

    def posterior(self) -> np.ndarray:
        w = np.exp(self.loglik - self.loglik.max())
        return w / w.sum()

    def family_posterior(self) -> dict:
        w = self.posterior()
        return {f: float(w[[i for i, g in enumerate(self.family) if g == f]].sum())
                for f in dict.fromkeys(self.family)}

    def forecast(self, keep: int = 30) -> dict:
        """Posterior-weighted mean spike count per test protocol, re-simulating only the
        `keep` most probable candidates (with more particles)."""
        w = self.posterior()
        top = np.argsort(w)[::-1][:keep]
        sub = {k: v[top] for k, v in self.cand.items()}
        wt = w[top] / w[top].sum()
        out = {}
        for t in self.rules["test_protocols"]:
            sim = simulate_batch(t["segments"], sub, 4 * self.particles, self.n_channels, self.rng)
            out[t["label"]] = float((wt * sim["count"].mean(1)).sum())
        return out

    def prior_forecast(self, particles: int = 60) -> dict:
        """The reference (plain) model's expected spike counts: the no-experiment forecast."""
        out = {}
        for t in self.rules["test_protocols"]:
            sim = simulate_batch(t["segments"], stack([PLAIN]), particles, self.n_channels, self.rng)
            out[t["label"]] = float(sim["count"].mean())
        return out
