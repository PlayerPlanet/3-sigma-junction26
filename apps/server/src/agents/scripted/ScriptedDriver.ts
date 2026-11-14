import type { Completion, ScenarioScript } from "@lab-rats/sim-core";
import { giveUp, type Driver, type DriverHost } from "../types.js";

/**
 * Deterministic scripted controller: plays a scenario script (sim-core/players) phase by phase, queuing
 * the next phase when the robot is idle and the previous one succeeded, then commits.
 */
export class ScriptedDriver implements Driver {
  readonly actor = "script" as const;
  readonly label = "script";
  private phase = 0;
  private done = false;

  constructor(
    readonly robot: string,
    private script: ScenarioScript,
  ) {}

  onTick(host: DriverHost, completions: Completion[]): void {
    if (this.done || host.ended()) return;
    const failed = completions.find((c) => !c.result.ok);
    if (failed) {
      this.done = true;
      return giveUp(host, this, `${failed.action.type} failed: ${failed.result.reason}`);
    }
    if (!host.robotIdle(this.robot)) return;
    const actions = this.script.phases[this.phase++] ?? [this.script.commit];
    if (this.phase > this.script.phases.length) this.done = true;
    for (const action of actions) {
      const res = host.submit(this.actor, action);
      if (!res.ok) {
        this.done = true;
        return giveUp(host, this, `${action.type} rejected: ${res.reason}`);
      }
    }
  }
}
