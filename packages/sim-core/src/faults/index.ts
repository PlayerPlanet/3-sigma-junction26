import { log, type FaultState, type SimState } from "../state.js";
import type { World } from "../world/compile.js";
import { randInt } from "../rng/rng.js";

/**
 * Hidden faults: chosen from the seed at session start, they change outcomes and leave clues in the lab
 * log for players to notice. PLACEHOLDER: one trivial example; real faults are content (content/faults/).
 */
export interface Fault {
  id: string;
  description: string;
  /** Picks what the fault affects, or null if it cannot apply in this lab. */
  init(world: World, state: SimState): string | null;
  /** Multiplier on the yield of a product made in item `itemId` (1 = no effect). */
  yieldFactor?(fault: FaultState, itemId: string): number;
  /** Clue logged the first time a player handles the affected thing. */
  clue?(fault: FaultState): string;
  /** Item whose pick-up reveals the clue. */
  revealsOnPick?(fault: FaultState): string | null;
}

/** Example: one piece of glassware has residue that ruins whatever is made in it. */
const contaminatedGlassware: Fault = {
  id: "contaminated_glassware",
  description: "One vessel has a residue that cuts the yield of anything made in it.",
  init(world, state) {
    const ids = Object.keys(state.items).sort();
    return ids.length ? ids[randInt(state, 0, ids.length - 1)]! : null;
  },
  yieldFactor: (f, itemId) => (f.target === itemId ? 0.65 : 1),
  clue: (f) => `${f.target} has a faint film on the inside.`,
  revealsOnPick: (f) => f.target,
};

export const FAULTS: Record<string, Fault> = { [contaminatedGlassware.id]: contaminatedGlassware };

export function initFaults(world: World, state: SimState): FaultState[] {
  const out: FaultState[] = [];
  for (const fc of world.scenario?.faults ?? []) {
    const fault = FAULTS[fc.id];
    if (!fault) continue;
    if (randInt(state, 0, 999) >= Math.round(fc.chance * 1000)) continue;
    out.push({ id: fault.id, target: fault.init(world, state), clued: false });
  }
  return out;
}

export function faultYieldFactor(state: SimState, itemId: string): number {
  return (state.scenario?.faults ?? []).reduce((f, fs) => f * (FAULTS[fs.id]?.yieldFactor?.(fs, itemId) ?? 1), 1);
}

export function onPick(state: SimState, itemId: string): void {
  for (const fs of state.scenario?.faults ?? []) {
    const fault = FAULTS[fs.id];
    if (!fs.clued && fault?.revealsOnPick?.(fs) === itemId && fault.clue) {
      fs.clued = true;
      log(state, "info", "lab", fault.clue(fs));
    }
  }
}
