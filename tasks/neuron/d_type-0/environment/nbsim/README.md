# nbsim: the forward model

The stochastic Hodgkin-Huxley simulator used by the task (NeuronBench, MIT licence, see
LICENSE; https://github.com/murphyk/neuronbench at commit c354622458c460b419cab821d482c879f0578377).
It simulates any mechanism you propose; it knows nothing about the recorded cell.

```python
import sys; sys.path.insert(0, "/app")
import numpy as np
from nbsim import Chan, run_particles, make_protocol, spike_count

segments = [[250, -30.0], [150, 12.0]]            # [[duration_ms, amplitude_uA], ...]
I, obs_idx, test_start = make_protocol(segments)  # current, 4 ms sample indices, count window
plain = {"extra": [], "slow_na": False}           # the reference model
mine = {"extra": [Chan("X", g=2.0, E=-77.0, mvh=-40.0, mk=8.0, mtau=50.0)], "slow_na": False}
V = run_particles(20, I, mine, 100.0, np.random.default_rng(0), block=())   # (20, T) mV
counts = spike_count(V, test_start)               # test-window spike count per repeat
recording_like = V[0][obs_idx]                    # what a recording samples (before 2 mV noise)
```

`Chan` (see worlds.py): current g * m^mpow * h^hpow * (V - E); activation
m_inf = 1/(1+exp(-(V-mvh)/mk)) with time constant mtau (mk < 0: activated by
hyperpolarisation); optional inactivation h_inf = 1/(1+exp((V-hvh)/hk)), time constant htau.
`slow_na=True` adds a slow inactivation gate to the Na+ current (stochastic.py).
Blockers (`block=("TTX",)` etc.) are in blockers.py. One call takes about a second whatever
the number of repeats up to a few hundred, because the time loop is in Python.
