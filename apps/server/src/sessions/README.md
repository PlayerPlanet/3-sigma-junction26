# sessions/

`SessionHost` owns the one live session: it steps sim-core on the wall clock, streams snapshots, records
events through a `SessionRecorder` (SQLite, see `../db/`), runs the built-in controllers (`../agents/`)
and restarts with a new scenario, seed or player. The sim never sees wall time.
