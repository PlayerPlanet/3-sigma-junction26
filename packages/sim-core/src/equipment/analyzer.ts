import { volume } from "../chemistry/contents.js";
import { evaluateYield } from "../chemistry/pathway.js";
import { noise } from "../rng/rng.js";
import type { EquipmentBehavior } from "./types.js";
import { fail, ok } from "./types.js";

export const ANALYSIS_TICKS = 30;

/**
 * Noisy reading of the sample: the pathway's yield once its reagents have met, otherwise volume,
 * temperature and component shares. Research scenarios budget the number of runs.
 */
export const analyzer: EquipmentBehavior = {
  initialSettings: () => ({ sample: "" }),
  press(ctx, control) {
    if (control !== "run") return fail(`unknown control ${control}`);
    if (ctx.eq.busyUntil !== null) return fail("analyzer is busy");
    if (!ctx.item) return fail("no sample in the analyzer");
    const sc = ctx.world.scenario;
    if (sc?.type === "research" && ctx.state.analyses >= sc.budget.analyses) return fail("no analyzer runs left in the budget");
    ctx.state.analyses++;
    ctx.eq.busyUntil = ctx.state.tick + ANALYSIS_TICKS;
    ctx.eq.settings.sample = ctx.item.id;
    ctx.log("info", `Analyzer: running ${ctx.item.id} (${ANALYSIS_TICKS / 10} s).`);
    return ok;
  },
  tick(ctx) {
    if (ctx.eq.busyUntil !== ctx.state.tick) return;
    ctx.eq.busyUntil = null;
    const sampleId = String(ctx.eq.settings.sample);
    const item = ctx.state.items[sampleId];
    if (!item || item.location.kind !== "place" || item.location.place !== ctx.id) {
      ctx.log("warn", `Analyzer: sample ${sampleId} was removed before the run finished.`);
      return;
    }
    const total = volume(item.contents);
    const ev = ctx.world.pathway ? evaluateYield(ctx.world, ctx.state, item) : null;
    if (ev && item.process.combinedAt !== null) {
      const reading = Math.min(100, Math.max(0, ev.yield + noise(ctx.state, ctx.world.pathway!.analyzerNoise)));
      const mix = Object.keys(item.contents).sort().map((k) => `${k} ${Math.round((item.contents[k]! * 100) / Math.max(1, total))}%`);
      ctx.log("result", `Analyzer (${sampleId}): ~${reading}% ${ctx.world.pathway!.product}; ${total} u at ${item.temp} °C; mix ${mix.join(", ")}.`);
      return;
    }
    const shares = Object.keys(item.contents)
      .sort()
      .map((k) => `${k} ${Math.max(0, Math.round((item.contents[k]! * 100) / Math.max(1, total)) + noise(ctx.state, 3))}%`);
    const vol = Math.max(0, total + noise(ctx.state, 2));
    ctx.log("result", `Analyzer (${sampleId}): ~${vol} u at ${item.temp} °C${shares.length ? `; ${shares.join(", ")}` : "; no signal"}.`);
  },
};
