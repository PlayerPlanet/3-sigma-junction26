import type { EquipmentType, HandPose, ItemPose, LabLayout, LabView, RobotPose, Snapshot } from "@lab-rats/shared";
import { volume } from "../chemistry/contents.js";
import { VESSELS } from "../constants.js";
import { handHeight } from "../robots/kinematics.js";
import type { RobotState, SimState } from "../state.js";
import { compileWorld, HAND_BASE_REACH, type World } from "./compile.js";
import { samplePolyline } from "./rails.js";
import { handAtPlace } from "../actions/spot.js";

/**
 * Render-only derivations from integer state: positions, headings and heights in metres. Uses trig, so
 * nothing here may feed back into SimState or the state hash.
 */

/** The static lab sent once per connection. */
export function buildLabView(layout: LabLayout, types: Record<string, EquipmentType>): LabView {
  return labView(compileWorld(layout, types));
}

export function labView(world: World): LabView {
  return {
    layout: world.layout,
    equipmentTypes: world.types,
    rails: [...world.graph.segments.values()].map((g) => ({ id: g.segment.id, points: samplePolyline(g) })),
    places: world.placeIds.map((id) => {
      const p = world.places.get(id)!;
      const type = p.typeId ? world.types[p.typeId] : undefined;
      const station = world.layout.stations.find((s) => s.id === p.station)!;
      return {
        id,
        kind: p.kind,
        type: p.typeId,
        name: type?.name ?? station.label,
        station: p.station,
        node: p.node,
        workLevel: p.workLevel,
        reach: p.reach,
        capacity: p.capacity,
        controls: type?.controls ?? [],
      };
    }),
    scenario: world.scenario,
    pathway: world.pathway
      ? { id: world.pathway.id, name: world.pathway.name, product: world.pathway.product, summary: world.pathway.summary, reagents: world.pathway.reagents, filter: world.pathway.filter }
      : null,
    reagents: world.reagents,
  };
}

/** Side offset of each hand from the mast, along the robot's local +x (matches the web renderer). */
export const HAND_SIDE_OFFSET = { a: -0.07, b: 0.07 } as const;
const GRIP_DEPTH = 0.1; // an item hangs this far below the hand

function robotPlacement(world: World, r: RobotState): { x: number; z: number; heading: number; station: string | null; node: string | null } {
  const nodes = world.graph.nodes;
  if ("node" in r.rail) {
    const n = nodes.get(r.rail.node)!;
    const station = world.stationByNode.get(r.rail.node) ?? null;
    const place = station ? world.placeByStation.get(station) : undefined;
    let heading = 0;
    if (place) heading = Math.atan2(place.target.z - n.z, place.target.x - n.x);
    else {
      // Not at a station: face along the first rail segment.
      const nb = world.neighbours.get(r.rail.node)?.[0];
      const o = nb ? nodes.get(nb.node)! : n;
      heading = Math.atan2(o.z - n.z, o.x - n.x);
    }
    return { x: n.x, z: n.z, heading, station, node: r.rail.node };
  }
  const geo = world.graph.segments.get(r.rail.segment)!;
  const forward = geo.segment.from === r.rail.from;
  const t = r.rail.progress / r.rail.length;
  const p = geo.pointAt(forward ? t : 1 - t);
  const q = geo.pointAt(Math.min(1, Math.max(0, forward ? t + 0.02 : 1 - t - 0.02)));
  const heading = Math.atan2(q.z - p.z, q.x - p.x);
  return { x: p.x, z: p.z, heading, station: null, node: null };
}

/** World position of a slot on a place (bottom centre of the item standing there). */
function slotPosition(world: World, placeId: string, slot: number): { x: number; y: number; z: number } {
  const place = world.places.get(placeId)!;
  let local: [number, number, number];
  if (place.kind === "hood") {
    const hood = world.layout.hoods.find((h) => h.id === placeId)!;
    local = [-hood.width / 2 + ((slot + 0.5) * hood.width) / place.capacity, 0, 0];
  } else {
    const type = world.types[place.typeId!]!;
    const [w, h] = type.size;
    if (type.slots > 0) local = [-w / 2 + ((slot + 0.5) * w) / type.slots, h, 0];
    else local = type.holdOffset ?? [0, h, 0];
  }
  const c = Math.cos(place.rotationY);
  const s = Math.sin(place.rotationY);
  // three.js y-rotation: (x, z) -> (x cos + z sin, -x sin + z cos)
  return { x: place.target.x + local[0] * c + local[2] * s, y: place.surfaceHeight + local[1], z: place.target.z - local[0] * s + local[2] * c };
}

export function snapshot(world: World, state: SimState, logTail = 40): Snapshot {
  const spec = world.layout.robotSpec;
  const poses = new Map<string, RobotPose>();
  for (const id of world.robotIds) {
    const r = state.robots[id]!;
    const at = robotPlacement(world, r);
    const hand = (h: "a" | "b"): HandPose => ({
      id: h,
      level: r.hands[h].level,
      height: handHeight(spec, r.hands[h].level),
      extend: r.hands[h].extend / 100,
      gripping: r.hands[h].gripping,
      holding: r.hands[h].holding,
      spot: "place" in handAtPlace(world, r, h) ? "work" : "place" in handAtPlace(world, r, h, 1) ? "pour" : null,
    });
    poses.set(id, {
      id,
      ...at,
      controller: r.controller,
      busy: r.task?.action.type ?? null,
      queued: 0,
      last: r.last ? { type: r.last.type, status: r.last.status, ...(r.last.reason ? { reason: r.last.reason } : {}) } : null,
      hands: [hand("a"), hand("b")],
    });
  }

  const items: ItemPose[] = Object.keys(state.items)
    .sort()
    .map((id) => {
      const it = state.items[id]!;
      let position: ItemPose["position"] = null;
      if (it.location.kind === "place") position = slotPosition(world, it.location.place, it.location.slot);
      if (it.location.kind === "hand") {
        const pose = poses.get(it.location.robot)!;
        const h = it.location.hand;
        const reach = HAND_BASE_REACH + (state.robots[pose.id]!.hands[h].extend / 100) * spec.maxReach;
        const dx = Math.cos(pose.heading);
        const dz = Math.sin(pose.heading);
        const side = HAND_SIDE_OFFSET[h];
        position = { x: pose.x + dx * reach - dz * side, y: handHeight(spec, state.robots[pose.id]!.hands[h].level) - GRIP_DEPTH, z: pose.z + dz * reach + dx * side };
      }
      return { id, type: it.type, location: it.location, position, contents: { ...it.contents }, volume: volume(it.contents), capacity: VESSELS[it.type].capacity, temp: it.temp };
    });

  return {
    tick: state.tick,
    robots: [...poses.values()],
    items,
    equipment: world.equipmentIds.map((id) => ({ id, settings: { ...state.equipment[id]!.settings }, busyUntil: state.equipment[id]!.busyUntil })),
    log: state.log.slice(-logTail),
    waste: state.waste,
    reagentsUsed: state.reagentsUsed,
    session:
      state.scenario && world.scenario
        ? {
            scenario: state.scenario.id,
            status: state.scenario.status,
            score: state.scenario.score,
            trueYield: state.scenario.trueYield,
            committedItem: state.scenario.committedItem,
            ticksLeft: Math.max(0, world.scenario.budget.ticks - state.tick),
            reagentsLeft: world.scenario.budget.reagents - state.reagentsUsed,
          }
        : null,
  };
}
