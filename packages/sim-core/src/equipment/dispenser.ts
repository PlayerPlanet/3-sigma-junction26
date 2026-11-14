import { addToItem } from "../chemistry/contents.js";
import { AMBIENT_TEMP } from "../constants.js";
import type { EquipmentBehavior } from "./types.js";
import { fail, ok } from "./types.js";

import { onContentsChanged } from "../chemistry/pathway.js";

/** Units per press. The reagent list comes from the scenario's pathway (World.reagents). */
export const DISPENSE_UNITS = 20;

export const dispenser: EquipmentBehavior = {
  initialSettings: () => ({ reagent: 0 }),
  press(ctx, control) {
    const reagents = ctx.world.reagents;
    const idx = Number(ctx.eq.settings.reagent ?? 0);
    if (control === "select_reagent") {
      ctx.eq.settings.reagent = (idx + 1) % reagents.length;
      ctx.log("info", `Dispenser: selected ${reagents[ctx.eq.settings.reagent as number]}.`);
      return ok;
    }
    if (control === "dispense") {
      if (!ctx.item) return fail("no vessel under the dispenser");
      const reagent = reagents[idx]!;
      ctx.state.reagentsUsed += DISPENSE_UNITS;
      const spilled = addToItem(ctx.state, ctx.item, { [reagent]: DISPENSE_UNITS }, AMBIENT_TEMP);
      ctx.log(spilled ? "warn" : "info", `Dispenser: ${DISPENSE_UNITS} u ${reagent} into ${ctx.item.id}${spilled ? `, ${spilled} u overflowed` : ""}.`);
      onContentsChanged(ctx.world, ctx.state, ctx.item, ctx.id);
      return ok;
    }
    return fail(`unknown control ${control}`);
  },
  planPresses(current, desired, world) {
    if (!("reagent" in desired)) return [];
    const n = world.reagents.length;
    const want = Number(desired.reagent);
    if (!Number.isInteger(want) || want < 0 || want >= n) return { error: `reagent must be an index 0..${n - 1} into ${world.reagents.join(", ")}` };
    const presses = (want - Number(current.reagent ?? 0) + n) % n;
    return Array.from({ length: presses }, () => "select_reagent");
  },
};
