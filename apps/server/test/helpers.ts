import { DEFAULT_CONTENT_DIR, loadContent, worldFromContent } from "@lab-rats/sim-core/node";
import { openDb } from "../src/db/index";
import { SessionStore, recorderFor } from "../src/db/store";
import { driverFactory, type DriverFactory } from "../src/agents/index";
import type { LlmClient } from "../src/agents/llm/client";
import { SessionHost } from "../src/sessions/SessionHost";

export const content = loadContent(DEFAULT_CONTENT_DIR);
export const worldFor = (scenario: string | null) => worldFromContent(content, { scenario });

/** A host with an in-memory database and no wall clock: tests call host.advance(). */
export function testHost(opts: { llm?: LlmClient | null; drivers?: DriverFactory } = {}) {
  const store = new SessionStore(openDb(":memory:"));
  const notes: string[] = [];
  const host = new SessionHost(worldFor, { recorder: recorderFor(store), drivers: opts.drivers ?? driverFactory(opts.llm ?? null), note: (t) => notes.push(t) });
  return { host, store, notes };
}

/** Advances until the scenario ends or `max` ticks pass. */
export function runToEnd(host: SessionHost, max = 20_000): void {
  for (let t = 0; t < max && !host.ended(); t += 20) host.advance(20);
}

/** Lets pending promise callbacks (LLM turns) run. */
export const settle = () => new Promise<void>((r) => setTimeout(r, 0));
