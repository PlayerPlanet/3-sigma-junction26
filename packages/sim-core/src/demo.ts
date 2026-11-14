import { Sim } from "./sim.js";
import type { World } from "./world/compile.js";

/**
 * A fixed, hand-written action script for the default lab, used by tests and scripts/headless-run.ts.
 * Not gameplay and not the scripted controller (M7): it just exercises every primitive, every macro and
 * two robots sharing the rail. Phases wait for the robots to go idle before queuing work that depends on
 * where earlier work left things.
 */
export function runDemo(world: World, seed: number): Sim {
  const sim = new Sim(world, { seed, controllers: { r1: "script", r2: "script", r3: "idle" } });
  const s = (a: Parameters<Sim["submit"]>[1]) => {
    const res = sim.submit("script", a);
    if (!res.ok) throw new Error(`demo action rejected: ${res.reason}`);
  };
  const dispenser = world.places.get("dispenser_1")!;

  // Phase 1: r1 fetches a beaker and fills it, then r2 fetches a flask and takes it to a hood.
  s({ type: "place", robot: "r1", item: "beaker_1", target: "dispenser_1" });
  s({ type: "operate", robot: "r1", equipment: "dispenser_1", settings: { reagent: 1 } });
  s({ type: "set_hand_height", robot: "r1", hand: "a", level: dispenser.workLevel });
  s({ type: "extend_hand", robot: "r1", hand: "a", amount: dispenser.reach });
  s({ type: "press", robot: "r1", hand: "a", control: "dispense" });
  s({ type: "press", robot: "r1", hand: "a", control: "dispense" });
  s({ type: "extend_hand", robot: "r1", hand: "a", amount: 0 });
  s({ type: "place", robot: "r1", item: "beaker_1", target: "hotplate_1" });
  s({ type: "operate", robot: "r1", equipment: "hotplate_1", settings: { heat: 12, stir: true } });
  sim.runUntilIdle();
  // r2 starts once r1 is parked at the hotplate, and routes round it (one rail, no passing).
  s({ type: "place", robot: "r2", item: "flask_1", target: "hood_n3" });
  // A parked robot blocks its node, so r2 clears the hood station for r1 by parking at the rail's end.
  s({ type: "go_to", robot: "r2", station: "wall_n_e" });
  sim.runUntilIdle();

  // Phase 2: let it heat, then pour part of it into the flask waiting in the hood.
  s({ type: "wait", robot: "r1", ticks: 60 });
  s({ type: "transfer", robot: "r1", from: "beaker_1", to: "flask_1", amount: 25 });
  sim.runUntilIdle();

  // Phase 3: r1 discards the rest while r2 takes the flask to the analyzer.
  s({ type: "place", robot: "r1", item: "beaker_1", target: "waste_1" });
  s({ type: "analyze", robot: "r2", sample: "flask_1" });
  sim.runUntilIdle();

  sim.submit("script", { type: "commit", result: { item: "flask_1" } });
  sim.tick();
  return sim;
}
