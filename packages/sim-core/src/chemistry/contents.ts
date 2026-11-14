import { VESSELS } from "../constants.js";
import type { ItemState, SimState } from "../state.js";

export type Contents = Record<string, number>;

export const volume = (c: Contents): number => Object.values(c).reduce((a, b) => a + b, 0);
export const capacityOf = (item: ItemState): number => VESSELS[item.type].capacity;

/**
 * Removes `n` units from `c` in proportion to its components, in integers (largest remainder, ties by
 * reagent id), and returns what was removed. Deterministic and exact: volume(removed) === min(n, volume(c)).
 */
export function takeUnits(c: Contents, n: number): Contents {
  const total = volume(c);
  const want = Math.min(n, total);
  if (want <= 0) return {};
  const keys = Object.keys(c).sort();
  const parts = keys.map((k) => {
    const exact = (c[k]! * want) / total;
    return { k, base: Math.floor(exact), rem: c[k]! * want - Math.floor(exact) * total };
  });
  let left = want - parts.reduce((a, p) => a + p.base, 0);
  for (const p of [...parts].sort((x, y) => y.rem - x.rem || (x.k < y.k ? -1 : 1))) {
    if (left === 0) break;
    p.base++;
    left--;
  }
  const removed: Contents = {};
  for (const p of parts) {
    if (p.base === 0) continue;
    removed[p.k] = p.base;
    c[p.k]! -= p.base;
    if (c[p.k] === 0) delete c[p.k];
  }
  return removed;
}

/** Adds `add` into item, mixing temperatures by volume. Returns units that did not fit (spilled to waste). */
export function addToItem(state: SimState, item: ItemState, add: Contents, addTemp: number): number {
  const free = capacityOf(item) - volume(item.contents);
  const incoming = { ...add };
  const fits = takeUnits(incoming, Math.max(0, free));
  const before = volume(item.contents);
  const added = volume(fits);
  if (added > 0) item.temp = Math.round((item.temp * before + addTemp * added) / (before + added));
  for (const [k, v] of Object.entries(fits)) item.contents[k] = (item.contents[k] ?? 0) + v;
  const spilled = volume(incoming);
  state.waste += spilled;
  return spilled;
}

export function describeContents(c: Contents): string {
  const total = volume(c);
  if (total === 0) return "empty";
  return `${total} u (${Object.keys(c).sort().map((k) => `${k} ${c[k]}`).join(", ")})`;
}
