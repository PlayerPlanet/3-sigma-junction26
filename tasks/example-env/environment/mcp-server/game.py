"""Environment logic: pure Python, no I/O, so it can be unit-tested without Docker.

PLACEHOLDER GAME: find a hidden integer with a limited probe budget.
Replace this module with the real environment once the setting is chosen;
keep the same shape (actions mutate state, `grade()` is the only reward source).

Reward design rules this skeleton enforces (from the judging rubric):
  * doing nothing        -> 0
  * stopping early       -> 0 (submitting without the right answer earns nothing)
  * completing the task  -> the only way to score, and doing it efficiently scores more
"""

from __future__ import annotations

import random
import threading
from dataclasses import dataclass, field


class ActionError(ValueError):
    """An illegal action. Raised to the agent as a tool error; never changes state."""


@dataclass
class Game:
    seed: int
    low: int = 1
    high: int = 1000
    budget: int = 12
    _target: int = field(init=False, repr=False)
    probes_used: int = field(default=0, init=False)
    submitted: bool = field(default=False, init=False)
    solved: bool = field(default=False, init=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)

    def __post_init__(self) -> None:
        self._target = random.Random(self.seed).randint(self.low, self.high)

    # ---- agent-facing actions -------------------------------------------------

    def rules(self) -> str:
        return (
            f"A hidden integer lies in [{self.low}, {self.high}]. "
            f"You have {self.budget} probes. probe(guess) answers 'higher', 'lower' "
            "or 'correct' and costs one probe. submit(answer) ends the episode; only "
            "the first submission counts. A correct submission scores more the fewer "
            "probes you used. A wrong or missing submission scores 0."
        )

    def probe(self, guess: int) -> str:
        with self._lock:
            self._check_open()
            if not self.low <= guess <= self.high:
                raise ActionError(f"guess must be in [{self.low}, {self.high}]")
            if self.probes_used >= self.budget:
                raise ActionError("probe budget exhausted; submit an answer")
            self.probes_used += 1
            if guess < self._target:
                return "higher"
            if guess > self._target:
                return "lower"
            return "correct"

    def submit(self, answer: int) -> str:
        with self._lock:
            self._check_open()
            self.submitted = True
            self.solved = answer == self._target
            return "submitted; the episode is over"

    def status(self) -> dict:
        with self._lock:
            return {
                "probes_used": self.probes_used,
                "probes_left": self.budget - self.probes_used,
                "episode_over": self.submitted,
            }

    # ---- grader-only ----------------------------------------------------------

    def grade(self) -> dict[str, float]:
        """Numeric metrics for reward.json. `reward` is the headline score in [0, 1]."""
        with self._lock:
            if self.solved:
                efficiency = (self.budget - self.probes_used) / self.budget
                reward = 0.5 + 0.5 * efficiency
            else:
                reward = 0.0
            return {
                "reward": round(reward, 6),
                "solved": float(self.solved),
                "submitted": float(self.submitted),
                "probes_used": float(self.probes_used),
            }

    def _check_open(self) -> None:
        if self.submitted:
            raise ActionError("the episode is over")
