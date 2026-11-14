import { z } from "zod";

/**
 * Content schemas (JSON under content/). Coordinates: metres, x along the room's long axis,
 * z across it (negative z = north wall), y up. Origin is the room centre at floor level.
 */

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, "ids are snake_case");
const AssetId = z.string().regex(/^[a-z]+(\.[a-z0-9_]+)+$/, "asset ids look like equip.hotplate_stirrer");
export const Vec2 = z.object({ x: z.number(), z: z.number() });
export type Vec2 = z.infer<typeof Vec2>;

export const RailNode = z.object({ id: Id, x: z.number(), z: z.number() });
export type RailNode = z.infer<typeof RailNode>;

/** A rail segment between two nodes: straight, or a circular arc around `arc`'s centre. */
export const RailSegment = z.object({
  id: Id,
  from: Id,
  to: Id,
  arc: z.object({ cx: z.number(), cz: z.number(), ccw: z.boolean() }).optional(),
});
export type RailSegment = z.infer<typeof RailSegment>;

export const Station = z.object({ id: Id, node: Id, label: z.string() });
export type Station = z.infer<typeof Station>;

export const Hood = z.object({
  id: Id,
  wall: z.enum(["north", "south"]),
  x: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  station: Id,
});
export type Hood = z.infer<typeof Hood>;

export const EquipmentPlacement = z.object({
  id: Id,
  type: Id,
  position: Vec2,
  surface: z.enum(["table", "floor"]),
  rotationY: z.number().default(0),
  station: Id,
});
export type EquipmentPlacement = z.infer<typeof EquipmentPlacement>;

export const ItemPlacement = z.object({
  id: Id,
  type: z.enum(["flask", "beaker"]),
  /** Equipment it starts on (e.g. a glassware rack); slot index picks the spot. */
  on: Id,
  slot: z.number().int().nonnegative(),
});
export type ItemPlacement = z.infer<typeof ItemPlacement>;

export const RobotSpec = z.object({
  mastHeight: z.number().positive(),
  handLevels: z.number().int().min(2),
  maxReach: z.number().positive(),
});
export type RobotSpec = z.infer<typeof RobotSpec>;

/** `start` is a station id or a rail node id (e.g. a dock at the end of a rail, so no station starts blocked). */
export const RobotPlacement = z.object({ id: Id, label: z.string(), color: z.string(), start: Id });
export type RobotPlacement = z.infer<typeof RobotPlacement>;

export const LabLayout = z.object({
  id: Id,
  room: z.object({ width: z.number().positive(), depth: z.number().positive(), height: z.number().positive() }),
  table: z.object({
    shape: z.literal("stadium"),
    center: Vec2,
    straightLength: z.number().positive(),
    radius: z.number().positive(),
    height: z.number().positive(),
  }),
  rails: z.object({ nodes: z.array(RailNode).min(2), segments: z.array(RailSegment).min(1) }),
  stations: z.array(Station),
  hoods: z.array(Hood),
  equipment: z.array(EquipmentPlacement),
  items: z.array(ItemPlacement),
  robotSpec: RobotSpec,
  robots: z.array(RobotPlacement).min(1),
});
export type LabLayout = z.infer<typeof LabLayout>;

/** One file per type in content/equipment/. Controls are names only until milestone 5. */
export const EquipmentType = z.object({
  id: Id,
  name: z.string(),
  assetId: AssetId,
  /** Footprint and height in metres: [width (x), height (y), depth (z)]. */
  size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  controls: z.array(Id).default([]),
  /** Item slots spread across the width (e.g. a glassware rack). 0 = the behaviour decides (usually 1). */
  slots: z.number().int().nonnegative().default(0),
  /** Where a held item sits, local to the equipment base (front = -z), metres. Default: centre of the top. */
  holdOffset: z.tuple([z.number(), z.number(), z.number()]).optional(),
});
export type EquipmentType = z.infer<typeof EquipmentType>;

/**
 * Pathways: abstract, game-level step graphs with invented numbers (not real procedures).
 * The yield model lives in sim-core/chemistry; this is only the data it reads.
 */
export const Reagent = z.object({ id: Id, name: z.string(), color: z.string() });
export type Reagent = z.infer<typeof Reagent>;

export const Pathway = z.object({
  id: Id,
  name: z.string(),
  product: z.string(),
  /** One-paragraph flavour text and the steps in plain words, shown to players and agents. */
  summary: z.string(),
  reagents: z.array(Reagent).min(2),
  combine: z.object({
    /** The base reagent and the one added to it; their ratio matters. */
    base: Id,
    add: Id,
    /** Hidden optimum share of `add` in (base + add), drawn per seed from this range (0..1). */
    shareRange: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
    /** Score falls to 0 this far (share units) from the optimum. */
    shareTolerance: z.number().positive(),
    /** Whether base and add must first meet inside a fume hood. */
    inHood: z.boolean(),
  }),
  heat: z.object({
    /** Hidden optimum temperature (°C) drawn per seed from this range. */
    tempRange: z.tuple([z.number().int(), z.number().int()]),
    tempTolerance: z.number().positive(),
    /** Heating counts as cooking at or above this temperature. */
    cookFrom: z.number().int(),
    /** Ticks of cooking needed for full conversion. */
    minTicks: z.number().int().positive(),
    stir: z.boolean(),
  }),
  /** Whether the product must pass the filter station after cooking. */
  filter: z.boolean().default(false),
  /** Per-run yield noise (± percentage points) and analyzer reading noise. */
  runNoise: z.number().int().nonnegative(),
  analyzerNoise: z.number().int().nonnegative(),
  /** Lab-log clues shown when a step went wrong (players must interpret them). */
  clues: z.object({ notInHood: z.string(), overheated: z.string() }),
});
export type Pathway = z.infer<typeof Pathway>;

export const FaultChance = z.object({ id: Id, chance: z.number().min(0).max(1) });

export const Scenario = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("order"),
    id: Id,
    title: z.string(),
    brief: z.string(),
    pathway: Id,
    /** Minimum true yield (%) the customer accepts. */
    targetYield: z.number().int().min(1).max(100),
    budget: z.object({ ticks: z.number().int().positive(), reagents: z.number().int().positive() }),
    faults: z.array(FaultChance).default([]),
  }),
]);
export type Scenario = z.infer<typeof Scenario>;
