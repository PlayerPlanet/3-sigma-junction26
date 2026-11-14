import { z } from "zod";
import { CONTROLLER_KINDS } from "./constants.js";
import { EquipmentType, LabLayout, Pathway, Scenario, Vec2 } from "./content.js";

/** Rail segment sampled to a polyline by sim-core, so the renderer needs no rail geometry code. */
export const RailPolyline = z.object({ id: z.string(), points: z.array(Vec2) });
export type RailPolyline = z.infer<typeof RailPolyline>;

/** A place robots work at (equipment or hood), with the numbers a controller needs to work there. */
export const PlaceInfo = z.object({
  id: z.string(),
  kind: z.enum(["equipment", "hood"]),
  type: z.string().nullable(),
  name: z.string(),
  station: z.string(),
  node: z.string(),
  /** Hand level for grip / release / press; pour from one level above. */
  workLevel: z.number().int(),
  /** Extension percent that puts the gripper over the place (±10 tolerance). */
  reach: z.number().int(),
  capacity: z.number().int(),
  controls: z.array(z.string()),
});
export type PlaceInfo = z.infer<typeof PlaceInfo>;

/** The static lab: everything that does not change during a session. */
export const LabView = z.object({
  layout: LabLayout,
  equipmentTypes: z.record(z.string(), EquipmentType),
  rails: z.array(RailPolyline),
  places: z.array(PlaceInfo),
  /** What is being played. The pathway's public description only; the optimum is hidden in state. */
  scenario: Scenario.nullable(),
  pathway: Pathway.pick({ id: true, name: true, product: true, summary: true, reagents: true, filter: true }).nullable(),
  /** Dispenser reagent order (index = `operate` setting `reagent`). */
  reagents: z.array(z.string()),
});
export type LabView = z.infer<typeof LabView>;

// ---------- Snapshots: the moving parts, derived from sim state for rendering and controllers ----------

export const HandPose = z.object({
  id: z.enum(["a", "b"]),
  /** Mast level, 0 = lowest. */
  level: z.number().int().nonnegative(),
  /** Height in metres above the floor, derived from level (render only). */
  height: z.number(),
  /** 0 = retracted, 1 = full reach. */
  extend: z.number().min(0).max(1),
  gripping: z.boolean(),
  holding: z.string().nullable(),
  /** "work" = positioned to grip/release/press at the robot's station, "pour" = positioned to pour there. */
  spot: z.enum(["work", "pour"]).nullable(),
});
export type HandPose = z.infer<typeof HandPose>;

export const RobotPose = z.object({
  id: z.string(),
  x: z.number(),
  z: z.number(),
  /** Radians, 0 = +x, measured toward +z. The direction the hands extend (render only). */
  heading: z.number(),
  /** Station the robot is parked at, if any. */
  station: z.string().nullable(),
  /** Rail node the robot is parked at, or null while moving. */
  node: z.string().nullable(),
  controller: z.enum(CONTROLLER_KINDS),
  /** Primitive in progress, e.g. "move_along_rail", or null when idle. */
  busy: z.string().nullable(),
  /** Requests waiting or running in the robot's queue (filled in by the server's runner). */
  queued: z.number().int().default(0),
  last: z.object({ type: z.string(), status: z.string(), reason: z.string().optional() }).nullable(),
  hands: z.tuple([HandPose, HandPose]),
});
export type RobotPose = z.infer<typeof RobotPose>;

export const ItemLocation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("place"), place: z.string(), slot: z.number().int() }),
  z.object({ kind: z.literal("hand"), robot: z.string(), hand: z.enum(["a", "b"]) }),
  z.object({ kind: z.literal("waste") }),
]);
export type ItemLocation = z.infer<typeof ItemLocation>;

/** An item (flask, beaker). x/y/z is the bottom centre; null when discarded. */
export const ItemPose = z.object({
  id: z.string(),
  type: z.enum(["flask", "beaker"]),
  location: ItemLocation,
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }).nullable(),
  /** reagent id -> units */
  contents: z.record(z.string(), z.number().int()),
  volume: z.number().int(),
  capacity: z.number().int(),
  /** °C */
  temp: z.number().int(),
});
export type ItemPose = z.infer<typeof ItemPose>;

export const EquipmentSnapshot = z.object({
  id: z.string(),
  settings: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  busyUntil: z.number().int().nullable(),
});
export type EquipmentSnapshot = z.infer<typeof EquipmentSnapshot>;

export const LogEntry = z.object({
  tick: z.number().int(),
  level: z.enum(["info", "warn", "result"]),
  source: z.string(),
  text: z.string(),
});
export type LogEntry = z.infer<typeof LogEntry>;

export const Snapshot = z.object({
  tick: z.number().int(),
  robots: z.array(RobotPose),
  items: z.array(ItemPose),
  equipment: z.array(EquipmentSnapshot),
  /** Most recent lab log entries (tail). */
  log: z.array(LogEntry),
  /** Units of reagent spilled or discarded. */
  waste: z.number().int(),
  /** Units of reagent dispensed so far. */
  reagentsUsed: z.number().int(),
  session: z
    .object({
      scenario: z.string(),
      status: z.enum(["running", "committed", "timeout"]),
      score: z.number().int().nullable(),
      trueYield: z.number().int().nullable(),
      committedItem: z.string().nullable(),
      ticksLeft: z.number().int(),
      reagentsLeft: z.number().int(),
    })
    .nullable(),
});
export type Snapshot = z.infer<typeof Snapshot>;
