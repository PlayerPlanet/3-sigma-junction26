# db/

SQLite (better-sqlite3). `migrations.ts` is the append-only schema (players, sessions, events, the
`leaderboard` view); `store.ts` holds every query. A session is stored as seed + ordered events, which
is enough to replay it exactly (`npm run replay -- <session id>`).
