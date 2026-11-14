import type { Action, ActionResult, Actor, LogEntry, Snapshot } from "@lab-rats/shared";
import type { Completion, SimState, World } from "@lab-rats/sim-core";

/** What a built-in controller may do: the same things an agent on the HTTP API can. */
export interface DriverHost {
  readonly world: World;
  /** Current sim state. Drivers must not read hidden fields (scenario.hidden, faults). */
  state(): SimState;
  snapshot(): Snapshot;
  submit(actor: Actor, action: Action): ActionResult & { log?: LogEntry[] };
  robotIdle(robot: string): boolean;
  /** True once the scenario is committed or timed out. */
  ended(): boolean;
  /** Server-side note (not part of the sim). */
  note(text: string): void;
}

/**
 * A built-in controller driving one robot as the `script` or `llm` actor. The session host calls onTick
 * after every sim advance with the completion notices for this robot's requests. A driver that gives up
 * hands the robot back with set_controller idle, which also detaches it.
 */
export interface Driver {
  readonly robot: string;
  readonly actor: "script" | "llm";
  /** Short name for status lines, e.g. "script", "mock", "gemini / <model>". */
  readonly label: string;
  onTick(host: DriverHost, completions: Completion[]): void;
  stop?(): void;
}

/** Hands the robot back (and thereby detaches the driver). */
export function giveUp(host: DriverHost, driver: Driver, why: string): void {
  host.note(`${driver.label} controller on ${driver.robot} stopped: ${why}`);
  host.submit(driver.actor, { type: "set_controller", robot: driver.robot, controller: "idle" });
}
