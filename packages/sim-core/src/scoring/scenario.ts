import { log, type ScenarioState, type SimState } from "../state.js";
import type { World } from "../world/compile.js";
import { randInt } from "../rng/rng.js";
import { evaluateYield } from "../chemistry/pathway.js";
import { initFaults } from "../faults/index.js";

/** Draws the hidden truth for this seed (optimum, faults). Called once from createInitialState. */
export function initScenario(world: World, state: SimState): ScenarioState {
  const p = world.pathway!;
  const [s0, s1] = p.combine.shareRange;
  const [t0, t1] = p.heat.tempRange;
  return {
    id: world.scenario!.id,
    hidden: { share: randInt(state, Math.round(s0 * 1000), Math.round(s1 * 1000)), temp: randInt(state, t0, t1) },
    faults: initFaults(world, state),
    status: "running",
    score: null,
    trueYield: null,
    committedItem: null,
    endTick: null,
  };
}

export interface OrderScore {
  score: number;
  trueYield: number;
  breakdown: { base: number; wastePenalty: number; overspendPenalty: number };
}

/**
 * Order score 0..100 from the committed vessel's true yield: below target scales 0..40, at or above target
 * 60..100. Minus 0.1 per unit of waste and 0.2 per unit of reagent over budget.
 */
export function scoreOrder(world: World, state: SimState, itemId: string): OrderScore {
  const sc = world.scenario!;
  const item = state.items[itemId]!;
  const y = item.location.kind === "waste" ? 0 : evaluateYield(world, state, item).yield;
  const t = sc.targetYield;
  const base = y >= t ? 60 + (40 * (y - t)) / Math.max(1, 100 - t) : (40 * y) / t;
  const wastePenalty = state.waste * 0.1;
  const overspendPenalty = Math.max(0, state.reagentsUsed - sc.budget.reagents) * 0.2;
  return {
    score: Math.max(0, Math.min(100, Math.round(base - wastePenalty - overspendPenalty))),
    trueYield: y,
    breakdown: { base: Math.round(base), wastePenalty: Math.round(wastePenalty), overspendPenalty: Math.round(overspendPenalty) },
  };
}

/** Commit of an item ends an order. Returns a reason if the commit is not accepted. */
export function commitOrder(world: World, state: SimState, itemId: string | undefined): string | null {
  const sc = state.scenario;
  if (!sc || !world.scenario) return null;
  if (sc.status !== "running") return "the session is over";
  if (!itemId) return "an order is committed with the product vessel: commit { item }";
  const s = scoreOrder(world, state, itemId);
  sc.status = "committed";
  sc.score = s.score;
  sc.trueYield = s.trueYield;
  sc.committedItem = itemId;
  sc.endTick = state.tick;
  log(state, "result", "session", `Order closed with ${itemId}: true yield ${s.trueYield}% (target ${world.scenario.targetYield}%), score ${s.score}/100.`);
  return null;
}

/** Ends the session when the time budget runs out. */
export function checkTimeout(world: World, state: SimState): void {
  const sc = state.scenario;
  if (!sc || sc.status !== "running" || !world.scenario) return;
  if (state.tick + 1 >= world.scenario.budget.ticks) {
    sc.status = "timeout";
    sc.score = 0;
    sc.endTick = state.tick;
    log(state, "result", "session", "Time is up: nothing was committed. Score 0/100.");
  }
}
