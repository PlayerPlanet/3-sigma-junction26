import { TICK_MS, type Action, type ActionResult, type Actor, type ControllerKind, type LabView, type LogEntry, type Snapshot } from "@lab-rats/shared";
import { Sim, labView, snapshot, type Completion, type World } from "@lab-rats/sim-core";

export interface SessionConfig {
  scenario: string | null;
  seed: number;
  /** Ticks per wall-clock tick interval (1 = real time). */
  speed: number;
  controllers?: Record<string, ControllerKind>;
}

/**
 * Hosts the one live session: steps the sim on the wall clock, streams snapshots, routes completion
 * notices to the actor that queued each request, and can restart with a new scenario/seed.
 * The sim never sees wall time; the host only decides when to call tick(). Events are in memory (M6: SQLite).
 */
export class SessionHost {
  sim!: Sim;
  world!: World;
  lab!: LabView;
  config!: SessionConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshotListeners = new Set<(s: Snapshot) => void>();
  private resetListeners = new Set<() => void>();
  private completions = new Map<Actor, Completion[]>();
  private tickWaiters = new Set<() => void>();

  constructor(private makeWorld: (scenario: string | null) => World) {}

  start(config: SessionConfig): void {
    this.stop();
    this.config = config;
    this.world = this.makeWorld(config.scenario);
    // Robots start idle: a human claims one with T, an agent with set_controller.
    const controllers = config.controllers ?? Object.fromEntries(this.world.robotIds.map((id) => [id, "idle" as const]));
    this.sim = new Sim(this.world, { seed: config.seed, controllers });
    this.lab = labView(this.world);
    this.completions.clear();
    this.resetListeners.forEach((l) => l());
    this.timer = setInterval(() => this.advance(Math.max(1, Math.round(config.speed))), TICK_MS);
  }

  private advance(n: number): void {
    for (let i = 0; i < n; i++) this.sim.tick();
    for (const c of this.sim.drainCompletions()) {
      const list = this.completions.get(c.actor) ?? [];
      list.push(c);
      this.completions.set(c.actor, list);
    }
    const snap = this.snapshot();
    this.snapshotListeners.forEach((l) => l(snap));
    this.tickWaiters.forEach((w) => w());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot(): Snapshot {
    const snap = snapshot(this.world, this.sim.state);
    for (const r of snap.robots) r.queued = this.sim.queueLength(r.id);
    return snap;
  }

  submit(actor: Actor, action: Action): ActionResult & { log?: LogEntry[] } {
    return this.sim.submit(actor, action);
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
