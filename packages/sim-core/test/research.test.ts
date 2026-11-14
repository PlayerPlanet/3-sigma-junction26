import { describe, expect, it } from "vitest";
import { FAIR_SOAP_PLAN, Sim, hashState, planConditions, playSoapOrder, replay, researchTruth, scoreResearch } from "../src/index";
import { worldFromContent } from "../node/loadContent";
import { content } from "./content";
import { nonIntegers } from "./helpers";

const world = worldFromContent(content, { scenario: "soap_research" });
const sc = world.scenario!;
if (sc.type !== "research") throw new Error("soap_research must be a research scenario");

const commitAnswer = (sim: Sim, answer: Record<string, number>) => {
  sim.submit("human", { type: "commit", result: { answer } });
  return sim.tick().find((e) => e.action.type === "commit")!.result;
};

describe("research question scoring (milestone 8)", () => {
  it("the exact answer scores 100 and reveals the truth", () => {
    const sim = new Sim(world, { seed: 3 });
    const truth = researchTruth(sim.state.scenario!);
    expect(commitAnswer(sim, truth).ok).toBe(true);
    expect(sim.state.scenario).toMatchObject({ status: "committed", score: 100, answer: truth });
    expect(sim.state.log.at(-2)!.text).toContain(`${truth.add_share}% at ${truth.temp} °C`);
  });

  it("the score falls with distance and reaches zero at the tolerance", () => {
    const sim = new Sim(world, { seed: 3 });
    const t = researchTruth(sim.state.scenario!);
    const score = (a: { add_share: number; temp: number }) => scoreResearch(world, sim.state, a).score;
    expect(score({ add_share: t.add_share + 5, temp: t.temp })).toBe(75);
    expect(score({ add_share: t.add_share, temp: t.temp + sc.answerTolerance.temp })).toBe(50);
    expect(score({ add_share: t.add_share + 30, temp: t.temp - 40 })).toBe(0);
  });

  it("rejects a vessel or a malformed answer and keeps the session running", () => {
    const sim = new Sim(world, { seed: 3 });
    expect(commitAnswer(sim, { add_share: 37.5, temp: 60 }).ok).toBe(false);
    sim.submit("human", { type: "commit", result: { item: "flask_1" } });
    expect(sim.tick()[0]!.result.ok).toBe(false);
    expect(sim.state.scenario!.status).toBe("running");
  });

  it("doing nothing scores zero when time runs out", () => {
    const sim = new Sim(world, { seed: 1 });
    sim.run(sc.budget.ticks);
    expect(sim.state.scenario).toMatchObject({ status: "timeout", score: 0 });
  });

  it("the analyzer refuses runs beyond the budget", () => {
    const sim = new Sim(world, { seed: 5, controllers: { r1: "script" } });
    sim.submit("script", { type: "place", robot: "r1", item: "beaker_1", target: "analyzer_1" });
    for (let i = 0; i <= sc.budget.analyses; i++) sim.submit("script", { type: "analyze", robot: "r1", sample: "beaker_1" });
    sim.runUntilIdle(20_000);
    expect(sim.state.analyses).toBe(sc.budget.analyses);
    expect(sim.drainCompletions().at(-1)!.result.reason).toContain("no analyzer runs left");
  });

  it("the scripted one-batch guess gets partial credit, keeps integer state and replays exactly", () => {
    const scores = [1, 2, 3, 4, 5, 6].map((seed) => {
      const sim = playSoapOrder(world, seed);
      expect(sim.state.scenario!.answer).toEqual(planConditions(FAIR_SOAP_PLAN));
      expect(nonIntegers(sim.state)).toEqual([]);
      if (seed === 1) expect(hashState(replay(world, seed, sim.events, sim.state.tick))).toBe(hashState(sim.state));
      return sim.state.scenario!.score!;
    });
    expect(Math.max(...scores)).toBeGreaterThan(40);
    expect(scores.some((s) => s < 100)).toBe(true);
  });
});
