import { TICK_MS, type Action, type ActionResult, type Actor, type ControllerKind, type LabView, type LogEntry, type SimEvent, type Snapshot } from "@lab-rats/shared";
import { Sim, labView, snapshot, type Completion, type SimState, type World } from "@lab-rats/sim-core";
import type { Driver, DriverFactory, DriverHost } from "../agents/index.js";

export interface SessionConfig {
  scenario: string | null;
  seed: number;
  /** Ticks per wall-clock tick interval (1 = real time). */
  speed: number;
  /** Who the session is recorded for (leaderboard). */
  player?: string;
  controllers?: Record<string, ControllerKind>;
}

/** Where a session's events go (SQLite in the server; nothing in tests that do not care). */
export interface SessionRecorder {
  begin(config: SessionConfig): number;
  append(sessionId: number, startIdx: number, events: SimEvent[]): void;
  end(sessionId: number, end: { status: "committed" | "timeout" | "abandoned"; endTick: number; score: number | null; trueYield: number | null }): void;
}

export interface SessionHostOptions {
  recorder?: SessionRecorder;
  drivers?: DriverFactory;
  /** Server-side notes from drivers (not part of the sim). */
  note?: (text: string) => void;
}

/**
 * Hosts the one live session: steps the sim on the wall clock, streams snapshots, records events, runs
 * the built-in controllers, routes completion notices to the actor that queued each request, and can
 * restart with a new scenario/seed. The sim never sees wall time; the host only decides when to tick.
 */
export class SessionHost implements DriverHost {
  sim!: Sim;
  world!: World;
  lab!: LabView;
  config!: SessionConfig;
  /** Id of the stored session, when a recorder is attached. */
  sessionId: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshotListeners = new Set<(s: Snapshot) => void>();
  private resetListeners = new Set<() => void>();
  private completions = new Map<Actor, Completion[]>();
  private tickWaiters = new Set<() => void>();
  private drivers = new Map<string, Driver>();
  private recorded = 0;
  private closed = true;

  constructor(
    private makeWorld: (scenario: string | null) => World,
    private opts: SessionHostOptions = {},
  ) {}

  /** Starts a new session (ending the current one). `clock: false` leaves ticking to the caller (tests). */
  start(config: SessionConfig, clock = true): void {
    const world = this.makeWorld(config.scenario); // throws on an unknown scenario, before anything changes
    this.stop();
    this.config = config;
    this.world = world;
    // Robots start idle: a human claims one with T, an agent with set_controller.
    const controllers: Record<string, ControllerKind> = { ...Object.fromEntries(this.world.robotIds.map((id) => [id, "idle" as const])), ...config.controllers };
    this.sim = new Sim(this.world, { seed: config.seed, controllers });
    this.lab = labView(this.world);
    this.completions.clear();
    this.recorded = 0;
    this.closed = false;
    this.sessionId = this.opts.recorder?.begin(config) ?? null;
    for (const [robot, kind] of Object.entries(controllers)) this.attach(robot, kind);
    this.resetListeners.forEach((l) => l());
    if (clock) this.timer = setInterval(() => this.advance(Math.max(1, Math.round(config.speed))), TICK_MS);
  }

  /** Runs `n` sim ticks, then records, drives the built-in controllers and notifies listeners. */
  advance(n: number): void {
    for (let i = 0; i < n; i++) this.sim.tick();
    this.record();
    const forDriver = new Map<string, Completion[]>();
    for (const c of this.sim.drainCompletions()) {
      const driver = this.drivers.get(c.robot);
      const list = driver?.actor === c.actor ? forDriver.get(c.robot) ?? [] : this.completions.get(c.actor) ?? [];
      list.push(c);
      if (driver?.actor === c.actor) forDriver.set(c.robot, list);
      else this.completions.set(c.actor, list);
    }
    for (const driver of [...this.drivers.values()]) {
      try {
        driver.onTick(this, forDriver.get(driver.robot) ?? []);
      } catch (err) {
        this.note(`${driver.label} controller on ${driver.robot} crashed: ${(err as Error).message}`);
        this.detach(driver.robot);
      }
    }
    const snap = this.snapshot();
    this.snapshotListeners.forEach((l) => l(snap));
    this.tickWaiters.forEach((w) => w());
  }

