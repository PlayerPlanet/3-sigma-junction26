import type { World } from "./compile.js";

/**
 * Shortest rail route from `from` to `to` (Dijkstra on integer mm; ties broken by node id, so routes are
 * deterministic). Returns the nodes to visit after `from`, ending with `to`; [] if already there; null if unreachable.
 * `avoid`: nodes with a parked robot, penalised so the route goes round them if there is another way.
 * Robots that move into the way later still make the mover wait; routes are fixed when the move starts.
 */
/** Extra cost (mm) for routing through a node where another robot is parked, so robots go round when they can. */
export const PARKED_ROBOT_PENALTY = 100_000;

export function shortestPath(world: World, from: string, to: string, avoid: ReadonlySet<string> = new Set()): string[] | null {
  if (from === to) return [];
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  for (;;) {
    let best: string | null = null;
    for (const [id, d] of dist) {
      if (done.has(id)) continue;
      if (best === null || d < dist.get(best)! || (d === dist.get(best)! && id < best)) best = id;
    }
    if (best === null) return null;
    if (best === to) break;
    done.add(best);
    for (const n of world.neighbours.get(best) ?? []) {
      const d = dist.get(best)! + n.length + (avoid.has(n.node) && n.node !== to ? PARKED_ROBOT_PENALTY : 0);
      const old = dist.get(n.node);
      if (old === undefined || d < old || (d === old && best < prev.get(n.node)!)) {
        dist.set(n.node, d);
        prev.set(n.node, best);
      }
    }
  }
  const route: string[] = [];
  for (let at = to; at !== from; at = prev.get(at)!) route.unshift(at);
  return route;
}

/** The segment joining two adjacent nodes (lowest segment id if there are several). */
export function segmentBetween(world: World, a: string, b: string): { segment: string; length: number } | null {
  const n = world.neighbours.get(a)?.find((x) => x.node === b);
  return n ? { segment: n.segment, length: n.length } : null;
}
