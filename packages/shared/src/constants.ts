/** Bump when the WebSocket message shapes change incompatibly. */
export const PROTOCOL_VERSION = 5;

/** Controller kinds a robot's slot can hold. `llm` is provider-neutral (Gemini or Claude, see LLM_PROVIDER). */
export const CONTROLLER_KINDS = ["human", "llm", "script", "idle"] as const;
export type ControllerKind = (typeof CONTROLLER_KINDS)[number];

/** Who issued an action; stored on every event. "system" = session setup (initial controllers) and, later, faults. */
export const ACTORS = ["human", "llm", "script", "system"] as const;
export type Actor = (typeof ACTORS)[number];

export const LLM_PROVIDERS = ["gemini", "anthropic"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** Simulation clock: 10 ticks per simulated second. */
export const TICK_MS = 100;
