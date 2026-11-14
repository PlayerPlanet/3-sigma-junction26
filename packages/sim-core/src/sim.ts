import type { Action, ActionResult, Actor, ControllerKind, LogEntry, Macro, Primitive, SimEvent, StepAction } from "@lab-rats/shared";
import { isMacro } from "@lab-rats/shared";
import { expandMacro } from "./actions/macros.js";
import { createInitialState, type SimState } from "./state.js";
import { step, type StepInput } from "./step.js";
import type { World } from "./world/compile.js";

/** A request waiting in a robot's queue. */
interface Queued {
  actor: Actor;
  action: Primitive | Macro;
}

/** The request a robot is working through: its remaining primitives and the seq of the one in flight. */
interface Active extends Queued {
  steps: Primitive[];
  inFlight: number | null;
}

/** Completion notice for a queued request (primitive or macro), for controllers to react to. */
export interface Completion {
  tick: number;
  robot: string;
  actor: Actor;
  action: Primitive | Macro;
  result: ActionResult;
}

export interface SimOptions {
  seed: number;
  /** Controller per robot at tick 0 (logged as system set_controller actions). Default: all "human". */
  controllers?: Record<string, ControllerKind>;
}

/**
 * The runner around step(): per-robot request queues, macro expansion, controller rules and the event log.
 * step() and SimState stay pure; everything here is bookkeeping that replay does not need, because the
 * event log records the primitives that macros expanded into.
 */
export class Sim {
  state: SimState;
  readonly events: SimEvent[] = [];
  private queues = new Map<string, Queued[]>();
  private active = new Map<string, Active>();
  private pending: StepInput[] = [];
  private completions: Completion[] = [];

  constructor(
    readonly world: World,
    opts: SimOptions,
  ) {
    this.state = createInitialState(world, opts.seed);
    for (const id of world.robotIds) {
      this.queues.set(id, []);
      const controller = opts.controllers?.[id] ?? "human";
      if (controller !== "idle") this.pending.push({ actor: "system", action: { type: "set_controller", robot: id, controller } });
    }
  }

  /**
   * Accepts an action from a controller. Robot actions are queued (FIFO per robot) and only accepted from the
   * robot's current controller; session actions apply at the next tick. read_log answers immediately.
   */
  submit(actor: Actor, action: Action): ActionResult & { log?: LogEntry[] } {
    if (action.type === "read_log") {
      this.pending.push({ actor, action });
      return { ok: true, log: this.state.log.slice(-(action.limit ?? 30)) };
    }
    if (action.type === "commit") {
      this.pending.push({ actor, action });
      return { ok: true };
    }
    const robot = this.state.robots[action.robot];
    if (!robot) return { ok: false, reason: `unknown robot "${action.robot}"` };

    if (action.type === "set_controller" || action.type === "cancel") {
      // Humans can always take over; AI and scripts may only claim idle robots or act on their own.
      const owner = this.controllerAfterPending(robot.id);
      if (actor !== "human" && actor !== "system" && owner !== actor && owner !== "idle") {
        return { ok: false, reason: `${robot.id} is controlled by ${owner}; only a human can take it over` };
      }
      // Takeover / hand-back / stop: drop queued work now; the primitive in flight stops at its next safe point.
      this.queues.set(robot.id, []);
      const act = this.active.get(robot.id);
      if (act) {
        act.steps = [];
        if (act.inFlight === null) this.active.delete(robot.id);
      }
      this.pending.push({ actor, action });
      if (action.type === "set_controller" && robot.task) this.pending.push({ actor, action: { type: "cancel", robot: robot.id } });
      return { ok: true };
    }

    const controller = this.controllerAfterPending(robot.id);
    if (controller === "idle") return { ok: false, reason: `${robot.id} is idle; assign a controller first` };
    if (controller !== actor && actor !== "system") return { ok: false, reason: `${robot.id} is controlled by ${controller}, not ${actor}` };
    this.queues.get(robot.id)!.push({ actor, action: action as Primitive | Macro });
    return { ok: true };
  }

