import { describe, expect, it } from "vitest";
import type { Action } from "@lab-rats/shared";
import { SimEvent } from "@lab-rats/shared";
import { SPEED_MM_PER_TICK, MAX_BLOCKED_TICKS, Sim, createInitialState, hashState, replay, runDemo, snapshot, step } from "../src/index";
import { nonIntegers, world } from "./helpers";

const newSim = (seed = 1) => new Sim(world, { seed });
/** A sim with r2 already parked at the analyzer station (loop_e), blocking it. */
const simWithR2AtAnalyzer = (seed = 1) => {
  const sim = newSim(seed);
  expect(sim.submit("human", { type: "go_to", robot: "r2", station: "st_analyzer" }).ok).toBe(true);
  sim.runUntilIdle();
  expect(sim.state.robots.r2!.rail).toEqual({ node: "loop_e" });
  sim.drainCompletions();
  return sim;
};
const submitAll = (sim: Sim, actor: "human" | "llm" | "script", actions: Action[]) => {
  for (const a of actions) expect(sim.submit(actor, a)).toMatchObject({ ok: true });
};

describe("determinism (milestone 3 acceptance)", () => {
  it("same seed + same actions = identical state hash", () => {
    const a = runDemo(world, 1234);
    const b = runDemo(world, 1234);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.state.tick).toBe(b.state.tick);
    expect(a.events).toEqual(b.events);
  });

  it("replaying the event log from the seed reproduces the exact state", () => {
    const sim = runDemo(world, 77);
    expect(hashState(replay(world, 77, sim.events, sim.state.tick))).toBe(hashState(sim.state));
  });

  it("replay survives a JSON round trip of the event log (as stored in SQLite)", () => {
    const sim = runDemo(world, 5);
    const stored = JSON.parse(JSON.stringify(sim.events)).map((e: unknown) => SimEvent.parse(e));
    expect(hashState(replay(world, 5, stored, sim.state.tick))).toBe(hashState(sim.state));
  });

  it("the seed drives the noisy readings", () => {
    const readings = new Set([1, 2, 3, 4, 5, 6].map((seed) => runDemo(world, seed).state.log.find((l) => l.level === "result")!.text));
    expect(readings.size).toBeGreaterThan(1);
  });

  it("the demo completes: liquid dispensed, heated, poured, analyzed, committed", () => {
    const sim = runDemo(world, 1);
    expect(sim.drainCompletions().filter((c) => !c.result.ok)).toEqual([]);
    expect(sim.state.items.flask_1!.contents).toEqual({ reagent_b: 25 });
    expect(sim.state.items.flask_1!.location).toEqual({ kind: "place", place: "analyzer_1", slot: 0 });
    expect(sim.state.items.beaker_1!.location).toEqual({ kind: "waste" });
    expect(sim.state.waste).toBe(15);
    expect(sim.state.commits).toEqual([expect.objectContaining({ item: "flask_1", actor: "script" })]);
    expect(sim.state.log.some((l) => l.level === "result" && l.text.startsWith("Analyzer (flask_1)"))).toBe(true);
  });

  it("state is plain JSON of integers and step() never mutates its input", () => {
    const sim = runDemo(world, 9);
    expect(nonIntegers(sim.state)).toEqual([]);
    expect(JSON.parse(JSON.stringify(sim.state))).toEqual(sim.state);
    const before = JSON.stringify(sim.state);
    step(world, sim.state, [{ actor: "human", action: { type: "wait", robot: "r1", ticks: 5 } }]);
    expect(JSON.stringify(sim.state)).toBe(before);
  });

  it("every logged event matches the wire schema", () => {
    for (const e of runDemo(world, 3).events) expect(() => SimEvent.parse(e)).not.toThrow();
  });
});

