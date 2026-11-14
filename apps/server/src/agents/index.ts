import { FAIR_SOAP_PLAN, soapScript, type World } from "@lab-rats/sim-core";
import type { LlmProvider } from "@lab-rats/shared";
import { anthropicClient } from "./llm/anthropic.js";
import type { LlmClient } from "./llm/client.js";
import { geminiClient } from "./llm/gemini.js";
import { LlmDriver } from "./llm/LlmDriver.js";
import { MockDriver } from "./mock/MockDriver.js";
import { ScriptedDriver } from "./scripted/ScriptedDriver.js";
import type { Driver } from "./types.js";

export type { Driver, DriverHost } from "./types.js";

/** Builds the LLM client for the configured provider, or null when no key + model is set. */
export function createLlmClient(llm: { provider: LlmProvider; apiKey: string; model: string }): LlmClient | null {
  if (!llm.apiKey || !llm.model) return null;
  return llm.provider === "anthropic" ? anthropicClient(llm.apiKey, llm.model) : geminiClient(llm.apiKey, llm.model);
}

export type DriverFactory = (kind: "script" | "llm", robot: string, world: World, seed: number) => Driver | null;

/**
 * The built-in controller for a robot whose controller was set to `script` or `llm`:
 * script -> the reference player for the scenario's pathway (none in the sandbox);
 * llm -> the LLM controller, or the mock when no LLM is configured.
 */
export function driverFactory(llm: LlmClient | null): DriverFactory {
  return (kind, robot, world, seed) => {
    if (kind === "llm") return llm ? new LlmDriver(robot, llm) : new MockDriver(robot, seed);
    return world.pathway ? new ScriptedDriver(robot, soapScript(world, FAIR_SOAP_PLAN, robot)) : null;
  };
}
