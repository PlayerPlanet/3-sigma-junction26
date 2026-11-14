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
    answer: null,
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
  if (sc.type !== "order") throw new Error("scoreOrder needs an order scenario");
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

/** The hidden optimum in the units of a research answer: whole percent of the added reagent, whole °C. */
export function researchTruth(sc: ScenarioState): { add_share: number; temp: number } {
  return { add_share: Math.round(sc.hidden.share / 10), temp: sc.hidden.temp };
}

export interface ResearchScore {
  score: number;
  breakdown: { share: number; temp: number; overspendPenalty: number };
}

/**
 * Research score 0..100: half for the share answer, half for the temperature answer, each falling
 * linearly to zero at the scenario's tolerance. Minus 0.2 per unit of reagent over budget.
 */
export function scoreResearch(world: World, state: SimState, answer: { add_share: number; temp: number }): ResearchScore {
  const sc = world.scenario!;
  if (sc.type !== "research") throw new Error("scoreResearch needs a research scenario");
  const truth = researchTruth(state.scenario!);
  const closeness = (err: number, tol: number) => Math.max(0, 1 - Math.abs(err) / tol);
  const share = 50 * closeness(answer.add_share - truth.add_share, sc.answerTolerance.share);
  const temp = 50 * closeness(answer.temp - truth.temp, sc.answerTolerance.temp);
  const overspendPenalty = Math.max(0, state.reagentsUsed - sc.budget.reagents) * 0.2;
  return {
    score: Math.max(0, Math.min(100, Math.round(share + temp - overspendPenalty))),
    breakdown: { share: Math.round(share), temp: Math.round(temp), overspendPenalty: Math.round(overspendPenalty) },
  };
}

type CommitResult = { item?: string; answer?: Record<string, number | string | boolean> };

/** A commit ends the scenario: an item for an order, an answer for a research question. Returns a reason if not accepted. */
export function commitScenario(world: World, state: SimState, result: CommitResult): string | null {
  if (!state.scenario || !world.scenario) return null;
  return world.scenario.type === "order" ? commitOrder(world, state, result.item) : commitResearch(world, state, result.answer);
}

function commitResearch(world: World, state: SimState, answer: CommitResult["answer"]): string | null {
  const sc = state.scenario!;
  if (sc.status !== "running") return "the session is over";
  const { add_share, temp } = answer ?? {};
  const whole = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
  if (!whole(add_share, 0, 100) || !whole(temp, 0, 200)) {
    return "a research question is committed with an answer: commit { answer: { add_share: whole percent 0..100, temp: whole °C } }";
  }
  const s = scoreResearch(world, state, { add_share, temp });
  const truth = researchTruth(sc);
  sc.status = "committed";
  sc.score = s.score;
  sc.answer = { add_share, temp };
  sc.endTick = state.tick;
  log(state, "result", "session", `Answer ${add_share}% at ${temp} °C; the best conditions were ${truth.add_share}% at ${truth.temp} °C. Score ${s.score}/100.`);
  return null;
}

function commitOrder(world: World, state: SimState, itemId: string | undefined): string | null {
  const sc = state.scenario!;
  if (world.scenario!.type !== "order") return null;
  if (sc.status !== "running") return "the session is over";
  if (!itemId) return "an order is committed with the product vessel: commit { item }";
  const s = scoreOrder(world, state, itemId);
  sc.status = "committed";
  sc.score = s.score;
  sc.trueYield = s.trueYield;
  sc.committedItem = itemId;
  sc.endTick = state.tick;
  log(state, "result", "session", `Order closed with ${itemId}: true yield ${s.trueYield}% (target ${world.scenario!.targetYield}%), score ${s.score}/100.`);
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
