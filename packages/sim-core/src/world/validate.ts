import type { EquipmentType, LabLayout } from "@lab-rats/shared";
import { buildRailGraph, reachableNodes } from "./rails.js";

export class LayoutError extends Error {
  constructor(public readonly problems: string[]) {
    super(`invalid lab layout:\n  - ${problems.join("\n  - ")}`);
  }
}

const ARC_TOLERANCE = 1e-3;

/**
 * Cross-reference checks that zod cannot express. Returns a list of problems (empty = valid).
 * Shape validation is done by the zod schemas in @lab-rats/shared before this runs.
 */
export function layoutProblems(layout: LabLayout, types: Record<string, EquipmentType>): string[] {
  const problems: string[] = [];
  const dupes = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${kind} id "${id}"`);
      seen.add(id);
    }
  };
  dupes("node", layout.rails.nodes.map((n) => n.id));
  dupes("segment", layout.rails.segments.map((s) => s.id));
  dupes("station", layout.stations.map((s) => s.id));
  dupes("object", [...layout.hoods, ...layout.equipment, ...layout.items].map((o) => o.id));
  dupes("robot", layout.robots.map((r) => r.id));

  const nodes = new Map(layout.rails.nodes.map((n) => [n.id, n]));
  const stations = new Map(layout.stations.map((s) => [s.id, s]));
  const equipment = new Map(layout.equipment.map((e) => [e.id, e]));

  for (const seg of layout.rails.segments) {
    const from = nodes.get(seg.from);
    const to = nodes.get(seg.to);
    if (!from) problems.push(`segment "${seg.id}": unknown node "${seg.from}"`);
    if (!to) problems.push(`segment "${seg.id}": unknown node "${seg.to}"`);
    if (from && to && seg.arc) {
      const r0 = Math.hypot(from.x - seg.arc.cx, from.z - seg.arc.cz);
      const r1 = Math.hypot(to.x - seg.arc.cx, to.z - seg.arc.cz);
      if (Math.abs(r0 - r1) > ARC_TOLERANCE) problems.push(`segment "${seg.id}": arc ends are not equidistant from its centre`);
    }
  }
  for (const st of layout.stations) {
    if (!nodes.has(st.node)) problems.push(`station "${st.id}": unknown node "${st.node}"`);
  }
  const stationUsers = new Map<string, string>();
  for (const obj of [...layout.hoods, ...layout.equipment]) {
    if (!stations.has(obj.station)) problems.push(`"${obj.id}": unknown station "${obj.station}"`);
    else if (stationUsers.has(obj.station)) problems.push(`station "${obj.station}" is used by both "${stationUsers.get(obj.station)}" and "${obj.id}"`);
    else stationUsers.set(obj.station, obj.id);
  }
  for (const st of layout.stations) {
    if (!stationUsers.has(st.id)) problems.push(`station "${st.id}" has no equipment or hood`);
  }
  for (const eq of layout.equipment) {
    if (!types[eq.type]) problems.push(`equipment "${eq.id}": unknown type "${eq.type}"`);
  }
  for (const item of layout.items) {
    const host = equipment.get(item.on);
    const slots = host ? types[host.type]?.slots ?? 0 : 0;
    if (!host) problems.push(`item "${item.id}": unknown equipment "${item.on}"`);
    else if (item.slot >= slots) problems.push(`item "${item.id}": slot ${item.slot} out of range for "${item.on}" (${slots} slots)`);
  }
  dupes("item slot", layout.items.map((i) => `${i.on}#${i.slot}`));

  const startNodes: string[] = [];
  for (const r of layout.robots) {
    const node = stations.get(r.start)?.node ?? (nodes.has(r.start) ? r.start : null);
    if (!node) problems.push(`robot "${r.id}": unknown start "${r.start}" (use a station or rail node id)`);
    else startNodes.push(node);
  }
  dupes("robot start node", startNodes);

  if (problems.length === 0) {
    const graph = buildRailGraph(layout);
    const first = layout.rails.nodes[0]!.id;
    const reach = reachableNodes(graph, first);
    const cut = layout.rails.nodes.filter((n) => !reach.has(n.id)).map((n) => n.id);
    if (cut.length) problems.push(`rail graph is disconnected; unreachable from "${first}": ${cut.join(", ")}`);
  }
  return problems;
}

export function validateLayout(layout: LabLayout, types: Record<string, EquipmentType>): void {
  const problems = layoutProblems(layout, types);
  if (problems.length) throw new LayoutError(problems);
}
