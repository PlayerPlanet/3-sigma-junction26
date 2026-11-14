import type { EquipmentBehavior } from "./types.js";
import { ok } from "./types.js";

/** Reagent stock. Holds no vessels; reagents reach vessels through the dispenser (pathways in M5). */
export const reagentShelf: EquipmentBehavior = {
  capacity: () => 0,
  pourable: false,
  press(ctx) {
    ctx.log("info", "Reagent shelf: stock checked, dispenser refilled.");
    return ok;
  },
};