describe("rail kinematics", () => {
  it("moves at the fixed speed and parks at the station", () => {
    const sim = newSim();
    submitAll(sim, "human", [{ type: "go_to", robot: "r1", station: "st_balance" }]);
    sim.runUntilIdle();
    const r1 = sim.state.robots.r1!;
    expect(r1.rail).toEqual({ node: "loop_n" });
    const length = world.segmentLength.get("loop_n_west")!;
    expect(r1.last!.endTick - r1.last!.startTick + 1).toBe(Math.ceil(length / SPEED_MM_PER_TICK));
  });

  it("a robot waits for a parked robot, then fails as blocked", () => {
    const sim = simWithR2AtAnalyzer();
    submitAll(sim, "human", [{ type: "move_along_rail", robot: "r1", to: "st_analyzer" }]);
    sim.runUntilIdle();
    const r1 = sim.state.robots.r1!;
    expect(r1.last).toMatchObject({ type: "move_along_rail", status: "blocked" });
    expect(r1.rail).toEqual({ node: "loop_ne" });
    expect(sim.state.log.some((l) => l.source === "r1" && l.text.startsWith("waiting: r2"))).toBe(true);
    expect(r1.last!.endTick - r1.last!.startTick).toBeGreaterThan(MAX_BLOCKED_TICKS);
  });

  it("a waiting robot proceeds once the way clears", () => {
    const sim = simWithR2AtAnalyzer();
    submitAll(sim, "human", [{ type: "move_along_rail", robot: "r1", to: "st_analyzer" }]);
    sim.run(100); // r1 is now waiting at loop_ne
    submitAll(sim, "human", [{ type: "go_to", robot: "r2", station: "st_filter" }]);
    sim.runUntilIdle();
    expect(sim.state.robots.r1!.rail).toEqual({ node: "loop_e" });
    expect(sim.state.robots.r1!.last!.status).toBe("ok");
    expect(sim.state.robots.r2!.rail).toEqual({ node: "loop_se" });
  });

  it("two robots never share a segment or a node", () => {
    const sim = runDemo(world, 11);
    const states = [];
    let s = createInitialState(world, 11);
    const byTick = new Map<number, typeof sim.events>();
    for (const e of sim.events) byTick.set(e.tick, [...(byTick.get(e.tick) ?? []), e]);
    while (s.tick < sim.state.tick) {
      const inputs = (byTick.get(s.tick) ?? []).filter((e) => !["go_to", "pick", "place", "transfer", "operate", "analyze"].includes(e.action.type));
      s = step(world, s, inputs.map((e) => ({ actor: e.actor, action: e.action as never }))).state;
      states.push(s);
    }
    for (const st of states) {
      const held = Object.values(st.robots).flatMap((r) => ("node" in r.rail ? [`n:${r.rail.node}`] : [`s:${r.rail.segment}`, `n:${r.rail.to}`]));
      expect(new Set(held).size).toBe(held.length);
    }
  });
});

describe("hand kinematics and collisions", () => {
  it("rejects extending below the work level at the table", () => {
    const sim = newSim();
    submitAll(sim, "human", [
      { type: "set_hand_height", robot: "r1", hand: "a", level: 0 },
      { type: "extend_hand", robot: "r1", hand: "a", amount: 50 },
    ]);
    sim.runUntilIdle();
    expect(sim.state.robots.r1!.last).toMatchObject({ type: "extend_hand", status: "invalid" });
    expect(sim.state.robots.r1!.last!.reason).toMatch(/would hit the table/);
    expect(sim.state.robots.r1!.hands.a.extend).toBe(0);
  });

  it("rejects moving with a hand extended, and moving a hand vertically while extended", () => {
    const sim = newSim();
    const reach = world.places.get("dispenser_1")!.reach;
    submitAll(sim, "human", [
      { type: "extend_hand", robot: "r1", hand: "a", amount: reach },
      { type: "move_along_rail", robot: "r1", to: "st_balance" },
    ]);
    sim.runUntilIdle();
    expect(sim.state.robots.r1!.last!.reason).toMatch(/retract both hands/);
    submitAll(sim, "human", [{ type: "set_hand_height", robot: "r1", hand: "a", level: 4 }]);
    sim.runUntilIdle();
    expect(sim.state.robots.r1!.last!.reason).toMatch(/retract hand a/);
  });

  it("gripping in the wrong spot grips nothing; at the right spot picks the item", () => {
    const sim = newSim();
    const rack = world.places.get("rack_1")!;
    submitAll(sim, "human", [
      { type: "go_to", robot: "r1", station: "st_glassware" },
      { type: "set_hand_height", robot: "r1", hand: "a", level: rack.workLevel + 1 },
      { type: "extend_hand", robot: "r1", hand: "a", amount: rack.reach },
      { type: "grip", robot: "r1", hand: "a" },
    ]);
    sim.runUntilIdle();
    expect(sim.state.robots.r1!.hands.a).toMatchObject({ gripping: true, holding: null });
    submitAll(sim, "human", [
      { type: "release", robot: "r1", hand: "a" },
      { type: "extend_hand", robot: "r1", hand: "a", amount: 0 },
      { type: "set_hand_height", robot: "r1", hand: "a", level: rack.workLevel },
      { type: "extend_hand", robot: "r1", hand: "a", amount: rack.reach },
      { type: "grip", robot: "r1", hand: "a", slot: 2 },
    ]);
    sim.runUntilIdle();
    expect(sim.state.robots.r1!.hands.a.holding).toBe("beaker_1");
    expect(sim.state.places.rack_1![2]).toBeNull();
  });
});

