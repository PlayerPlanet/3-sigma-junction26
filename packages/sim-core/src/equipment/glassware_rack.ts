import type { EquipmentBehavior } from "./types.js";

/** Storage for flasks and beakers; one item per slot. Not a place to pour. */
export const glasswareRack: EquipmentBehavior = {
  pourable: false,
};
