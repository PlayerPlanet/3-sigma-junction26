import { z } from "zod";
import { Action, Commit, Macro, Primitive, ReadLog } from "@lab-rats/shared";
import type { LlmTool, LlmToolCall } from "./client.js";

/**
 * The LLM controller's tools are the shared action space: one tool per primitive and macro (the robot is
 * implied: one controller drives one robot), plus read_log and commit. Schemas come from the zod action
 * schemas, so the tools cannot drift from what the sim accepts.
 */
const DESCRIPTIONS: Record<string, string> = {
  move_along_rail: "Drive to a station or rail node. Both hands must be retracted.",
  set_hand_height: "Move a hand to a mast level (hand must be retracted).",
  extend_hand: "Extend a hand to a percentage of full reach (0 retracts).",
  grip: "Close the hand; on the spot it picks up the item in the slot.",
  release: "Open the hand; on the spot it puts the held item down (at a sink it is discarded).",
  tilt_pour: "Pour units from the held vessel into the vessel below (hand one level above the work level).",
  press: "Press a control of the equipment the hand is on the spot of, e.g. 'dispense'.",
  wait: "Do nothing for a number of ticks (10 ticks = 1 simulated second), e.g. while something cooks.",
  go_to: "Macro: retract hands and drive to a station.",
  pick: "Macro: go to an item and pick it up.",
  place: "Macro: pick up an item if needed and put it on a piece of equipment or in a hood.",
  transfer: "Macro: pour an amount from one vessel into another.",
  operate: "Macro: go to equipment and press its controls until it has these settings.",
  analyze: "Macro: put a sample in the analyzer, run it and wait; the reading appears in the lab log.",
  read_log: "Read the most recent lab log entries.",
  commit: "End the session: { item } for an order, { answer: { add_share, temp } } for a research question.",
};

const robotActions = [...Primitive.options, ...Macro.options];

export const LLM_TOOLS: LlmTool[] = [
  ...robotActions.map((schema) => ({ name: schema.shape.type.value as string, schema: (schema as z.ZodObject).omit({ type: true, robot: true }) })),
  { name: "read_log", schema: ReadLog.omit({ type: true }) },
  { name: "commit", schema: Commit.omit({ type: true }) },
].map(({ name, schema }) => {
  const { $schema: _drop, ...parameters } = z.toJSONSchema(schema) as Record<string, unknown>;
  return { name, description: DESCRIPTIONS[name] ?? name, parameters };
});

const ROBOT_TOOLS = new Set(robotActions.map((s) => s.shape.type.value as string));

/** Turns a tool call into a validated action for `robot`, or a reason the model can act on. */
export function toAction(call: LlmToolCall, robot: string): { action: Action } | { error: string } {
  if (!LLM_TOOLS.some((t) => t.name === call.name)) return { error: `unknown tool "${call.name}"` };
  const parsed = Action.safeParse({ ...call.args, type: call.name, ...(ROBOT_TOOLS.has(call.name) ? { robot } : {}) });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ") };
  return { action: parsed.data };
}
