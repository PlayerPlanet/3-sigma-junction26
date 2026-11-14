import type { SimEvent } from "@lab-rats/shared";
import { isStepAction } from "@lab-rats/shared";
import { createInitialState, type SimState } from "../state.js";
import { step, type StepInput } from "../step.js";
import type { World } from "../world/compile.js";

/**
 * Re-runs a session from its seed and event log, headlessly, up to (not including) `endTick`.
 * Only step actions (primitives and session actions) are re-applied, at the tick and in the order they
 * were logged; macro events are annotations and are skipped.
 */
export function replay(world: World, seed: number, events: SimEvent[], endTick: number): SimState {
  const byTick = new Map<number, StepInput[]>();
  for (const e of events) {
    if (!isStepAction(e.action)) continue;
    const list = byTick.get(e.tick) ?? [];
    list.push({ actor: e.actor, action: e.action });
    byTick.set(e.tick, list);
  }
  let state = createInitialState(world, seed);
  while (state.tick < endTick) state = step(world, state, byTick.get(state.tick) ?? []).state;
  return state;
}