  /** Stores new events, and closes the stored session once the scenario has ended. */
  private record(): void {
    const { recorder } = this.opts;
    if (!recorder || this.sessionId === null || this.closed) return;
    const events = this.sim.events.slice(this.recorded);
    recorder.append(this.sessionId, this.recorded, events);
    this.recorded += events.length;
    const sc = this.sim.state.scenario;
    if (sc && sc.status !== "running") this.close(sc.status);
  }

  private close(status: "committed" | "timeout" | "abandoned"): void {
    if (this.closed || this.sessionId === null) return;
    this.closed = true;
    const sc = this.sim.state.scenario;
    this.opts.recorder?.end(this.sessionId, { status, endTick: sc?.endTick ?? this.sim.state.tick, score: sc?.score ?? null, trueYield: sc?.trueYield ?? null });
  }

  /** Stops the clock and the controllers; a session that never finished is stored as abandoned. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const robot of [...this.drivers.keys()]) this.detach(robot);
    if (this.sim) {
      this.record();
      this.close("abandoned");
    }
  }

  private attach(robot: string, kind: ControllerKind): void {
    if (kind !== "script" && kind !== "llm") return;
    const driver = this.opts.drivers?.(kind, robot, this.world, this.config.seed) ?? null;
    if (driver) this.drivers.set(robot, driver);
    else if (this.opts.drivers) this.note(`no built-in ${kind} controller for ${robot} in this session`);
  }

  private detach(robot: string): void {
    this.drivers.get(robot)?.stop?.();
    this.drivers.delete(robot);
  }

  /** Name of the built-in controller driving a robot, if any (e.g. "script", "mock"). */
  driverLabel(robot: string): string | null {
    return this.drivers.get(robot)?.label ?? null;
  }

  state(): SimState {
    return this.sim.state;
  }

  ended(): boolean {
    const sc = this.sim.state.scenario;
    return !!sc && sc.status !== "running";
  }

  note(text: string): void {
    this.opts.note?.(text);
  }

  snapshot(): Snapshot {
    const snap = snapshot(this.world, this.sim.state);
    for (const r of snap.robots) r.queued = this.sim.queueLength(r.id);
    return snap;
  }

  /**
   * Submits an action. Any accepted set_controller detaches the robot's built-in controller; when a human
   * (or the system) sets it to `script` or `llm`, the matching built-in controller takes the robot.
   * Agents on the HTTP API claim robots as the llm/script actor and so drive them themselves.
   */
  submit(actor: Actor, action: Action): ActionResult & { log?: LogEntry[] } {
    const res = this.sim.submit(actor, action);
    if (res.ok && action.type === "set_controller") {
      this.detach(action.robot);
      if (actor === "human" || actor === "system") this.attach(action.robot, action.controller);
    }
    return res;
  }

  /** Takes the completion notices for requests this actor queued. */
  takeCompletions(actor: Actor): Completion[] {
    const list = this.completions.get(actor) ?? [];
    this.completions.set(actor, []);
    return list;
  }

  /** Resolves once `done()` is true (checked every tick) or after `maxTicks` sim ticks. */
  waitUntil(done: () => boolean, maxTicks: number): Promise<{ timedOut: boolean }> {
    const startTick = this.sim.state.tick;
    const sim = () => this.sim;
    return new Promise((resolve) => {
      const check = () => {
        if (done()) return finish(false);
        if (sim().state.tick - startTick >= maxTicks) return finish(true);
      };
      const finish = (timedOut: boolean) => {
        this.tickWaiters.delete(check);
        resolve({ timedOut });
      };
      this.tickWaiters.add(check);
      check();
    });
  }

  /** True when the robot has nothing running or queued. */
  robotIdle(robot: string): boolean {
    return !this.sim.state.robots[robot]?.task && this.sim.queueLength(robot) === 0;
  }

  onSnapshot(fn: (s: Snapshot) => void): () => void {
    this.snapshotListeners.add(fn);
    return () => this.snapshotListeners.delete(fn);
  }

  onReset(fn: () => void): () => void {
    this.resetListeners.add(fn);
    return () => this.resetListeners.delete(fn);
  }
}
