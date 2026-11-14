import { volume } from "../chemistry/contents.js";
import { VESSELS } from "../constants.js";
import { noise } from "../rng/rng.js";
import type { EquipmentBehavior } from "./types.js";
import { ok } from "./types.js";

/** Mass in grams: vessel tare + 1 g per unit, with ±1 g reading noise. */
export const balance: EquipmentBehavior = {
  initialSettings: () => ({ tare: 0 }),
  press(ctx, control) {
    const mass = ctx.item ? VESSELS[ctx.item.type].tare + volume(ctx.item.contents) : 0;
    if (control === "tare") {
      ctx.eq.settings.tare = mass;
      ctx.log("info", "Balance: tared.");
      return ok;
    }
    const reading = mass - Number(ctx.eq.settings.tare ?? 0) + noise(ctx.state, 1);
    ctx.log("result", `Balance: ${reading} g${ctx.item ? ` (${ctx.item.id})` : ""}.`);
    return ok;
  },
};
