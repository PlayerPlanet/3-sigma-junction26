"""Spend guard: scale the always-on LLM server to zero before the credit deadline.

    modal deploy --env 3-sigma-submission infra/modal_guard.py

Runs on Modal's scheduler, so it fires even if no laptop is online. Deadline for the
linear credit burn: Sun 2026-11-15 11:00 Helsinki (09:00 UTC); the guard fires at 10:40.
"""

import datetime as dt

import modal

app = modal.App("bayesenv-guard")
DEADLINE_UTC = dt.datetime(2026, 11, 15, 8, 40, tzinfo=dt.timezone.utc)


@app.function(schedule=modal.Cron("*/10 * * * *"), timeout=120)
def guard() -> str:
    now = dt.datetime.now(dt.timezone.utc)
    if now < DEADLINE_UTC:
        return f"{now:%Y-%m-%d %H:%M} UTC: before deadline, nothing to do"
    serve = modal.Function.from_name("bayesenv-llm", "serve", environment_name="3-sigma-submission")
    serve.update_autoscaler(min_containers=0, max_containers=0, scaledown_window=2)
    return f"{now:%Y-%m-%d %H:%M} UTC: scaled bayesenv-llm to zero"