describe("macros", () => {
  it("reject impossible requests without touching the robot", () => {
    const sim = newSim();
    const requests: Action[] = [
      { type: "pick", robot: "r1", item: "unobtainium" },
      { type: "transfer", robot: "r1", from: "beaker_1", to: "flask_1", amount: 10 },
      { type: "operate", robot: "r1", equipment: "hotplate_1", settings: { heat: 99 } },
    ];
    const reasons = requests.map((a) => {
      submitAll(sim, "human", [a]);
      sim.runUntilIdle();
      return sim.drainCompletions()[0]!.result.reason;
    });
    expect(reasons).toEqual([expect.stringMatching(/unknown item/), expect.stringMatching(/cannot pour into vessels on rack_1/), expect.stringMatching(/heat must be/)]);
    expect(sim.state.robots.r1!.seq).toBe(0);
  });

  it("abandon the rest of the plan, and the robot's queue, when a step fails", () => {
    const sim = simWithR2AtAnalyzer();
    // The analyzer station is occupied by r2, so the move inside `place` fails and nothing after it runs.
    submitAll(sim, "human", [
      { type: "place", robot: "r1", item: "beaker_1", target: "analyzer_1" },
      { type: "set_hand_height", robot: "r1", hand: "b", level: 1 },
      { type: "go_to", robot: "r1", station: "st_shelf" },
    ]);
    sim.runUntilIdle();
    const completions = sim.drainCompletions();
    expect(completions).toHaveLength(1);
    expect(completions[0]!.result).toMatchObject({ ok: false, reason: expect.stringMatching(/blocked.*\(dropped 2 queued requests\)/) });
    expect(sim.state.robots.r1!.hands.b.level).not.toBe(1);
    expect(sim.state.robots.r1!.hands.a.holding).toBe("beaker_1");
    expect(sim.state.items.beaker_1!.location).toMatchObject({ kind: "hand", robot: "r1" });
  });

  it("overfilling a vessel spills to waste", () => {
    const sim = newSim();
    const d = world.places.get("dispenser_1")!;
    submitAll(sim, "human", [
      { type: "place", robot: "r1", item: "beaker_1", target: "dispenser_1" },
      { type: "set_hand_height", robot: "r1", hand: "b", level: d.workLevel },
      { type: "extend_hand", robot: "r1", hand: "b", amount: d.reach },
      ...Array.from({ length: 8 }, () => ({ type: "press" as const, robot: "r1", hand: "b" as const, control: "dispense" })),
    ]);
    sim.runUntilIdle();
    expect(sim.state.items.beaker_1!.contents).toEqual({ reagent_a: 150 });
    expect(sim.state.waste).toBe(8 * 20 - 150);
  });
});

