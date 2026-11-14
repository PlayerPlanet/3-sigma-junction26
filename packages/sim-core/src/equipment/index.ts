import type { EquipmentBehavior } from "./types.js";
import { analyzer } from "./analyzer.js";
import { balance } from "./balance.js";
import { dispenser } from "./dispenser.js";
import { filterStation } from "./filter_station.js";
import { glasswareRack } from "./glassware_rack.js";
import { hotplateStirrer } from "./hotplate_stirrer.js";
import { reagentShelf } from "./reagent_shelf.js";
import { wasteBin } from "./waste_bin.js";

export type { EquipmentBehavior, EquipmentContext } from "./types.js";

/** Equipment type id (content/equipment/<id>.json) -> rules. Types without an entry get the defaults. */
const BEHAVIORS: Record<string, EquipmentBehavior> = {
  analyzer,
  balance,
  dispenser,
  filter_station: filterStation,
  glassware_rack: glasswareRack,
  hotplate_stirrer: hotplateStirrer,
  reagent_shelf: reagentShelf,
  waste_bin: wasteBin,
};

export function behaviorFor(typeId: string): EquipmentBehavior {
  return BEHAVIORS[typeId] ?? {};
}
