import { log, type ItemState, type SimState } from "../state.js";
import type { World } from "../world/compile.js";
import { noise } from "../rng/rng.js";
import { volume } from "./contents.js";
import { faultYieldFactor } from "../faults/index.js";

/**
 * The pathway engine: tracks what happens to each vessel (when its reagents met, how it was cooked) and
 * turns that into a yield. Invented, game-level numbers; see content/pathways and docs/CONTENT_GUIDE.md.
 */

/** Called whenever liquid is added to a vessel. Detects the moment the pathway's two reagents first meet. */
export function onContentsChanged(world: World, state: SimState, item: ItemState, placeId: string | null): void {
  const p = world.pathway;
  if (!p || item.process.combinedAt !== null) return;
  if (!item.contents[p.combine.base] || !item.contents[p.combine.add]) return;
  const place = placeId ? world.places.get(placeId) : undefined;
  item.process.combinedAt = state.tick;
  item.process.combinedInHood = place?.kind === "hood";
  item.process.noise = noise(state, p.runNoise);
  if (p.combine.inHood && !item.process.combinedInHood) log(state, "warn", "lab", p.clues.notInHood);
}

/** Per tick: vessels on a heated hotplate cook once warm enough. */
export function tickPathway(world: World, state: SimState): void {
  const p = world.pathway;
  const hidden = state.scenario?.hidden;
  if (!p || !hidden) return;
  for (const id of world.equipmentIds) {
    if (world.places.get(id)!.typeId !== "hotplate_stirrer") continue;
    const eq = state.equipment[id]!;
    const itemId = state.places[id]![0];
    if (!itemId || Number(eq.settings.heat) === 0) continue;
    const item = state.items[itemId]!;
    const pr = item.process;
    if (pr.combinedAt === null || item.temp < p.heat.cookFrom) continue;
    pr.cookTicks++;
    pr.tempSum += item.temp;
    if (eq.settings.stir) pr.stirTicks++;
    if (item.temp > hidden.temp + p.heat.tempTolerance) {
      if (pr.overheatTicks === 0) log(state, "warn", "lab", p.clues.overheated);
      pr.overheatTicks++;
    }
  }
}

export interface YieldEvaluation {
  /** True yield in whole percent (hidden from players until commit). */
  yield: number;
  factors: Record<string, number>;
}

/** The yield model: product of factor scores (0..1) for each step, plus per-run noise. */
export function evaluateYield(world: World, state: SimState, item: ItemState): YieldEvaluation {
  const p = world.pathway;
  const hidden = state.scenario?.hidden;
  if (!p || !hidden) return { yield: 0, factors: {} };
  const pr = item.process;
  const a = item.contents[p.combine.base] ?? 0;
  const b = item.contents[p.combine.add] ?? 0;
  const total = volume(item.contents);
  if (a === 0 || b === 0 || pr.cookTicks === 0 || pr.combinedAt === null) return { yield: 0, factors: { combined: a && b ? 1 : 0, cooked: pr.cookTicks ? 1 : 0 } };
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const avgTemp = pr.tempSum / pr.cookTicks;
  const factors: Record<string, number> = {
    ratio: clamp01(1 - Math.abs(b / (a + b) - hidden.share / 1000) / p.combine.shareTolerance),
    temperature: clamp01(1 - Math.abs(avgTemp - hidden.temp) / p.heat.tempTolerance),
    time: clamp01(pr.cookTicks / p.heat.minTicks),
    stirring: p.heat.stir ? 0.6 + 0.4 * (pr.stirTicks / pr.cookTicks) : 1,
    hood: p.combine.inHood && !pr.combinedInHood ? 0.6 : 1,
    purity: (a + b) / total,
    filtered: p.filter && !pr.filtered ? 0.4 : 1,
    faults: faultYieldFactor(state, item.id),
  };
  const raw = Math.round(100 * Object.values(factors).reduce((x, y) => x * y, 1));
  return { yield: raw === 0 ? 0 : Math.max(0, Math.min(100, raw + pr.noise)), factors };
}
