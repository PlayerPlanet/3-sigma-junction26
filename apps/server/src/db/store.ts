import { SimEvent } from "@lab-rats/shared";
import { SIM_CORE_VERSION, type Sim } from "@lab-rats/sim-core";
import type { DB } from "./index.js";
import type { SessionRecorder } from "../sessions/SessionHost.js";

export const DEFAULT_PLAYER = "anonymous";

export interface SessionMeta {
  id: number;
  player: string;
  scenario: string | null;
  layout: string;
  seed: number;
  simCoreVersion: string;
  status: "running" | "committed" | "timeout" | "abandoned";
  endTick: number | null;
  score: number | null;
  trueYield: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface SessionEnd {
  status: "committed" | "timeout" | "abandoned";
  endTick: number;
  score: number | null;
  trueYield: number | null;
}

export interface LeaderboardRow {
  player: string;
  scenario: string;
  best: number;
  runs: number;
  average: number;
  lastPlayed: string;
}

const SESSION_COLUMNS = `s.id, p.name AS player, s.scenario, s.layout, s.seed, s.sim_core_version AS simCoreVersion, s.status,
  s.end_tick AS endTick, s.score, s.true_yield AS trueYield, s.started_at AS startedAt, s.ended_at AS endedAt`;

/** Queries over players, sessions and events. Everything the server stores goes through here. */
export class SessionStore {
  constructor(private db: DB) {}

  private playerId(name: string): number {
    this.db.prepare("INSERT OR IGNORE INTO players (name) VALUES (?)").run(name);
    return (this.db.prepare("SELECT id FROM players WHERE name = ?").get(name) as { id: number }).id;
  }

  begin(s: { player: string; scenario: string | null; seed: number; simCoreVersion: string; layout?: string }): number {
    const res = this.db
      .prepare("INSERT INTO sessions (player_id, scenario, layout, seed, sim_core_version) VALUES (?, ?, ?, ?, ?)")
      .run(this.playerId(s.player), s.scenario, s.layout ?? "default", s.seed, s.simCoreVersion);
    return Number(res.lastInsertRowid);
  }

  /** Appends events in order; `startIdx` is the number of events already stored for the session. */
  append(sessionId: number, startIdx: number, events: SimEvent[]): void {
    if (!events.length) return;
    const insert = this.db.prepare("INSERT INTO events (session_id, idx, tick, actor, robot, action, result) VALUES (?, ?, ?, ?, ?, ?, ?)");
    this.db.transaction(() => {
      events.forEach((e, i) => insert.run(sessionId, startIdx + i, e.tick, e.actor, e.robot, JSON.stringify(e.action), JSON.stringify(e.result)));
    })();
  }

  end(sessionId: number, end: SessionEnd): void {
    this.db
      .prepare("UPDATE sessions SET status = ?, end_tick = ?, score = ?, true_yield = ?, ended_at = datetime('now') WHERE id = ?")
      .run(end.status, end.endTick, end.score, end.trueYield, sessionId);
  }

  session(id: number): SessionMeta | null {
    return (this.db.prepare(`SELECT ${SESSION_COLUMNS} FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.id = ?`).get(id) as SessionMeta | undefined) ?? null;
  }

  sessions(limit = 20): SessionMeta[] {
    return this.db.prepare(`SELECT ${SESSION_COLUMNS} FROM sessions s JOIN players p ON p.id = s.player_id ORDER BY s.id DESC LIMIT ?`).all(limit) as SessionMeta[];
  }

  events(sessionId: number): SimEvent[] {
    const rows = this.db.prepare("SELECT tick, actor, robot, action, result FROM events WHERE session_id = ? ORDER BY idx").all(sessionId) as {
      tick: number;
      actor: string;
      robot: string | null;
      action: string;
      result: string;
    }[];
    return rows.map((r) => SimEvent.parse({ tick: r.tick, actor: r.actor, robot: r.robot, action: JSON.parse(r.action), result: JSON.parse(r.result) }));
  }

  leaderboard(scenario?: string, limit = 10): LeaderboardRow[] {
    const where = scenario ? "WHERE scenario = ?" : "";
    return this.db
      .prepare(`SELECT player, scenario, best, runs, average, last_played AS lastPlayed FROM leaderboard ${where} ORDER BY best DESC, runs ASC, player ASC LIMIT ?`)
      .all(...(scenario ? [scenario, limit] : [limit])) as LeaderboardRow[];
  }
}

/** Records live sessions into the store. */
export function recorderFor(store: SessionStore): SessionRecorder {
  return {
    begin: (c) => store.begin({ player: c.player || DEFAULT_PLAYER, scenario: c.scenario, seed: c.seed, simCoreVersion: SIM_CORE_VERSION }),
    append: (id, startIdx, events) => store.append(id, startIdx, events),
    end: (id, end) => store.end(id, end),
  };
}

/** Stores a sim that was run to its end elsewhere (headless runs, demo data). Returns the session id. */
export function storeFinishedSim(store: SessionStore, player: string, scenario: string | null, sim: Sim): number {
  const id = store.begin({ player, scenario, seed: sim.state.seed, simCoreVersion: SIM_CORE_VERSION });
  store.append(id, 0, sim.events);
  const sc = sim.state.scenario;
  store.end(id, {
    status: sc && sc.status !== "running" ? sc.status : "abandoned",
    endTick: sc?.endTick ?? sim.state.tick,
    score: sc?.score ?? null,
    trueYield: sc?.trueYield ?? null,
  });
  return id;
}
