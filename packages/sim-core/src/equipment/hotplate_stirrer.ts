import { AMBIENT_TEMP } from "../constants.js";
import type { EquipmentBehavior } from "./types.js";
import { ok } from "./types.js";

export const MAX_HEAT = 15;
/** Invented: each heat step adds 5 °C to the target temperature (heat 15 = 95 °C). */
export const targetTemp = (heat: number) => AMBIENT_TEMP + heat * 5;

export const hotplateStirrer: EquipmentBehavior = {
  initialSettings: () => ({ heat: 0, stir: false }),
  press(ctx, control) {
    const s = ctx.eq.settings;
    if (control === "heat_up") s.heat = Math.min(MAX_HEAT, Number(s.heat) + 1);
    if (control === "heat_down") s.heat = Math.max(0, Number(s.heat) - 1);
    if (control === "stir_toggle") s.stir = !s.stir;
    ctx.log("info", `Hotplate: heat ${s.heat} (target ${targetTemp(Number(s.heat))} °C), stirring ${s.stir ? "on" : "off"}.`);
    return ok;
  },
  heating: (ctx) => (ctx.item && Number(ctx.eq.settings.heat) > 0 ? [ctx.item.id] : []),
  tick(ctx) {
    // Vessel temperature moves 1 °C toward the plate's target every 3 ticks.
    if (!ctx.item || Number(ctx.eq.settings.heat) === 0 || ctx.state.tick % 3 !== 0) return;
    const target = targetTemp(Number(ctx.eq.settings.heat));
    if (ctx.item.temp !== target) ctx.item.temp += ctx.item.temp < target ? 1 : -1;
  },
  planPresses(current, desired) {
    const presses: string[] = [];
    if ("heat" in desired) {
      const want = Number(desired.heat);
      if (!Number.isInteger(want) || want < 0 || want > MAX_HEAT) return { error: `heat must be 0..${MAX_HEAT}` };
      const diff = want - Number(current.heat ?? 0);
      for (let i = 0; i < Math.abs(diff); i++) presses.push(diff > 0 ? "heat_up" : "heat_down");
    }
    if ("stir" in desired && Boolean(desired.stir) !== Boolean(current.stir)) presses.push("stir_toggle");
    return presses;
  },
};
