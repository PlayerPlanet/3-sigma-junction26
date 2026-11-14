import type { LabLayout, Vec2 } from "@lab-rats/shared";

/** Height of the surface an object stands on. */
export function surfaceHeight(layout: LabLayout, surface: "table" | "floor"): number {
  return surface === "table" ? layout.table.height : 0;
}

/** Ground-plane position of the thing a station serves (equipment or hood interior). */
export function stationTarget(layout: LabLayout, stationId: string): Vec2 | null {
  const eq = layout.equipment.find((e) => e.station === stationId);
  if (eq) return eq.position;
  const hood = layout.hoods.find((h) => h.station === stationId);
  if (hood) {
    const wallZ = hood.wall === "north" ? -layout.room.depth / 2 : layout.room.depth / 2;
    return { x: hood.x, z: wallZ + (hood.wall === "north" ? 1 : -1) * (hood.depth / 2) };
  }
  return null;
}
