"""Render the Harbor tasks for NeuronBench from templates/neuron_task.

    python scripts/make_neuron_tasks.py [--src PATH_TO_NEURONBENCH_CHECKOUT] [--seed 0]

One task per mechanism family (the six NeuronBench worlds): tasks/neuron/<world>-<seed>.
NeuronBench (https://github.com/murphyk/neuronbench, MIT) is vendored at the commit pinned in
bayesenv/neuron.py; without --src the script clones it to a temporary directory. The check-out
must be exactly at the pinned commit.

What goes where:
  environment/mcp-server/neuronbench/   the full package (holds the world registry = the truth
                                        of every public world): server image only
  environment/mcp-server/bayesenv/      bayesenv/neuron.py (lab, salted private world, grader)
  environment/nbsim/                    forward model only, for the agent container: the
                                        simulator files, with worlds.py cut before the world
                                        registry. No world list, no targets.
  solution/bayesenv/                    bayesenv/neuron_ref.py (reference solver, numpy only)
The family is in the directory name and in the server's compose environment, not in anything
the agent container receives. The cell's parameters, test protocols and noise come from
(seed, salt) with a salt that is random per trial inside the server (TASK_SALT empty).
"""

import argparse
import re
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "neuron_task"
TEXT = {".toml", ".md", ".yaml", ".sh", ".py", ""}
REPO = "https://github.com/murphyk/neuronbench"
PINNED = re.search(r'PINNED_COMMIT = "([0-9a-f]{40})"',
                   (ROOT / "bayesenv" / "neuron.py").read_text(encoding="utf-8")).group(1)
FAMILIES = ("z_rebound", "h_sag", "na_fatigue", "ca_rebound", "d_type", "textbook_M")
SIM_FILES = ("_foxlu.py", "stochastic.py", "blockers.py", "features.py")
REGISTRY_MARK = "# World registry."
FORBIDDEN = ("WORLDS", "discriminator", "TEXTBOOK", "ADVANCED", "_NOVEL", 'Chan("')

NBSIM_INIT = '''"""Forward model of the cell (no hidden cell, no scoring): NeuronBench's simulator files.

Source: https://github.com/murphyk/neuronbench (MIT, Kevin Murphy), commit
%s; worlds.py is cut before its world registry.
"""
from .worlds import Chan, build_I
from .stochastic import DT, SIG_OBS, make_protocol, run_particles
from .features import spike_count, spikes_in
from .blockers import BLOCKERS
'''

NBSIM_README = '''# nbsim: the forward model

The stochastic Hodgkin-Huxley simulator used by the task (NeuronBench, MIT licence, see
LICENSE; https://github.com/murphyk/neuronbench at commit %s).
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
'''


def source(src: str | None) -> Path:
    if src:
        path = Path(src).resolve()
    else:
        path = Path(tempfile.mkdtemp(prefix="neuronbench-")) / "neuronbench"
        subprocess.run(["git", "clone", "-q", REPO, str(path)], check=True)
        subprocess.run(["git", "-C", str(path), "checkout", "-q", PINNED], check=True)
    head = subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], check=True,
                          capture_output=True, text=True).stdout.strip()
    if head != PINNED:
        raise SystemExit(f"{path} is at {head}, expected the pinned commit {PINNED}")
    dirty = subprocess.run(["git", "-C", str(path), "status", "--porcelain", "--", "neuronbench"],
                           check=True, capture_output=True, text=True).stdout.strip()
    if dirty:
        raise SystemExit(f"{path} has local changes under neuronbench/:\n{dirty}")
    return path


def forward_model_only(worlds_py: str) -> str:
    """worlds.py up to (not including) the world registry: constants, Chan, build_I, simulate."""
    lines = worlds_py.splitlines()
    cut = next(i for i, s in enumerate(lines) if s.startswith(REGISTRY_MARK))
    start = next(i for i, s in enumerate(lines) if s.startswith("from __future__"))
    body = "\n".join(lines[start:cut - 1]).rstrip() + "\n"
    for word in FORBIDDEN:
        if word in body:
            raise SystemExit(f"forward-model cut of worlds.py still contains {word!r}")
    return '"""Hodgkin-Huxley forward model (deterministic) and the Chan channel description."""\n' + body


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def render(world: str, seed: int, out: Path, src: Path) -> None:
    dst = out / f"{world}-{seed}"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(TEMPLATE, dst, ignore=shutil.ignore_patterns("__pycache__"))
    token = secrets.token_urlsafe(24)
    for f in dst.rglob("*"):
        if f.is_file() and f.suffix in TEXT:
            s = f.read_text(encoding="utf-8")
            s = s.replace("__SEED__", str(seed)).replace("__TOKEN__", token).replace("__WORLD__", world)
            f.write_text(s, encoding="utf-8", newline="\n")
    write(dst / "tests" / "grader_token", token)
    pkg = src / "neuronbench"
    licence = (src / "LICENSE").read_text(encoding="utf-8")
    # server image: the full package
    server = dst / "environment" / "mcp-server"
    for f in sorted(pkg.glob("*.py")):
        write(server / "neuronbench" / f.name, f.read_text(encoding="utf-8"))
    write(server / "neuronbench" / "LICENSE", licence)
    write(server / "neuronbench" / "PINNED_COMMIT", PINNED + "\n")
    write(server / "bayesenv" / "__init__.py", "")
    write(server / "bayesenv" / "neuron.py", (ROOT / "bayesenv" / "neuron.py").read_text(encoding="utf-8"))
    # agent image: forward model only
    sim = dst / "environment" / "nbsim"
    for name in SIM_FILES:
        text = (pkg / name).read_text(encoding="utf-8")
        write(sim / name, text)
    write(sim / "worlds.py", forward_model_only((pkg / "worlds.py").read_text(encoding="utf-8")))
    write(sim / "__init__.py", NBSIM_INIT % PINNED)
    write(sim / "README.md", NBSIM_README % PINNED)
    write(sim / "LICENSE", licence)
    # reference solution
    write(dst / "solution" / "bayesenv" / "__init__.py", "")
    write(dst / "solution" / "bayesenv" / "neuron_ref.py",
          (ROOT / "bayesenv" / "neuron_ref.py").read_text(encoding="utf-8"))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", default=None, help="neuronbench checkout at the pinned commit")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--worlds", default=",".join(FAMILIES))
    p.add_argument("--out", default="tasks/neuron")
    a = p.parse_args()
    src = source(a.src)
    out = ROOT / a.out
    out.mkdir(parents=True, exist_ok=True)
    worlds = a.worlds.split(",")
    for w in worlds:
        if w not in FAMILIES:
            raise SystemExit(f"unknown world {w!r}")
        render(w, a.seed, out, src)
    print(f"rendered {len(worlds)} tasks -> {out} (neuronbench {PINNED[:12]})")


if __name__ == "__main__":
    main()
