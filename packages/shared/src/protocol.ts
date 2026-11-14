import { z } from "zod";
import { LLM_PROVIDERS } from "./constants.js";
import { LabView, Snapshot } from "./world.js";
import { Action, ActionResult } from "./actions.js";

/** Status of the optional LLM controller. `available: false` means robots fall back to the mock controller. */
export const LlmStatus = z.object({
  provider: z.enum(LLM_PROVIDERS),
  model: z.string(),
  available: z.boolean(),
});
export type LlmStatus = z.infer<typeof LlmStatus>;

/** Messages the server sends over the WebSocket. */
export const ServerHello = z.object({
  type: z.literal("hello"),
  protocol: z.number().int(),
  simCoreVersion: z.string(),
  llm: LlmStatus,
});
export type ServerHello = z.infer<typeof ServerHello>;

/** The static lab: layout, equipment types, sampled rails and robots at rest. */
export const ServerLab = z.object({ type: z.literal("lab"), lab: LabView });
export type ServerLab = z.infer<typeof ServerLab>;

/** Live state, sent every tick. */
export const ServerSnapshot = z.object({ type: z.literal("snapshot"), snapshot: Snapshot });
export type ServerSnapshot = z.infer<typeof ServerSnapshot>;

/** Reply to a client action: accepted into the robot's queue, or rejected by schema/queue checks. */
export const ServerActionResult = z.object({ type: z.literal("action_result"), requestId: z.string().optional(), result: ActionResult });
export type ServerActionResult = z.infer<typeof ServerActionResult>;

export const ServerMessage = z.discriminatedUnion("type", [ServerHello, ServerLab, ServerSnapshot, ServerActionResult]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/** Health payload for GET /api/health. */
export const Health = z.object({
  ok: z.literal(true),
  protocol: z.number().int(),
  simCoreVersion: z.string(),
  llm: LlmStatus,
  dbPath: z.string(),
});
export type Health = z.infer<typeof Health>;

/** Messages the browser sends. Browser actions are always attributed to the "human" actor. */
export const ClientAction = z.object({ type: z.literal("action"), requestId: z.string().optional(), action: Action });
export type ClientAction = z.infer<typeof ClientAction>;

export const ClientMessage = z.discriminatedUnion("type", [ClientAction]);
export type ClientMessage = z.infer<typeof ClientMessage>;
