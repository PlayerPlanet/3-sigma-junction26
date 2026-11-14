import type { RobotSpec } from "@lab-rats/shared";

/** Carriage deck height; hand level 0 sits just above it. */
export const CARRIAGE_HEIGHT = 0.28;
const LOWEST_HAND = 0.32;

/** Height in metres of a mast level (render and layout compile only; state stores the level). */
export function handHeight(spec: RobotSpec, level: number): number {
  const top = CARRIAGE_HEIGHT + spec.mastHeight - 0.1;
  return LOWEST_HAND + ((top - LOWEST_HAND) * level) / (spec.handLevels - 1);
}
