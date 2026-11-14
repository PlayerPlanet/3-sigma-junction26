"""NeuronBench as a lab: budgeted recordings from a hidden neuron, then forecasts of held-out
protocols. Wraps https://github.com/murphyk/neuronbench (MIT, Kevin Murphy; arXiv 2608.09696)
at the pinned commit below. See docs/NEURON.md.

This module needs `neuronbench` importable (it is vendored into the MCP-server image only).

Integrity. Everything in the public package is recomputable: `neuronbench.worlds.WORLDS[name]`
holds each world's true channel and `evaluator.held_out_targets(name, ...)` the exact scoring
targets, and the per-world test protocols identify the world. So the hidden cell here is NOT a
public world: it is a private world registered in this process only, built from a public
world family with (a) channel parameters jittered from (seed, salt), (b) test protocols
jittered from (seed, salt) and relabelled T1..T6, (c) the recording noise stream drawn from
(seed, salt). `discriminator()` is never exposed. All simulation and scoring still goes
through NeuronBench's own `World.run`, `evaluator.held_out_targets` and
`evaluator.forecast_mse`.
"""

from __future__ import annotations

import dataclasses
import hashlib
import math
import secrets

import numpy as np

PINNED_COMMIT = "c354622458c460b419cab821d482c879f0578377"
FAMILIES = ("z_rebound", "h_sag", "na_fatigue", "ca_rebound", "d_type", "textbook_M")
BUDGET = 12
N_CHANNELS = 100.0
TARGET_REPS = 200                       # neuronbench's default for held-out targets
AMP_RANGE = (-50.0, 30.0)               # custom step amplitude
DUR_RANGE = (1.0, 500.0)                # custom step duration, ms
MIN_PRIOR_MSE = 0.05                    # below this the task has no room; score is 0
TAG_FAMILY, TAG_PARAM, TAG_TEST, TAG_NOISE = 31, 32, 33, 34
JITTER_LOG = 0.25                       # g and time constants: x exp(U(-0.25, 0.25))
JITTER_MV = 2.0                         # half-activation voltages: + U(-2, 2) mV
JITTER_TEST = 0.08                      # test amplitudes and durations: x U(0.92, 1.08)


def salted_key(seed: int, salt: str | None, tag: int) -> list[int]:
    """Same scheme as bayesenv.chem_lab.salted_key (copied so the server image needs only
    this module): without the salt the streams are not recomputable."""
    if salt is None:
        return [int(seed), tag]
    h = hashlib.sha256(f"{salt}:{seed}".encode()).digest()
    return [int(seed), tag] + [int.from_bytes(h[i:i + 4], "little") for i in range(0, 32, 4)]


def _nb():
    import neuronbench
    return neuronbench


def hidden_spec(family: str | None, seed: int, salt: str | None) -> dict:
    """The private world: a WORLDS-style dict. family=None draws the family from the salt."""
    nb = _nb()
    if family is None:
        family = FAMILIES[int(np.random.default_rng(salted_key(seed, salt, TAG_FAMILY)).integers(len(FAMILIES)))]
    base = nb.worlds.WORLDS[family]
    rng = np.random.default_rng(salted_key(seed, salt, TAG_PARAM))
    extra = []
    for ch in base["alt"]["extra"]:
        u = rng.uniform(-1, 1, 5)
        extra.append(dataclasses.replace(
            ch, g=ch.g * math.exp(JITTER_LOG * u[0]), mvh=ch.mvh + JITTER_MV * u[1],
            mtau=ch.mtau * math.exp(JITTER_LOG * u[2]),
            hvh=None if ch.hvh is None else ch.hvh + JITTER_MV * u[3],
            htau=ch.htau * math.exp(JITTER_LOG * u[4])))
    rng = np.random.default_rng(salted_key(seed, salt, TAG_TEST))
    test = []
    for i, (_, seg) in enumerate(base["test"]):
        new = [(float(round(d * rng.uniform(1 - JITTER_TEST, 1 + JITTER_TEST))),
                round(a * rng.uniform(1 - JITTER_TEST, 1 + JITTER_TEST), 1)) for d, a in seg]
        test.append((f"T{i + 1}", new))
    return dict(desc="private", family=family, alt=dict(extra=extra, slow_na=base["alt"]["slow_na"]),
                name=base["name"], hint=base["hint"], textbook=base["textbook"],
                discriminator=base["discriminator"], test=test)


def _seg(segments) -> list[list[float]]:
    return [[float(d), float(a)] for d, a in segments]


