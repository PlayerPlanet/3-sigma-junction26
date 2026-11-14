"""Credit burn ledger: actual Modal + Verda spend vs. the linear burn-to-zero target.

    python ops/burn_ledger.py            # append a row to results/burn_ledger.csv and print status

Target: both accounts reach zero at Sun 2026-11-15 11:00 Helsinki (09:00 UTC), spending
linearly from when compute started. Verda deliberately runs below the line until the RL
training phase (a planned reserve), so its status also shows the reserve still unspent.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import os
import subprocess
from pathlib import Path

UTC = dt.timezone.utc
DEADLINE = dt.datetime(2026, 11, 15, 9, 0, tzinfo=UTC)
MODAL = {"budget": 100.0, "t0": dt.datetime(2026, 11, 14, 0, 20, tzinfo=UTC)}
VERDA = {"budget": 200.00491, "t0": dt.datetime(2026, 11, 14, 0, 31, tzinfo=UTC)}
LEDGER = Path("results/burn_ledger.csv")
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONWARNINGS": "ignore"}


def _modal_report(*args: str) -> float:
    out = subprocess.run(["python", "-m", "modal", "billing", "report", *args, "-r", "h", "--json"],
                         capture_output=True, text=True, env=ENV).stdout
    rows = json.loads(out[out.index("["):]) if "[" in out else []
    return sum(float(r["cost"]) for r in rows)


def modal_spent() -> float:
    # `--for today` includes the current partial hour; explicit ranges only full intervals.
    spent = _modal_report("--for", "today")
    if dt.datetime.now(UTC).date() > dt.date(2026, 11, 14):
        spent += _modal_report("--start", "2026-11-14", "--end", "2026-11-15")
    return spent


def verda_balance() -> tuple[float, float]:
    base = ["verda", "--base-url", "https://api.datacrunch.io/v1", "--agent", "-o", "json"]
    bal = json.loads(subprocess.run(base + ["cost", "balance"], capture_output=True, text=True).stdout)
    run = json.loads(subprocess.run(base + ["cost", "running"], capture_output=True, text=True).stdout)
    return float(bal["amount"]), float(run["total"]["hourly"])


def target_fraction(now: dt.datetime, t0: dt.datetime) -> float:
    return min(1.0, max(0.0, (now - t0) / (DEADLINE - t0)))


def main() -> None:
    now = dt.datetime.now(UTC)
    m_spent = modal_spent()
    v_bal, v_rate = verda_balance()
    v_spent = VERDA["budget"] - v_bal
    m_target = MODAL["budget"] * target_fraction(now, MODAL["t0"])
    v_target = VERDA["budget"] * target_fraction(now, VERDA["t0"])
    hours_left = (DEADLINE - now).total_seconds() / 3600
    m_rate_needed = (MODAL["budget"] - m_spent) / hours_left
    v_rate_needed = v_bal / hours_left
    row = {
        "utc": now.isoformat(timespec="minutes"),
        "modal_spent": round(m_spent, 2), "modal_target": round(m_target, 2),
        "modal_rate_needed_per_h": round(m_rate_needed, 3),
        "verda_spent": round(v_spent, 2), "verda_target": round(v_target, 2),
        "verda_running_per_h": round(v_rate, 3), "verda_rate_needed_per_h": round(v_rate_needed, 3),
        "verda_projected_zero_utc": (now + dt.timedelta(hours=v_bal / v_rate)).isoformat(timespec="minutes")
        if v_rate > 0 else "",
    }
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    new = not LEDGER.exists()
    with LEDGER.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(row))
        if new:
            w.writeheader()
        w.writerow(row)
    print(json.dumps(row, indent=1))


if __name__ == "__main__":
    main()
