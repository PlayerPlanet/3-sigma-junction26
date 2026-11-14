import type { ActionResult } from "@lab-rats/shared";
import { log, type SimState } from "../state.js";
import type { World } from "../world/compile.js";
import { behaviorFor, type EquipmentContext } from "./index.js";

function context(world: World, state: SimState, id: string): EquipmentContext {
  const place = world.places.get(id)!;
  const itemId = state.places[id]?.[0] ?? null;
  return {
    world,
    state,
    id,
    type: world.types[place.typeId!]!,
    eq: state.equipment[id]!,
    item: itemId ? state.items[itemId]! : null,
    log: (level, text) => log(state, level, id, text),
  };
}

export function pressEquipment(world: World, state: SimState, id: string, control: string): ActionResult {
  const typeId = world.places.get(id)!.typeId!;
  const b = behaviorFor(typeId);
  return b.press ? b.press(context(world, state, id), control) : { ok: true };
}

/** Runs every equipment tick in id order; returns items being heated this tick. */
export function tickEquipment(world: World, state: SimState): Set<string> {
  const heated = new Set<string>();
  for (const id of world.equipmentIds) {
    const b = behaviorFor(world.places.get(id)!.typeId!);
    if (!b.tick && !b.heating) continue;
    const ctx = context(world, state, id);
    b.tick?.(ctx);
    for (const h of b.heating?.(ctx) ?? []) heated.add(h);
  }
  return heated;
}
