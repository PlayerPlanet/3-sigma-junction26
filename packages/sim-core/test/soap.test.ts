import { describe, expect, it } from "vitest";
import { Sim, hashState, playSoapOrder, replay, FAIR_SOAP_PLAN } from "../src/index";
import { worldFromContent } from "../node/loadContent";
import { content } from "./content";

const world = worldFromContent(content, { scenario: "soap_order" });

describe("soap order end to end (milestone 5)", () => {
  it("the oracle player beats the target yield and scores well", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = playSoapOrder(world, seed, "oracle");
      const sc = sim.state.scenario!;
      expect(sc.status).toBe("committed");
      const faulty = sc.faults.some((f) => f.target === "flask_1");
      if (!faulty) {
        expect(sc.trueYield!).toBeGreaterThanOrEqual(world.scenario!.targetYield);
        expect(sc.score!).toBeGreaterThanOrEqual(60);
      }
      expect(sim.state.log.some((l) => l.text.startsWith("Analyzer (flask_1): ~"))).toBe(true);
    }
  });

  it("finishes within the time and reagent budget", () => {
    const sim = playSoapOrder(world, 7, FAIR_SOAP_PLAN);
    expect(sim.state.scenario!.endTick!).toBeLessThan(world.scenario!.budget.ticks);
    expect(sim.state.reagentsUsed).toBeLessThanOrEqual(world.scenario!.budget.reagents);
  });

  it("doing nothing scores zero when time runs out", () => {
    const sim = new Sim(world, { seed: 1 });
    sim.run(world.scenario!.budget.ticks);
    expect(sim.state.scenario).toMatchObject({ status: "timeout", score: 0 });
    expect(sim.submit("human", { type: "go_to", robot: "r1", station: "st_balance" }).ok).toBe(true);
    sim.runUntilIdle();
    expect(sim.state.robots.r1!.last).toMatchObject({ status: "invalid", reason: "the session is over" });
  });

  it("committing an empty vessel straight away scores zero", () => {
    const sim = new Sim(world, { seed: 1 });
    sim.submit("human", { type: "commit", result: { item: "beaker_1" } });
    sim.tick();
    expect(sim.state.scenario).toMatchObject({ status: "committed", score: 0, trueYield: 0 });
  });

  it("skipping the fume hood costs yield and leaves a clue", () => {
    let hood = 0;
    let table = 0;
    for (const seed of [11, 12, 13, 14]) {
      hood += playSoapOrder(world, seed, { ...FAIR_SOAP_PLAN }).state.scenario!.trueYield!;
      const bad = playSoapOrder(world, seed, { ...FAIR_SOAP_PLAN, useHood: false });
      table += bad.state.scenario!.trueYield!;
      expect(bad.state.log.some((l) => l.text === world.pathway!.clues.notInHood)).toBe(true);
    }
    expect(table).toBeLessThan(hood * 0.8);
  });

  it("the hidden optimum and yields vary by seed; runs replay exactly", () => {
    const optima = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(new Sim(world, { seed: s }).state.scenario!.hidden)));
    expect(optima.size).toBeGreaterThan(3);
    const sim = playSoapOrder(world, 31);
    expect(hashState(replay(world, 31, sim.events, sim.state.tick))).toBe(hashState(sim.state));
  });

  it("a contaminated vessel lowers yield and shows a clue when picked up", () => {
    // Find a seed where the fault hits flask_1.
    const seed = [...Array(200).keys()].find((s) => new Sim(world, { seed: s }).state.scenario!.faults.some((f) => f.target === "flask_1"))!;
    expect(seed).toBeDefined();
    const sim = playSoapOrder(world, seed, "oracle");
    expect(sim.state.log.some((l) => l.text === "flask_1 has a faint film on the inside.")).toBe(true);
    expect(sim.state.scenario!.trueYield!).toBeLessThan(world.scenario!.targetYield);
  });
});
