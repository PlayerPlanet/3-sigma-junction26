import type { Action } from "@lab-rats/shared";
import { DISPENSE_UNITS } from "../equipment/dispenser.js";
import { Sim } from "../sim.js";
import type { World } from "../world/compile.js";

/**
 * Reference player for the soap pathway on the default lab, using only the public action space with one
 * robot. Used by tests, `npm run headless`, `npm run seed-db` and the server's scripted controller.
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

/**
 * A scenario script: phases of actions for one robot (each phase is queued once the robot is idle and the
 * previous phase succeeded), then the commit that ends the scenario.
 */
export interface ScenarioScript {
  phases: Action[][];
  commit: Action;
}

/** What a plan tells you about the conditions it ran at, in the units of a research answer. */
export function planConditions(p: SoapPlan): { add_share: number; temp: number } {
  return { add_share: Math.round((100 * p.lyePresses) / (p.oilPresses + p.lyePresses)), temp: 20 + 5 * p.heat - 2 };
}

/**
 * One batch of the scenario's pathway with `robot`, then the commit: the product vessel for an order,
 * the plan's own conditions as the answer for a research question (a one-experiment guess).
 */
export function soapScript(world: World, plan: SoapPlan = FAIR_SOAP_PLAN, robot = "r1"): ScenarioScript {
  const p = plan;
  const d = world.places.get("dispenser_1")!;
  const first: Action[] = [];
  const dispense = (reagent: number, presses: number) => {
    first.push({ type: "operate", robot, equipment: "dispenser_1", settings: { reagent } });
    first.push({ type: "set_hand_height", robot, hand: "b", level: d.workLevel });
    first.push({ type: "extend_hand", robot, hand: "b", amount: d.reach });
    for (let i = 0; i < presses; i++) first.push({ type: "press", robot, hand: "b", control: "dispense" });
    first.push({ type: "extend_hand", robot, hand: "b", amount: 0 });
  };
  const oil = world.reagents.indexOf(world.pathway!.combine.base);
  const lye = world.reagents.indexOf(world.pathway!.combine.add);

  // Oil into the big flask, then park the flask where the lye will meet it.
  first.push({ type: "place", robot, item: "flask_1", target: "dispenser_1" });
  dispense(oil, p.oilPresses);
  first.push({ type: "place", robot, item: "flask_1", target: p.useHood ? "hood_n2" : "hotplate_1" });
  // Lye into a beaker, poured into the flask (in the hood, or on the table if skipping the hood).
  first.push({ type: "place", robot, item: "beaker_1", target: "dispenser_1" });
  dispense(lye, p.lyePresses);
  first.push({ type: "transfer", robot, from: "beaker_1", to: "flask_1", amount: p.lyePresses * DISPENSE_UNITS });
  first.push({ type: "place", robot, item: "beaker_1", target: p.useHood ? "hood_n2" : "rack_1" });

  // Cook on the hotplate, stirred, then read the analyzer.
  const second: Action[] = [];
  if (p.useHood) second.push({ type: "place", robot, item: "flask_1", target: "hotplate_1" });
  second.push({ type: "operate", robot, equipment: "hotplate_1", settings: { heat: p.heat, stir: true } });
  second.push({ type: "wait", robot, ticks: Math.min(600, p.cookTicks) });
  if (p.cookTicks > 600) second.push({ type: "wait", robot, ticks: p.cookTicks - 600 });
  second.push({ type: "operate", robot, equipment: "hotplate_1", settings: { heat: 0, stir: false } });
  second.push({ type: "analyze", robot, sample: "flask_1" });

  const result = world.scenario?.type === "research" ? { answer: planConditions(p) } : { item: "flask_1" };
  return { phases: [first, second], commit: { type: "commit", result } };
}

/** Plays the scenario to the end with r1 as the script actor (other robots idle). */
export function playSoapOrder(world: World, seed: number, plan: SoapPlan | "oracle" = FAIR_SOAP_PLAN): Sim {
  const sim = new Sim(world, { seed, controllers: { r1: "script", r2: "idle", r3: "idle" } });
  const script = soapScript(world, plan === "oracle" ? oracleSoapPlan(world, sim) : plan);
  for (const phase of script.phases) {
    for (const a of phase) {
      const res = sim.submit("script", a);
      if (!res.ok) throw new Error(`rejected: ${res.reason}`);
    }
    sim.runUntilIdle();
    const failed = sim.drainCompletions().filter((c) => !c.result.ok);
    if (failed.length) throw new Error(`soap player: ${failed.map((c) => `${c.action.type}: ${c.result.reason}`).join("; ")}`);
  }
  sim.submit("script", script.commit);
  sim.tick();
  return sim;
}
