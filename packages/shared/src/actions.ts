import { z } from "zod";
import { ACTORS, CONTROLLER_KINDS } from "./constants.js";

/**
 * The one action space shared by humans, LLM controllers and scripts. See docs/ACTION_SPACE.md.
 * Units: hand levels are integers (0 = lowest), extension is a percentage 0..100, liquid amounts are
 * whole units, durations are ticks.
 */
const Ref = z.string().min(1);
export const HandId = z.enum(["a", "b"]);
export type HandId = z.infer<typeof HandId>;

const robot = { robot: Ref };
const hand = { robot: Ref, hand: HandId };

// ---- Tier 1: primitives (what the sim executes and the event log replays) ----
export const MoveAlongRail = z.object({ type: z.literal("move_along_rail"), ...robot, to: Ref.describe("station or rail node id") });
export const SetHandHeight = z.object({ type: z.literal("set_hand_height"), ...hand, level: z.number().int().min(0) });
export const ExtendHand = z.object({ type: z.literal("extend_hand"), ...hand, amount: z.number().int().min(0).max(100) });
export const Grip = z.object({ type: z.literal("grip"), ...hand, slot: z.number().int().min(0).optional() });
export const Release = z.object({ type: z.literal("release"), ...hand, slot: z.number().int().min(0).optional() });
export const TiltPour = z.object({ type: z.literal("tilt_pour"), ...hand, amount: z.number().int().min(1).max(1000), slot: z.number().int().min(0).optional() });
export const Press = z.object({ type: z.literal("press"), ...hand, control: Ref });
export const Wait = z.object({ type: z.literal("wait"), ...robot, ticks: z.number().int().min(1).max(600) });

export const Primitive = z.discriminatedUnion("type", [MoveAlongRail, SetHandHeight, ExtendHand, Grip, Release, TiltPour, Press, Wait]);
export type Primitive = z.infer<typeof Primitive>;
export const PRIMITIVE_TYPES = Primitive.options.map((o) => o.shape.type.value);

// ---- Tier 2: macros (expanded into primitives by sim-core) ----
export const GoTo = z.object({ type: z.literal("go_to"), ...robot, station: Ref });
export const Pick = z.object({ type: z.literal("pick"), ...robot, item: Ref, hand: HandId.optional() });
export const Place = z.object({ type: z.literal("place"), ...robot, item: Ref, target: Ref.describe("equipment or hood id") });
export const Transfer = z.object({ type: z.literal("transfer"), ...robot, from: Ref, to: Ref, amount: z.number().int().min(1).max(1000) });
export const Operate = z.object({
  type: z.literal("operate"),
  ...robot,
  equipment: Ref,
  settings: z.record(z.string(), z.union([z.number().int(), z.boolean()])),
});
export const Analyze = z.object({ type: z.literal("analyze"), ...robot, sample: Ref });

export const Macro = z.discriminatedUnion("type", [GoTo, Pick, Place, Transfer, Operate, Analyze]);
export type Macro = z.infer<typeof Macro>;
export const MACRO_TYPES = Macro.options.map((o) => o.shape.type.value);

// ---- Session actions (not queued on a robot; applied at the next tick) ----
export const ReadLog = z.object({ type: z.literal("read_log"), limit: z.number().int().min(1).max(200).optional() });
export const Commit = z.object({
  type: z.literal("commit"),
  result: z.object({ item: Ref.optional(), answer: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional() }),
});
export const Cancel = z.object({ type: z.literal("cancel"), ...robot });
export const SetController = z.object({ type: z.literal("set_controller"), ...robot, controller: z.enum(CONTROLLER_KINDS) });

export const SessionAction = z.discriminatedUnion("type", [ReadLog, Commit, Cancel, SetController]);
export type SessionAction = z.infer<typeof SessionAction>;

/** Anything a controller may submit. */
export const Action = z.discriminatedUnion("type", [...Primitive.options, ...Macro.options, ...SessionAction.options]);
export type Action = z.infer<typeof Action>;

/** What the sim's step() consumes and the event log replays: primitives plus session actions. */
export const StepAction = z.discriminatedUnion("type", [...Primitive.options, ...SessionAction.options]);
export type StepAction = z.infer<typeof StepAction>;

export const ActorSchema = z.enum(ACTORS);

export const ActionResult = z.object({ ok: z.boolean(), reason: z.string().optional(), seq: z.number().int().optional() });
export type ActionResult = z.infer<typeof ActionResult>;

/**
 * One event-log record. `action` is a StepAction (replayed) or a Macro (annotation only:
 * replay uses the primitives it expanded into, which are logged separately).
 */
export const SimEvent = z.object({
  tick: z.number().int().min(0),
  actor: ActorSchema,
  robot: z.string().nullable(),
  action: Action,
  result: ActionResult,
});
export type SimEvent = z.infer<typeof SimEvent>;

export const isPrimitive = (a: Action): a is Primitive => (PRIMITIVE_TYPES as string[]).includes(a.type);
export const isMacro = (a: Action): a is Macro => (MACRO_TYPES as string[]).includes(a.type);
export const isStepAction = (a: Action): a is StepAction => !isMacro(a);