describe("controllers and takeover", () => {
  it("only the robot's controller may queue actions for it", () => {
    const sim = new Sim(world, { seed: 1, controllers: { r1: "llm", r2: "human", r3: "idle" } });
    expect(sim.submit("human", { type: "go_to", robot: "r1", station: "st_balance" })).toMatchObject({ ok: false, reason: expect.stringMatching(/controlled by llm/) });
    expect(sim.submit("llm", { type: "go_to", robot: "r1", station: "st_balance" }).ok).toBe(true);
    expect(sim.submit("human", { type: "go_to", robot: "r3", station: "st_hood_s2" })).toMatchObject({ ok: false, reason: expect.stringMatching(/idle/) });
  });

  it("takeover cancels pending AI work at the next rail node and hands control to the human", () => {
    const sim = new Sim(world, { seed: 1, controllers: { r1: "llm" } });
    submitAll(sim, "llm", [
      { type: "go_to", robot: "r1", station: "st_waste" },
      { type: "pick", robot: "r1", item: "beaker_1" },
    ]);
    sim.run(30); // mid-way along the west arc
    expect("segment" in sim.state.robots.r1!.rail).toBe(true);
    expect(sim.submit("human", { type: "set_controller", robot: "r1", controller: "human" }).ok).toBe(true);
    sim.runUntilIdle();
    const r1 = sim.state.robots.r1!;
    expect(r1.controller).toBe("human");
    expect(r1.last).toMatchObject({ type: "move_along_rail", status: "cancelled" });
    expect("node" in r1.rail && r1.rail.node).toBe("loop_w"); // stopped at the next node, not at st_waste
    expect(sim.state.items.beaker_1!.location.kind).toBe("place"); // the queued pick never ran
    expect(sim.submit("llm", { type: "go_to", robot: "r1", station: "st_balance" }).ok).toBe(false);
    // Hand back: the AI can act again from where the human left the robot.
    submitAll(sim, "human", [{ type: "set_controller", robot: "r1", controller: "llm" }]);
    sim.tick();
    expect(sim.submit("llm", { type: "go_to", robot: "r1", station: "st_shelf" }).ok).toBe(true);
    sim.runUntilIdle();
    expect(sim.state.robots.r1!.rail).toEqual({ node: "loop_w" });
  });

  it("takeover mid-run replays exactly", () => {
    const sim = new Sim(world, { seed: 21, controllers: { r1: "llm" } });
    submitAll(sim, "llm", [{ type: "place", robot: "r1", item: "beaker_1", target: "hotplate_1" }]);
    sim.run(150);
    sim.submit("human", { type: "set_controller", robot: "r1", controller: "human" });
    sim.run(5);
    submitAll(sim, "human", [{ type: "go_to", robot: "r1", station: "st_dispenser" }]);
    sim.runUntilIdle();
    expect(hashState(replay(world, 21, sim.events, sim.state.tick))).toBe(hashState(sim.state));
  });
});

describe("snapshot", () => {
  it("places held items at the robot's hand and moving robots between nodes", () => {
    const sim = newSim();
    submitAll(sim, "human", [{ type: "pick", robot: "r1", item: "beaker_1" }, { type: "go_to", robot: "r1", station: "st_balance" }]);
    while (sim.state.robots.r1!.hands.a.holding !== "beaker_1") sim.tick();
    sim.run(30);
    const snap = snapshot(world, sim.state);
    const r1 = snap.robots.find((r) => r.id === "r1")!;
    const beaker = snap.items.find((i) => i.id === "beaker_1")!;
    expect(r1.node).toBeNull();
    expect(r1.busy).toBe("move_along_rail");
    expect(Math.hypot(beaker.position!.x - r1.x, beaker.position!.z - r1.z)).toBeLessThan(0.5);
  });
});

describe("rail deadlocks", () => {
  it("routes round a parked robot when there is another way", () => {
    const sim = simWithR2AtAnalyzer();
    // From the hotplate (loop_ne) to the filter (loop_se): the short way passes r2 at loop_e.
    submitAll(sim, "human", [
      { type: "go_to", robot: "r1", station: "st_hotplate" },
      { type: "go_to", robot: "r1", station: "st_filter" },
    ]);
    sim.runUntilIdle();
    expect(sim.state.robots.r1!.rail).toEqual({ node: "loop_se" });
    expect(sim.state.log.some((l) => l.source === "r1" && l.text.startsWith("waiting"))).toBe(false);
  });

  it("fails a head-on meeting at once with a clear reason", () => {
    const sim = newSim();
    // r1 heads east along the north wall, r3 west along it, from opposite ends.
    submitAll(sim, "human", [
      { type: "go_to", robot: "r1", station: "wall_n_w" },
      { type: "go_to", robot: "r3", station: "wall_n_e" },
    ]);
    sim.runUntilIdle();
    sim.drainCompletions();
    submitAll(sim, "human", [
      { type: "go_to", robot: "r1", station: "wall_n_e" },
      { type: "go_to", robot: "r3", station: "wall_n_w" },
    ]);
    sim.runUntilIdle();
    const reasons = sim.drainCompletions().map((c) => c.result.reason ?? "");
    expect(reasons.some((r) => /head-on/.test(r))).toBe(true);
  });
});
