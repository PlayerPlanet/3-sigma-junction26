/**
 * Ordered, append-only migrations. Never edit a shipped migration; add a new one.
 */
export const migrations: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE players (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      -- One row per sim session. seed + events (+ scenario, layout, sim-core version) reproduce it exactly.
      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES players(id),
        scenario TEXT,                         -- null = sandbox
        layout TEXT NOT NULL DEFAULT 'default',
        seed INTEGER NOT NULL,
        sim_core_version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running', -- running | committed | timeout | abandoned
        end_tick INTEGER,
        score INTEGER,
        true_yield INTEGER,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT
      );
      CREATE INDEX sessions_scenario_score ON sessions (scenario, score DESC);
      CREATE TABLE events (
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL,                  -- order within the session
        tick INTEGER NOT NULL,
        actor TEXT NOT NULL,
        robot TEXT,
        action TEXT NOT NULL,                  -- JSON
        result TEXT NOT NULL,                  -- JSON
        PRIMARY KEY (session_id, idx)
      ) WITHOUT ROWID;
      -- Best finished run per player and scenario.
      CREATE VIEW leaderboard AS
        SELECT p.name AS player, s.scenario AS scenario, MAX(s.score) AS best, COUNT(*) AS runs,
               ROUND(AVG(s.score)) AS average, MAX(s.ended_at) AS last_played
        FROM sessions s JOIN players p ON p.id = s.player_id
        WHERE s.scenario IS NOT NULL AND s.status IN ('committed', 'timeout')
        GROUP BY p.id, s.scenario;
    `,
  },
];
