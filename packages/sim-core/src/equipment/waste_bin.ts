import type { EquipmentBehavior } from "./types.js";
import { ok } from "./types.js";

/** Sink: released items are discarded (contents count as waste), poured liquid goes straight to waste. */
export const wasteBin: EquipmentBehavior = {
  sink: true,
  press(ctx) {
    ctx.log("info", "Waste bin: lid opened.");
    return ok;
  },
};
