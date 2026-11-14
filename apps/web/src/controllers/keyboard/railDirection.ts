import type { LabLayout } from "@lab-rats/shared";

/**
 * Picks the rail node adjacent to `node` that lies most nearly in direction (dx, dz). Pure presentation
 * help for the keyboard: it only chooses which `to` to send; the sim decides whether the move is allowed.
 */
export function neighbourInDirection(layout: LabLayout, node: string, dx: number, dz: number, minCos = 0.5): string | null {
  const pos = new Map(layout.rails.nodes.map((n) => [n.id, n]));
  const here = pos.get(node);
  if (!here) return null;
  let best: { id: string; cos: number } | null = null;
  const len = Math.hypot(dx, dz) || 1;
  for (const seg of layout.rails.segments) {
    const other = seg.from === node ? seg.to : seg.to === node ? seg.from : null;
    if (!other) continue;
    const o = pos.get(other)!;
    const vx = o.x - here.x;
    const vz = o.z - here.z;
    const cos = (vx * dx + vz * dz) / ((Math.hypot(vx, vz) || 1) * len);
    if (cos >= minCos && (!best || cos > best.cos)) best = { id: other, cos };
  }
  return best?.id ?? null;
}