  /** Controller a robot will have once pending set_controller actions apply. */
  private controllerAfterPending(robot: string): ControllerKind {
    let c = this.state.robots[robot]!.controller;
    for (const p of this.pending) if (p.action.type === "set_controller" && p.action.robot === robot) c = p.action.controller;
    return c;
  }

  /** Requests still queued or running for a robot (for HUD / controllers). */
  queueLength(robot: string): number {
    return (this.queues.get(robot)?.length ?? 0) + (this.active.has(robot) ? 1 : 0);
  }

  /** Returns and clears completion notices since the last call. */
  drainCompletions(): Completion[] {
    return this.completions.splice(0);
  }

  /** Advances one tick. Returns the events logged during it. */
  tick(): SimEvent[] {
    const inputs = this.pending.splice(0);
    const annotations: SimEvent[] = [];
    // Robots that are free this tick start their next primitive (robots in id order).
    for (const id of this.world.robotIds) {
      const p = this.nextPrimitive(id, annotations);
      if (p) inputs.push(p);
    }
    const { state, events } = step(this.world, this.state, inputs);
    this.state = state;
    const all = [...annotations, ...events];
    this.events.push(...all);
    return all;
  }

  /** Runs `n` ticks. */
  run(n: number): void {
    for (let i = 0; i < n; i++) this.tick();
  }

  /** Runs until every robot is idle with an empty queue, or `max` ticks pass. Returns ticks run. */
  runUntilIdle(max = 10_000): number {
    let n = 0;
    while (n < max && (this.pending.length || this.world.robotIds.some((id) => this.queueLength(id) > 0 || this.state.robots[id]!.task))) {
      this.tick();
      n++;
    }
    return n;
  }

  private complete(robot: string, act: Active, result: ActionResult) {
    this.completions.push({ tick: this.state.tick, robot, actor: act.actor, action: act.action, result });
  }

  /**
   * A failed request clears the rest of the robot's queue: later requests were planned assuming it worked
   * (e.g. presses meant for the dispenser would land on whatever station the robot stopped at).
   */
  private dropQueue(robot: string): string {
    const q = this.queues.get(robot)!;
    const n = q.length;
    q.length = 0;
    return n ? ` (dropped ${n} queued request${n > 1 ? "s" : ""})` : "";
  }

  private nextPrimitive(robot: string, annotations: SimEvent[]): StepInput | null {
    const r = this.state.robots[robot]!;
    if (r.task) return null;
    for (;;) {
      let act = this.active.get(robot);
      if (act && act.inFlight !== null) {
        // The previous step finished (robot is idle). Abandon the plan if it did not succeed.
        const last = r.last;
        if (last && last.seq === act.inFlight && last.status !== "ok") {
          this.complete(robot, act, { ok: false, reason: `${last.type} ${last.status}${last.reason ? `: ${last.reason}` : ""}${this.dropQueue(robot)}` });
          this.active.delete(robot);
          act = undefined;
        } else act.inFlight = null;
      }
      if (act) {
        const next = act.steps.shift();
        if (next) {
          act.inFlight = r.seq; // step() gives the next primitive this robot's current seq
          return { actor: act.actor, action: next };
        }
        this.complete(robot, act, { ok: true });
        this.active.delete(robot);
      }
      const q = this.queues.get(robot)!.shift();
      if (!q) return null;
      if (isMacro(q.action)) {
        const ex = expandMacro(this.world, this.state, q.action);
        const result: ActionResult = "error" in ex ? { ok: false, reason: ex.error } : { ok: true };
        annotations.push({ tick: this.state.tick, actor: q.actor, robot, action: q.action, result });
        if ("error" in ex) {
          this.completions.push({ tick: this.state.tick, robot, actor: q.actor, action: q.action, result: { ok: false, reason: `${ex.error}${this.dropQueue(robot)}` } });
          continue;
        }
        this.active.set(robot, { ...q, steps: ex.steps, inFlight: null });
      } else {
        this.active.set(robot, { ...q, steps: [q.action], inFlight: null });
      }
    }
  }
}

export type { StepAction };
