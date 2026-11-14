import type { Action } from "@lab-rats/shared";
import { DISPENSE_UNITS } from "../equipment/dispenser.js";
import { Sim } from "../sim.js";
import type { World } from "../world/compile.js";

/**
 * Reference player for the soap order, using only the public action space with robot r1 (other robots
 * idle). Used by tests, `npm run headless`, the scripted controller (M7) and reference runs.
 *
 * - fair: fixed mid-range guesses (what a careful newcomer would try).
 * - oracle: reads the hidden optimum from state to show the best achievable score (tests only).
 */
export interface SoapPlan {
  oilPresses: number;
  lyePresses: number;
  heat: number;
  cookTicks: number;
  /** Combine in a fume hood (correct) or at the dispenser (the classic mistake). */
  useHood: boolean;
}

export const FAIR_SOAP_PLAN: SoapPlan = { oilPresses: 5, lyePresses: 3, heat: 9, cookTicks: 520, useHood: true };

/** Best press counts / heat for the hidden optimum (reads hidden state: oracle only). */
export function oracleSoapPlan(world: World, sim: Sim): SoapPlan {
  const hidden = sim.state.scenario!.hidden;
  let best = { oil: 5, lye: 3, err: Infinity };
  for (let oil = 1; oil <= 9; oil++) {
    for (let lye = 1; oil + lye <= 12; lye++) {
      const err = Math.abs(lye / (oil + lye) - hidden.share / 1000) + (oil + lye) * 1e-4;
      if (err < best.err) best = { oil, lye, err };
    }
  }
  // Vessel temperature ramps toward 20 + 5*heat; the cooking average sits a little below the target.
  let heat = 9;
  let bestErr = Infinity;
  for (let h = 5; h <= 15; h++) {
    const err = Math.abs(20 + 5 * h - 2 - hidden.temp);
    if (err < bestErr) [heat, bestErr] = [h, err];
  }
  return { oilPresses: best.oil, lyePresses: best.lye, heat, cookTicks: 520, useHood: true };
}

export function playSoapOrder(world: World, seed: number, plan: SoapPlan | "oracle" = FAIR_SOAP_PLAN): Sim {
  const sim = new Sim(world, { seed, controllers: { r1: "script", r2: "idle", r3: "idle" } });
  const p = plan === "oracle" ? oracleSoapPlan(world, sim) : plan;
  const act = (a: Action) => {
    const res = sim.submit("script", a);
    if (!res.ok) throw new Error(`rejected: ${res.reason}`);
  };
  const phase = () => {
    sim.runUntilIdle();
    const failed = sim.drainCompletions().filter((c) => !c.result.ok);
    if (failed.length) throw new Error(`soap player: ${failed.map((c) => `${c.action.type}: ${c.result.reason}`).join("; ")}`);
  };
  const d = world.places.get("dispenser_1")!;
  const dispense = (reagent: number, presses: number) => {
    act({ type: "operate", robot: "r1", equipment: "dispenser_1", settings: { reagent } });
    act({ type: "set_hand_height", robot: "r1", hand: "b", level: d.workLevel });
    act({ type: "extend_hand", robot: "r1", hand: "b", amount: d.reach });
    for (let i = 0; i < presses; i++) act({ type: "press", robot: "r1", hand: "b", control: "dispense" });
    act({ type: "extend_hand", robot: "r1", hand: "b", amount: 0 });
  };
  const oil = world.reagents.indexOf(world.pathway!.combine.base);
  const lye = world.reagents.indexOf(world.pathway!.combine.add);

  // Oil into the big flask, then park the flask where the lye will meet it.
  act({ type: "place", robot: "r1", item: "flask_1", target: "dispenser_1" });
  dispense(oil, p.oilPresses);
  act({ type: "place", robot: "r1", item: "flask_1", target: p.useHood ? "hood_n2" : "hotplate_1" });
  // Lye into a beaker, poured into the flask (in the hood, or on the table if skipping the hood).
  act({ type: "place", robot: "r1", item: "beaker_1", target: "dispenser_1" });
  dispense(lye, p.lyePresses);
  act({ type: "transfer", robot: "r1", from: "beaker_1", to: "flask_1", amount: p.lyePresses * DISPENSE_UNITS });
  act({ type: "place", robot: "r1", item: "beaker_1", target: p.useHood ? "hood_n2" : "rack_1" });
  phase();
  // Cook on the hotplate, stirred.
  if (p.useHood) act({ type: "place", robot: "r1", item: "flask_1", target: "hotplate_1" });
  act({ type: "operate", robot: "r1", equipment: "hotplate_1", settings: { heat: p.heat, stir: true } });
  act({ type: "wait", robot: "r1", ticks: Math.min(600, p.cookTicks) });
  if (p.cookTicks > 600) act({ type: "wait", robot: "r1", ticks: p.cookTicks - 600 });
  act({ type: "operate", robot: "r1", equipment: "hotplate_1", settings: { heat: 0, stir: false } });
  act({ type: "analyze", robot: "r1", sample: "flask_1" });
  phase();
  sim.submit("script", { type: "commit", result: { item: "flask_1" } });
  sim.tick();
  return sim;
}
