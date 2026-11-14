import type { Actor, ControllerKind, HandId, ItemLocation, LogEntry, Primitive } from "@lab-rats/shared";
import { AMBIENT_TEMP } from "./constants.js";
import { behaviorFor } from "./equipment/index.js";
import { seedRng } from "./rng/rng.js";
import { initScenario } from "./scoring/scenario.js";
import type { World } from "./world/compile.js";

/**
 * The complete, JSON-serializable simulation state. Integers only (see docs/DECISIONS.md, M3), so the
 * state hash is identical across JS engines. Never holds functions, Maps or class instances.
 */
export interface HandState {
  level: number;
  /** percent 0..100 */
  extend: number;
  gripping: boolean;
  holding: string | null;
}

export type RailPos =
  | { node: string }
  | { segment: string; from: string; to: string; /** mm travelled */ progress: number; /** mm */ length: number };

export interface Task {
  seq: number;
  action: Primitive;
  actor: Actor;
  startTick: number;
  /** Generic countdown (grip, release, wait, per-level hand moves). */
  remaining: number;
  /** move_along_rail: nodes still to visit. */
  route: string[];
  /** move_along_rail: consecutive ticks waiting for the rail. */
  blocked: number;
  /** tilt_pour: units moved so far. */
  poured: number;
}

export type TaskStatus = "ok" | "invalid" | "blocked" | "cancelled" | "failed";

export interface LastResult {
  seq: number;
  type: Primitive["type"];
  status: TaskStatus;
  reason?: string;
  startTick: number;
  endTick: number;
}

export interface RobotState {
  id: string;
  rail: RailPos;
  hands: Record<HandId, HandState>;
  controller: ControllerKind;
  task: Task | null;
  last: LastResult | null;
  /** Number of primitives this robot has been given (started or rejected). */
  seq: number;
  cancelRequested: boolean;
}

/** What has happened to a vessel's mixture, for the yield model (chemistry/pathway.ts). */
export interface ItemProcess {
  /** Tick the pathway's two reagents first met, or null. */
  combinedAt: number | null;
  combinedInHood: boolean;
  /** Per-run yield noise (percentage points), drawn when the reagents first meet. */
  noise: number;
  cookTicks: number;
  tempSum: number;
  stirTicks: number;
  overheatTicks: number;
  filtered: boolean;
}

export interface ItemState {
  id: string;
  type: "flask" | "beaker";
  location: ItemLocation;
  /** reagent id -> units */
  contents: Record<string, number>;
  temp: number;
  process: ItemProcess;
}

export interface FaultState {
  id: string;
  /** What the fault affects (e.g. an item id), or null. */
  target: string | null;
  clued: boolean;
}

export interface ScenarioState {
  id: string;
  /** Hidden truth drawn from the seed: optimum add-share (per mille) and cooking temperature (°C). */
  hidden: { share: number; temp: number };
  faults: FaultState[];
  status: "running" | "committed" | "timeout";
  score: number | null;
  trueYield: number | null;
  committedItem: string | null;
  /** Research: the committed answer (whole percent of the added reagent, whole °C). */
  answer: { add_share: number; temp: number } | null;
  endTick: number | null;
}

export type Setting = number | boolean | string;

export interface EquipmentState {
  settings: Record<string, Setting>;
  busyUntil: number | null;
}

export interface CommitRecord {
  tick: number;
  actor: Actor;
  item?: string;
  answer?: Record<string, number | string | boolean>;
}

export interface SimState {
  schema: 1;
  seed: number;
  tick: number;
  rng: number;
  robots: Record<string, RobotState>;
  items: Record<string, ItemState>;
  /** place id (equipment or hood) -> slot contents (item ids) */
  places: Record<string, (string | null)[]>;
  equipment: Record<string, EquipmentState>;
  log: LogEntry[];
  waste: number;
  /** Units dispensed (for the reagent budget). */
  reagentsUsed: number;
  /** Analyzer runs started (research scenarios budget them). */
  analyses: number;
  commits: CommitRecord[];
  scenario: ScenarioState | null;
}

export const emptyProcess = (): ItemProcess => ({
  combinedAt: null,
  combinedInHood: false,
  noise: 0,
  cookTicks: 0,
  tempSum: 0,
  stirTicks: 0,
  overheatTicks: 0,
  filtered: false,
});

/** Every robot starts "idle"; a session assigns controllers with logged set_controller actions. */
export function createInitialState(world: World, seed: number): SimState {
  const { layout } = world;
  const spec = layout.robotSpec;
  const working = Math.min(spec.handLevels - 2, Math.floor(spec.handLevels / 2));
  const stationNode = new Map(layout.stations.map((s) => [s.id, s.node]));

  const robots: Record<string, RobotState> = {};
  for (const r of layout.robots) {
    const hand = (level: number): HandState => ({ level, extend: 0, gripping: false, holding: null });
    robots[r.id] = {
      id: r.id,
      rail: { node: stationNode.get(r.start) ?? r.start },
      hands: { a: hand(working), b: hand(working + 1) },
      controller: "idle",
      task: null,
      last: null,
      seq: 0,
      cancelRequested: false,
    };
  }

  const places: Record<string, (string | null)[]> = {};
  for (const id of world.placeIds) places[id] = Array.from({ length: world.places.get(id)!.capacity }, () => null);

  const items: Record<string, ItemState> = {};
  for (const it of layout.items) {
    places[it.on]![it.slot] = it.id;
    items[it.id] = { id: it.id, type: it.type, location: { kind: "place", place: it.on, slot: it.slot }, contents: {}, temp: AMBIENT_TEMP, process: emptyProcess() };
  }

  const equipment: Record<string, EquipmentState> = {};
  for (const eq of layout.equipment) equipment[eq.id] = { settings: behaviorFor(eq.type).initialSettings?.() ?? {}, busyUntil: null };

  const state: SimState = {
    schema: 1,
    seed,
    tick: 0,
    rng: seedRng(seed),
    robots,
    items,
    places,
    equipment,
    log: [],
    waste: 0,
    reagentsUsed: 0,
    analyses: 0,
    commits: [],
    scenario: null,
  };
  if (world.scenario && world.pathway) state.scenario = initScenario(world, state);
  return state;
}

export function cloneState(s: SimState): SimState {
  return JSON.parse(JSON.stringify(s)) as SimState;
}

export function log(state: SimState, level: LogEntry["level"], source: string, text: string): void {
  state.log.push({ tick: state.tick, level, source, text });
}
