import type { HandId } from "@lab-rats/shared";
import { REACH_TOLERANCE } from "../constants.js";
import type { RobotState } from "../state.js";
import type { Place, World } from "../world/compile.js";

export const parkedNode = (r: RobotState): string | null => ("node" in r.rail ? r.rail.node : null);

/** The place served by the station the robot is parked at, if any. */
export function placeAtRobot(world: World, r: RobotState): Place | null {
  const node = parkedNode(r);
  const station = node ? world.stationByNode.get(node) : undefined;
  return station ? world.placeByStation.get(station) ?? null : null;
}

/**
 * Checks the hand is positioned to work on the robot's place: parked at a station, at the place's work
 * level (+ levelOffset; pouring uses +1) and extended to its reach within tolerance.
 */
export function handAtPlace(world: World, r: RobotState, hand: HandId, levelOffset = 0): { place: Place } | { reason: string } {
  const place = placeAtRobot(world, r);
  if (!place) return { reason: "robot is not parked at a station" };
  const h = r.hands[hand];
  const level = place.workLevel + levelOffset;
  if (h.level !== level) return { reason: `hand ${hand} must be at level ${level} for ${place.id} (it is at ${h.level})` };
  if (Math.abs(h.extend - place.reach) > REACH_TOLERANCE) {
    return { reason: `hand ${hand} must be extended to about ${place.reach}% to reach ${place.id} (it is at ${h.extend}%)` };
  }
  return { place };
}

export function firstSlot(slots: (string | null)[], want: "free" | "occupied", slot?: number): number | null {
  if (slot !== undefined) {
    const v = slots[slot];
    if (v === undefined) return null;
    return (want === "free") === (v === null) ? slot : null;
  }
  const i = slots.findIndex((s) => (want === "free" ? s === null : s !== null));
  return i < 0 ? null : i;
}
