import type { LabLayout, RailNode, RailSegment, Vec2 } from "@lab-rats/shared";

const TAU = Math.PI * 2;

export interface SegmentGeometry {
  segment: RailSegment;
  from: RailNode;
  to: RailNode;
  length: number;
  /** Point at fraction t in [0, 1] from `from` to `to`. */
  pointAt(t: number): Vec2;
}

export interface RailGraph {
  nodes: Map<string, RailNode>;
  segments: Map<string, SegmentGeometry>;
  /** node id -> ids of segments touching it */
  adjacency: Map<string, string[]>;
}

/** Signed sweep from angle a0 to a1 in the given direction, in (0, 2π]. ccw = increasing atan2(z, x). */
function sweep(a0: number, a1: number, ccw: boolean): number {
  let d = ccw ? a1 - a0 : a0 - a1;
  d = ((d % TAU) + TAU) % TAU;
  return d === 0 ? TAU : d;
}

export function segmentGeometry(segment: RailSegment, from: RailNode, to: RailNode): SegmentGeometry {
  if (!segment.arc) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    return {
      segment, from, to,
      length: Math.hypot(dx, dz),
      pointAt: (t) => ({ x: from.x + dx * t, z: from.z + dz * t }),
    };
  }
  const { cx, cz, ccw } = segment.arc;
  const r = Math.hypot(from.x - cx, from.z - cz);
  const a0 = Math.atan2(from.z - cz, from.x - cx);
  const a1 = Math.atan2(to.z - cz, to.x - cx);
  const s = sweep(a0, a1, ccw) * (ccw ? 1 : -1);
  return {
    segment, from, to,
    length: Math.abs(s) * r,
    pointAt: (t) => ({ x: cx + r * Math.cos(a0 + s * t), z: cz + r * Math.sin(a0 + s * t) }),
  };
}

/** Builds the rail graph. Assumes the layout passed validateLayout (all node refs exist). */
export function buildRailGraph(layout: LabLayout): RailGraph {
  const nodes = new Map(layout.rails.nodes.map((n) => [n.id, n]));
  const segments = new Map<string, SegmentGeometry>();
  const adjacency = new Map<string, string[]>(layout.rails.nodes.map((n) => [n.id, []]));
  for (const seg of layout.rails.segments) {
    segments.set(seg.id, segmentGeometry(seg, nodes.get(seg.from)!, nodes.get(seg.to)!));
    adjacency.get(seg.from)!.push(seg.id);
    adjacency.get(seg.to)!.push(seg.id);
  }
  return { nodes, segments, adjacency };
}

/** Samples a segment into points roughly `step` metres apart (straight segments give just the two ends). */
export function samplePolyline(geo: SegmentGeometry, step = 0.15): Vec2[] {
  const n = geo.segment.arc ? Math.max(2, Math.ceil(geo.length / step)) : 1;
  return Array.from({ length: n + 1 }, (_, i) => geo.pointAt(i / n));
}

/** Node ids reachable from `start` along the rails. */
export function reachableNodes(graph: RailGraph, start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const segId of graph.adjacency.get(id) ?? []) {
      const seg = graph.segments.get(segId)!.segment;
      const other = seg.from === id ? seg.to : seg.from;
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}
