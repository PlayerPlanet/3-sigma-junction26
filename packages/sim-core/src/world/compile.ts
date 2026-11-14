import type { EquipmentType, LabLayout, Pathway, Scenario, Vec2 } from "@lab-rats/shared";
import { HOOD_CAPACITY, REACH_TOLERANCE } from "../constants.js";
import { behaviorFor } from "../equipment/index.js";
import { handHeight } from "../robots/kinematics.js";
import { buildRailGraph, type RailGraph } from "./rails.js";
import { surfaceHeight, stationTarget } from "./stations.js";
import { LayoutError, validateLayout } from "./validate.js";

/** Gripper reach beyond the mast at extend = 0: sleeve + arm stub + fingers (matches the hand primitive). */
export const HAND_BASE_REACH = 0.28;

/** Something a robot works at: a piece of equipment or a fume hood. */
export interface Place {
  id: string;
  kind: "equipment" | "hood";
  /** Equipment type id; null for hoods. */
  typeId: string | null;
  station: string;
  node: string;
  target: Vec2;
  rotationY: number;
  surfaceHeight: number;
  /** Lowest hand level that clears the surface; grip/release/press happen here, pouring one level above. */
  workLevel: number;
  /** Extension (percent) that puts the gripper over this place. */
  reach: number;
  /** Item slots; 0 for sinks and places that hold nothing. */
  capacity: number;
  sink: boolean;
  pourable: boolean;
}

export interface Neighbour {
  segment: string;
  node: string;
  /** Integer millimetres. */
  length: number;
}

/** Static, precomputed view of a layout used by every sim function. Never mutated. */
export interface World {
  layout: LabLayout;
  types: Record<string, EquipmentType>;
  graph: RailGraph;
  /** node id -> neighbours, sorted by segment id for deterministic iteration. */
  neighbours: Map<string, Neighbour[]>;
  segmentLength: Map<string, number>;
  places: Map<string, Place>;
  placeByStation: Map<string, Place>;
  stationByNode: Map<string, string>;
  robotIds: string[];
  placeIds: string[];
  equipmentIds: string[];
  /** The scenario being played and its pathway, if any (a bare lab has neither). */
  scenario: Scenario | null;
  pathway: Pathway | null;
  /** Reagents the dispenser offers, in order. */
  reagents: string[];
}

export interface WorldOptions {
  scenario?: Scenario;
  pathways?: Record<string, Pathway>;
}

/** Placeholder reagents for a lab without a scenario (tests, the M3 demo). */
export const PLACEHOLDER_REAGENTS = ["reagent_a", "reagent_b", "reagent_c"];

function workLevelFor(layout: LabLayout, height: number): number {
  for (let l = 0; l < layout.robotSpec.handLevels; l++) if (handHeight(layout.robotSpec, l) > height) return l;
  return layout.robotSpec.handLevels - 1;
}

export function compileWorld(layout: LabLayout, types: Record<string, EquipmentType>, opts: WorldOptions = {}): World {
  validateLayout(layout, types);
  const graph = buildRailGraph(layout);
  const segmentLength = new Map([...graph.segments].map(([id, g]) => [id, Math.max(1, Math.round(g.length * 1000))]));
  const neighbours = new Map<string, Neighbour[]>();
  for (const n of layout.rails.nodes) neighbours.set(n.id, []);
  for (const seg of [...layout.rails.segments].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const length = segmentLength.get(seg.id)!;
    neighbours.get(seg.from)!.push({ segment: seg.id, node: seg.to, length });
    neighbours.get(seg.to)!.push({ segment: seg.id, node: seg.from, length });
  }

  const stationNode = new Map(layout.stations.map((s) => [s.id, s.node]));
  const nodes = new Map(layout.rails.nodes.map((n) => [n.id, n]));
  const problems: string[] = [];
  const places = new Map<string, Place>();
  const reachTo = (id: string, station: string): number => {
    const node = nodes.get(stationNode.get(station)!)!;
    const target = stationTarget(layout, station)!;
    const raw = Math.round(((Math.hypot(target.x - node.x, target.z - node.z) - HAND_BASE_REACH) / layout.robotSpec.maxReach) * 100);
    if (raw > 100 + REACH_TOLERANCE) problems.push(`"${id}" is out of reach from its station (needs ${raw}% extension)`);
    return Math.min(100, Math.max(0, raw));
  };

  for (const eq of layout.equipment) {
    const type = types[eq.type]!;
    const b = behaviorFor(eq.type);
    const sink = b.sink ?? false;
    const surface = surfaceHeight(layout, eq.surface);
    places.set(eq.id, {
      id: eq.id,
      kind: "equipment",
      typeId: eq.type,
      station: eq.station,
      node: stationNode.get(eq.station)!,
      target: eq.position,
      rotationY: eq.rotationY,
      surfaceHeight: surface,
      workLevel: workLevelFor(layout, surface),
      reach: reachTo(eq.id, eq.station),
      capacity: sink ? 0 : b.capacity ? b.capacity(type) : Math.max(1, type.slots),
      sink,
      pourable: b.pourable ?? true,
    });
  }
  for (const hood of layout.hoods) {
    const surface = layout.table.height; // hood worktops match the table height
    places.set(hood.id, {
      id: hood.id,
      kind: "hood",
      typeId: null,
      station: hood.station,
      node: stationNode.get(hood.station)!,
      target: stationTarget(layout, hood.station)!,
      rotationY: hood.wall === "north" ? Math.PI : 0,
      surfaceHeight: surface,
      workLevel: workLevelFor(layout, surface),
      reach: reachTo(hood.id, hood.station),
      capacity: HOOD_CAPACITY,
      sink: false,
      pourable: true,
    });
  }
  for (const level of new Set([...places.values()].map((p) => p.workLevel))) {
    if (level + 1 >= layout.robotSpec.handLevels) problems.push(`work level ${level} leaves no level above it for pouring`);
  }
  const scenario = opts.scenario ?? null;
  const pathway = scenario ? opts.pathways?.[scenario.pathway] ?? null : null;
  if (scenario && !pathway) problems.push(`scenario "${scenario.id}": unknown pathway "${scenario.pathway}"`);
  if (pathway) {
    const ids = pathway.reagents.map((r) => r.id);
    for (const r of [pathway.combine.base, pathway.combine.add]) if (!ids.includes(r)) problems.push(`pathway "${pathway.id}": "${r}" is not one of its reagents`);
  }
  if (problems.length) throw new LayoutError(problems);

  const sortIds = (ids: Iterable<string>) => [...ids].sort();
  return {
    layout,
    types,
    graph,
    neighbours,
    segmentLength,
    places,
    placeByStation: new Map([...places.values()].map((p) => [p.station, p])),
    stationByNode: new Map(layout.stations.map((s) => [s.node, s.id])),
    robotIds: sortIds(layout.robots.map((r) => r.id)),
    placeIds: sortIds(places.keys()),
    equipmentIds: sortIds(layout.equipment.map((e) => e.id)),
    scenario,
    pathway,
    reagents: pathway ? pathway.reagents.map((r) => r.id) : PLACEHOLDER_REAGENTS,
  };
}
