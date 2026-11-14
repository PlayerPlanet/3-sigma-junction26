import type { Actor, Primitive } from "@lab-rats/shared";
import { volume } from "../chemistry/contents.js";
import type { RobotState, SimState, Task } from "../state.js";
import type { World } from "../world/compile.js";
import { shortestPath } from "../world/path.js";
import { firstSlot, handAtPlace, parkedNode, placeAtRobot } from "./spot.js";

/**
 * Start-of-primitive checks. Returns the reason a primitive cannot start, or null if it can.
 * Checks that depend on how the task unfolds (e.g. whether there is anything to grip) happen at completion.
 */
export function startProblem(world: World, state: SimState, r: RobotState, a: Primitive): string | null {
  const spec = world.layout.robotSpec;
  const hand = "hand" in a ? r.hands[a.hand] : null;
  switch (a.type) {
    case "move_along_rail": {
      if (r.hands.a.extend > 0 || r.hands.b.extend > 0) return "retract both hands before moving";
      const to = resolveNode(world, a.to);
      if (!to) return `unknown station or rail node "${a.to}"`;
      if (shortestPath(world, parkedNode(r)!, to) === null) return `no rail route to ${a.to}`;
      return null;
    }
    case "set_hand_height":
      if (a.level >= spec.handLevels) return `level must be 0..${spec.handLevels - 1}`;
      if (hand!.extend > 0) return `retract hand ${a.hand} before moving it up or down`;
      return null;
    case "extend_hand": {
      const place = placeAtRobot(world, r);
      if (a.amount > 0 && place && hand!.level < place.workLevel) {
        return `hand ${a.hand} would hit the ${place.kind === "hood" ? "hood worktop" : "table"}: raise it to level ${place.workLevel} or higher first`;
      }
      return null;
    }
    case "grip":
      if (hand!.holding) return `hand ${a.hand} is already holding ${hand!.holding}`;
      return null;
    case "release": {
      if (!hand!.holding) return null; // just opens the gripper
      const at = handAtPlace(world, r, a.hand);
      if ("reason" in at) return `nothing to put ${hand!.holding} on: ${at.reason}`;
      if (at.place.sink) return null;
      if (firstSlot(state.places[at.place.id]!, "free", a.slot) === null) {
        return a.slot === undefined ? `${at.place.id} has no free space` : `slot ${a.slot} of ${at.place.id} is not free`;
      }
      return null;
    }
    case "tilt_pour": {
      if (!hand!.holding) return `hand ${a.hand} is not holding a vessel`;
      if (volume(state.items[hand!.holding]!.contents) === 0) return `${hand!.holding} is empty`;
      const at = handAtPlace(world, r, a.hand, 1);
      if ("reason" in at) return `cannot pour here: ${at.reason}`;
      if (!at.place.pourable) return `${at.place.id} is not somewhere to pour`;
      if (!at.place.sink && firstSlot(state.places[at.place.id]!, "occupied", a.slot) === null) return `no vessel below to pour into at ${at.place.id}`;
      return null;
    }
    case "press": {
      const at = handAtPlace(world, r, a.hand);
      if ("reason" in at) return `cannot press: ${at.reason}`;
      if (at.place.kind !== "equipment") return `${at.place.id} has no controls`;
      const controls = world.types[at.place.typeId!]!.controls;
      if (!controls.includes(a.control)) return `${at.place.id} has no control "${a.control}" (controls: ${controls.join(", ") || "none"})`;
      return null;
    }
    case "wait":
      return null;
  }
}

/** Station id or node id -> node id. */
export function resolveNode(world: World, ref: string): string | null {
  const station = world.layout.stations.find((s) => s.id === ref);
  if (station) return station.node;
  return world.neighbours.has(ref) ? ref : null;
}

export function newTask(world: World, state: SimState, r: RobotState, a: Primitive, actor: Actor, seq: number): Task {
  const task: Task = { seq, action: a, actor, startTick: state.tick, remaining: 0, route: [], blocked: 0, poured: 0 };
  if (a.type === "move_along_rail") {
    const parked = new Set(Object.values(state.robots).filter((o) => o.id !== r.id && "node" in o.rail).map((o) => (o.rail as { node: string }).node));
    task.route = shortestPath(world, parkedNode(r)!, resolveNode(world, a.to)!, parked)!;
  }
  if (a.type === "grip" || a.type === "release") task.remaining = 2;
  if (a.type === "wait") task.remaining = a.ticks;
  return task;
}
