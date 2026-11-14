import type { EquipmentBehavior } from "./types.js";
import { fail, ok } from "./types.js";

export const FILTER_TICKS = 40;

/** M3 placeholder: runs for a while and reports done. Separation effects arrive with pathways (M5). */
export const filterStation: EquipmentBehavior = {
  press(ctx, control) {
    if (control !== "start_filter") return fail(`unknown control ${control}`);
    if (ctx.eq.busyUntil !== null) return fail("filter is busy");
    if (!ctx.item) return fail("no vessel on the filter station");
    ctx.eq.busyUntil = ctx.state.tick + FILTER_TICKS;
    ctx.log("info", `Filter: filtering ${ctx.item.id}.`);
    return ok;
  },
  tick(ctx) {
    if (ctx.eq.busyUntil !== ctx.state.tick) return;
    ctx.eq.busyUntil = null;
    if (ctx.item && ctx.item.process.cookTicks > 0) ctx.item.process.filtered = true;
    ctx.log("info", `Filter: done${ctx.item ? ` (${ctx.item.id})` : ""}.`);
  },
};