def validate_run(action: dict, budget_left: int) -> tuple:
    """-> (label, segments, blockers, reps). Raises ValueError; never consumes budget."""
    nb = _nb()
    if not isinstance(action, dict):
        raise ValueError("action must be an object")
    unknown = set(action) - {"protocol", "amplitude", "duration_ms", "blockers", "reps"}
    if unknown:
        raise ValueError(f"unknown fields: {sorted(unknown)}")
    reps = action.get("reps", 1)
    if isinstance(reps, bool) or not isinstance(reps, int) or reps < 1:
        raise ValueError("reps must be a whole number >= 1")
    if reps > budget_left:
        raise ValueError(f"reps={reps} exceeds the remaining budget ({budget_left})")
    blockers = action.get("blockers") or []
    if not isinstance(blockers, (list, tuple)) or any(b not in nb.blockers.BLOCKERS for b in blockers):
        raise ValueError(f"blockers must be a list drawn from {sorted(nb.blockers.BLOCKERS)}")
    blockers = tuple(sorted(set(blockers)))
    label = action.get("protocol")
    custom = action.get("amplitude") is not None or action.get("duration_ms") is not None
    if label is not None and custom:
        raise ValueError("give either a pool protocol label or a custom step, not both")
    if label is not None:
        pool = dict(nb.protocols.POOL)
        if not isinstance(label, str) or label not in pool:
            raise ValueError("unknown protocol label; copy one verbatim from get_rules "
                             "(test protocols cannot be run)")
        return label, list(pool[label]), blockers, reps
    amp, dur = action.get("amplitude"), action.get("duration_ms")
    for name, x, (lo, hi) in (("amplitude", amp, AMP_RANGE), ("duration_ms", dur, DUR_RANGE)):
        if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x):
            raise ValueError(f"{name} must be a finite number (or give a pool protocol label)")
        if not lo <= x <= hi:
            raise ValueError(f"{name} must be in [{lo}, {hi}]")
    return f"custom step ({amp:g} uA, {dur:g} ms)", [(float(dur), float(amp))], blockers, reps


