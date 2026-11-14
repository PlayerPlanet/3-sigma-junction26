import { briefing, type Completion } from "@lab-rats/sim-core";
import { giveUp, type Driver, type DriverHost } from "../types.js";
import type { LlmClient, LlmMessage, LlmToolResult } from "./client.js";
import { LLM_TOOLS, toAction } from "./tools.js";

const MAX_MESSAGES = 40;
const MAX_FAILURES = 3;
/** Ticks to wait when the model answers without acting, so an idle model does not spin. */
const IDLE_WAIT_TICKS = 30;

/**
 * LLM tool-use controller for one robot. Whenever the robot is idle it sends the model an observation
 * (what its last requests did, the robot, vessels, equipment, new lab log lines), then queues the actions
 * the model calls. It sees only what a human sees: snapshots and the lab log, never hidden state.
 */
export class LlmDriver implements Driver {
  readonly actor = "llm" as const;
  readonly label: string;
  private messages: LlmMessage[] = [];
  private pendingResults: LlmToolResult[] = [];
  private completions: Completion[] = [];
  private busy = false;
  private stopped = false;
  private failures = 0;
  private lastLogTick = -1;

  constructor(
    readonly robot: string,
    private client: LlmClient,
  ) {
    this.label = client.label;
  }

  stop(): void {
    this.stopped = true;
  }

  onTick(host: DriverHost, completions: Completion[]): void {
    this.completions.push(...completions);
    if (this.busy || this.stopped || host.ended() || !host.robotIdle(this.robot)) return;
    this.busy = true;
    void this.turn(host)
      .then(() => (this.failures = 0))
      .catch((err: Error) => {
        if (this.stopped) return;
        host.note(`${this.label} on ${this.robot}: ${err.message}`);
        if (++this.failures >= MAX_FAILURES) {
          this.stopped = true;
          giveUp(host, this, "too many failed model calls");
        } else host.submit(this.actor, { type: "wait", robot: this.robot, ticks: IDLE_WAIT_TICKS * this.failures });
      })
      .finally(() => (this.busy = false));
  }

  /** The static part of the prompt: the same briefing every agent gets, plus how this controller works. */
  private system(host: DriverHost): string {
    const { actions: _actions, robots: _robots, rules, ...brief } = briefing(host.world, host.state());
    return [
      `You control robot ${this.robot} in Lab Rats, a simulated automated chemistry lab. Work toward the scenario's goal using your tools.`,
      "Each tool call queues one action for your robot; queued actions run in order. After you answer, you are called again when the robot is idle, with what happened.",
      "Rules:",
      ...rules.filter((r) => !r.startsWith("Claim a robot")).map((r) => `- ${r.replace(/ from \/wait or \/observe/, " in the next observation")}`),
      "The lab (JSON):",
      JSON.stringify(brief),
    ].join("\n");
  }

  private observation(host: DriverHost): string {
    const snap = host.snapshot();
    const log = snap.log.filter((e) => e.tick > this.lastLogTick);
    this.lastLogTick = snap.tick;
    const done = this.completions.splice(0).map((c) => ({ action: c.action, ok: c.result.ok, ...(c.result.reason ? { reason: c.result.reason } : {}) }));
    return JSON.stringify({
      tick: snap.tick,
      session: snap.session,
      finished: done,
      robot: snap.robots.find((r) => r.id === this.robot),
      otherRobots: snap.robots.filter((r) => r.id !== this.robot).map((r) => ({ id: r.id, station: r.station, node: r.node, controller: r.controller })),
      items: snap.items.map(({ position: _p, ...i }) => i),
      equipment: snap.equipment,
      newLog: log.map((e) => `${e.tick} ${e.source}: ${e.text}`),
    });
  }

  private async turn(host: DriverHost): Promise<void> {
    const results = this.pendingResults.splice(0);
    this.messages.push({ role: "user", text: this.observation(host), ...(results.length ? { results } : {}) });
    this.trim();
    const res = await this.client.chat({ system: this.system(host), messages: this.messages, tools: LLM_TOOLS });
    if (this.stopped) return;
    this.messages.push({ role: "assistant", text: res.text, calls: res.calls, raw: res.raw });
    let queued = 0;
    for (const call of res.calls) {
      const a = toAction(call, this.robot);
      let content: string;
      if ("error" in a) content = `rejected: ${a.error}`;
      else {
        const r = host.submit(this.actor, a.action);
        if (r.ok && a.action.type !== "read_log") queued++;
        content = r.log ? r.log.map((e) => `${e.tick} ${e.source}: ${e.text}`).join("\n") : r.ok ? "queued" : `rejected: ${r.reason}`;
      }
      this.pendingResults.push({ id: call.id, name: call.name, content });
    }
    if (!queued && !host.ended()) host.submit(this.actor, { type: "wait", robot: this.robot, ticks: IDLE_WAIT_TICKS });
  }

  /** Keeps the conversation bounded, cutting at an observation so tool calls and results stay paired. */
  private trim(): void {
    while (this.messages.length > MAX_MESSAGES) this.messages.splice(0, 2);
    const first = this.messages[0];
    if (first?.role === "user" && first.results) this.messages[0] = { role: "user", text: first.text };
  }
}
