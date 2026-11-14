import { nextUint32, seedRng, type Completion } from "@lab-rats/sim-core";
import type { Driver, DriverHost } from "../types.js";

/**
 * Stand-in for the LLM controller when no API key + model is configured: wanders between free stations
 * and pauses, so takeover, rail blocking and the HUD can be tried offline. Deterministic per seed and
 * robot. It never touches glassware or equipment and never commits.
 */
export class MockDriver implements Driver {
  readonly actor = "llm" as const;
  readonly label = "mock";
  private rng: { rng: number };
  private pause = false;

  constructor(
    readonly robot: string,
    seed: number,
  ) {
    this.rng = { rng: seedRng(seed ^ [...robot].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) };
  }

  onTick(host: DriverHost, _completions: Completion[]): void {
    if (host.ended() || !host.robotIdle(this.robot)) return;
    this.pause = !this.pause;
    if (!this.pause) {
      host.submit(this.actor, { type: "wait", robot: this.robot, ticks: 30 + (nextUint32(this.rng) % 60) });
      return;
    }
    const taken = new Set(host.snapshot().robots.map((r) => r.station));
    const free = host.world.layout.stations.filter((s) => !taken.has(s.id));
    const to = free[nextUint32(this.rng) % Math.max(1, free.length)];
    if (to) host.submit(this.actor, { type: "go_to", robot: this.robot, station: to.id });
  }
}