class NeuronLab:
    def __init__(self, target_reps: int = TARGET_REPS, n_test: int | None = None,
                 budget: int = BUDGET):
        self.target_reps, self.n_test, self.budget0 = target_reps, n_test, budget

    def reset(self, seed: int, salt: str | None, family: str | None = None) -> dict:
        nb = _nb()
        spec = hidden_spec(family, seed, salt)
        if self.n_test is not None:
            spec["test"] = spec["test"][:self.n_test]
        # A private registry entry under an unguessable key: the public World class then runs
        # and scores it unchanged. The key and the entry exist only in this process.
        self._key = "_private_" + secrets.token_hex(8)
        nb.worlds.WORLDS[self._key] = spec
        self.family = spec["family"]
        self.seed = int(seed)
        self.world = nb.World(name=self._key, stochastic=True, n_channels=N_CHANNELS, seed=self.seed,
                              _rng=np.random.default_rng(salted_key(seed, salt, TAG_NOISE)))
        self.budget = self.budget0
        self.history: list[dict] = []
        self.forecasts: dict | None = None
        self._targets = self._prior = None
        return self.rules()

    def close(self) -> None:
        _nb().worlds.WORLDS.pop(self._key, None)

    # ---- what the agent may see ----------------------------------------------------------
    def rules(self) -> dict:
        nb = _nb()
        p = self.world.problem()
        return {
            "task": ("A neuron is recorded in current clamp. Run recordings under a budget, then "
                     "forecast the mean test-window spike count of each held-out test protocol."),
            "text_prior": p["text_prior"],
            "reference_model": p["reference_model"],
            "budget": self.budget0,
            "budget_rule": p["budget_rule"],
            "n_channels": N_CHANNELS,
            "protocol_pool": [{"label": lab, "segments": _seg(seg)} for lab, seg in p["protocols"]],
            "segments_format": ("[[duration_ms, amplitude_uA], ...]; every protocol has 20 ms at 0 "
                                "before and 80 ms at 0 after. Spikes are upward 0 mV crossings, "
                                "counted from the start of the last contiguous run of positive "
                                "current (the whole trace if no segment is positive)."),
            "custom_step": {"amplitude": list(AMP_RANGE), "duration_ms": list(DUR_RANGE)},
            "blockers": dict(nb.blockers.BLOCKERS),
            "test_protocols": [{"label": lab, "segments": _seg(seg)}
                               for lab, seg in self.world.test_protocols],
            "observation": ("run_experiment returns spike_count (mean test-window count over "
                            "reps) and ONE recording (the first repeat): voltage in mV with "
                            f"Gaussian noise sd {nb.SIG_OBS} mV, sampled every 4 ms (time_ms)."),
            "forward_model": ("stochastic Hodgkin-Huxley with Fox-Lu channel noise, "
                              f"n_channels={N_CHANNELS:g}, dt={nb.DT} ms; source in /app/nbsim "
                              "(nbsim.stochastic.run_particles). Simulating costs no budget."),
            "scoring": ("score = clip(1 - MSE_you / MSE_reference, 0, 1). MSE = mean squared error "
                        "of your forecast spike counts against the true cell's expected counts "
                        f"({self.target_reps} repeats), minus {nb.evaluator.MSE_FLOOR}, floored at 0. "
                        "MSE_reference is the same for the reference model's forecast. All test "
                        "labels are required; one submission; no submission scores 0."),
        }

    # ---- actions -------------------------------------------------------------------------
    def step(self, action: dict) -> dict:
        if self.forecasts is not None:
            raise RuntimeError("forecasts already submitted; the episode is over")
        if self.budget <= 0:
            raise RuntimeError("budget exhausted")
        label, seg, blockers, reps = validate_run(action, self.budget)
        obs = self.world.run((label, seg), reps=reps, block=blockers)
        self.budget -= obs.cost
        dt = _nb().DT
        out = {"protocol": label, "segments": _seg(seg), "blockers": list(blockers), "reps": reps,
               "cost": int(obs.cost), "spike_count": float(obs.spike_count),
               "voltage": [round(float(v), 2) for v in obs.voltage],
               "time_ms": [round(float(i) * dt, 3) for i in obs.obs_idx],
               "test_start_index": int(obs.test_start),
               "budget_remaining": self.budget}
        self.history.append({k: out[k] for k in ("protocol", "blockers", "reps", "spike_count")})
        return out

    def submit(self, forecasts: dict) -> None:
        if self.forecasts is not None:
            raise RuntimeError("already submitted")
        labels = [lab for lab, _ in self.world.test_protocols]
        if not isinstance(forecasts, dict) or set(forecasts) != set(labels):
            raise ValueError(f"forecasts must have exactly these labels: {labels}")
        clean = {}
        for lab in labels:
            x = forecasts[lab]
            if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) \
                    or not 0 <= x <= 1000:
                raise ValueError(f"forecast for {lab} must be a number in [0, 1000]")
            clean[lab] = float(x)
        self.forecasts = clean

    # ---- scoring (private) ---------------------------------------------------------------
    def targets(self) -> dict:
        """NeuronBench's own held-out targets for the private cell (cached: World.
        spike_forecast_mse recomputes them on every call, about a minute each)."""
        if self._targets is None:
            self._targets = _nb().evaluator.held_out_targets(
                self._key, stochastic=True, N=N_CHANNELS, seed=self.seed, reps=self.target_reps)
        return self._targets

    def prior_forecast(self) -> dict:
        """The no-experiment forecast: the reference (plain) model's expected spike counts,
        from NeuronBench's forward model with a fixed public seed."""
        if self._prior is None:
            nb = _nb()
            out = {}
            for i, (lab, seg) in enumerate(self.world.test_protocols):
                _, _, ts = nb.stochastic.make_protocol(seg)
                v = self.world.simulate(self.world.reference_model, (lab, seg), reps=self.target_reps,
                                        rng=np.random.default_rng([self.seed, 77, i]))
                out[lab] = float(nb.features.spike_count(v, ts).mean())
            self._prior = out
        return self._prior

    def grade(self) -> dict:
        ev = _nb().evaluator
        tg, pr = self.targets(), self.prior_forecast()
        mse_prior = ev.forecast_mse(pr, tg)                       # the benchmark's metric
        out = {"score": 0.0, "submitted": 0.0, "mse_prior": mse_prior,
               "mse_prior_unfloored": ev.forecast_mse(pr, tg, floor=0.0),
               "mse_floor": ev.MSE_FLOOR, "budget_used": float(self.budget0 - self.budget),
               "n_runs": float(len(self.history)), "family": self.family,
               "degenerate_prior": float(mse_prior < MIN_PRIOR_MSE),
               "per_protocol": {lab: {"target": tg[lab], "prior": pr[lab]} for lab in tg},
               "runs": self.history, "neuronbench_commit": PINNED_COMMIT}
        if self.forecasts is not None:
            mse = ev.forecast_mse(self.forecasts, tg)
            out.update(submitted=1.0, mse_agent=mse,
                       mse_agent_unfloored=ev.forecast_mse(self.forecasts, tg, floor=0.0))
            for lab in tg:
                out["per_protocol"][lab]["forecast"] = self.forecasts[lab]
            if mse_prior >= MIN_PRIOR_MSE:
                out["score"] = float(min(1.0, max(0.0, 1.0 - mse / mse_prior)))
        return out
