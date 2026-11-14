/**
 * Ordered, append-only migrations. Never edit a shipped migration; add a new one.
 * Milestone 6 adds players, sessions, events and the leaderboard view.
 */
export const migrations: { version: number; sql: string }[] = [];
