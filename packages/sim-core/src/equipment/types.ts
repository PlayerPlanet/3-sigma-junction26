import type { ActionResult, EquipmentType } from "@lab-rats/shared";
import type { EquipmentState, ItemState, Setting, SimState } from "../state.js";
import type { World } from "../world/compile.js";

export interface EquipmentContext {
  world: World;
  state: SimState;
  id: string;
  type: EquipmentType;
  eq: EquipmentState;
  /** Item in slot 0 (single-slot equipment), if any. */
  item: ItemState | null;
  log(level: "info" | "warn" | "result", text: string): void;
}

/**
 * Rules for one equipment type (one file each in this folder). Everything is optional; defaults:
 * capacity = max(1, type.slots), pourable, not a sink, no settings, presses do nothing.
 */
export interface EquipmentBehavior {
  capacity?(type: EquipmentType): number;
  /** Items released here are discarded and liquid poured here goes to waste. */
  sink?: boolean;
  /** Whether a vessel standing here can be poured into. */
  pourable?: boolean;
  initialSettings?(): Record<string, Setting>;
  /** Effect of pressing a control (already checked to be in type.controls). */
  press?(ctx: EquipmentContext, control: string): ActionResult;
  /** Runs once per tick, after robots. */
  tick?(ctx: EquipmentContext): void;
  /** Item ids this equipment is heating this tick (so they do not cool). */
  heating?(ctx: EquipmentContext): string[];
  /** For the `operate` macro: the presses that turn `current` settings into `desired`, or an error. */
  planPresses?(current: Record<string, Setting>, desired: Record<string, number | boolean>, world: World): string[] | { error: string };
}

export const ok: ActionResult = { ok: true };
export const fail = (reason: string): ActionResult => ({ ok: false, reason });
