import { describe, expect, it } from "vitest";
import { hashState, playSoapOrder, replay } from "@lab-rats/sim-core";
import { storeFinishedSim } from "../src/db/store";
import { runToEnd, testHost, worldFor } from "./helpers";

describe("session persistence (milestone 6)", () => {
  it("stores a session as seed + events that replay to the same state", () => {
    const { host, store } = testHost();
    host.start({ scenario: "soap_order", seed: 11, speed: 1, player: "ada", controllers: { r1: "script" } }, false);
    runToEnd(host);
    const id = host.sessionId!;
    const meta = store.session(id)!;
    const sc = host.sim.state.scenario!;
    expect(meta).toMatchObject({ player: "ada", scenario: "soap_order", seed: 11, status: "committed", score: sc.score, trueYield: sc.trueYield, endTick: sc.endTick });
    const events = store.events(id);
    expect(events).toEqual(host.sim.events);
    const replayed = replay(worldFor(meta.scenario), meta.seed, events, host.sim.state.tick);
    expect(hashState(replayed)).toBe(hashState(host.sim.state));
  });

  it("marks a session that is restarted before it ends as abandoned, and a timeout as timeout", () => {
    const { host, store } = testHost();
    host.start({ scenario: "soap_order", seed: 1, speed: 1 }, false);
    host.advance(5);
    const first = host.sessionId!;
    host.start({ scenario: "soap_order", seed: 2, speed: 1 }, false);
    expect(store.session(first)).toMatchObject({ status: "abandoned", player: "anonymous", score: null });
    host.advance(worldFor("soap_order").scenario!.budget.ticks);
    expect(store.session(host.sessionId!)).toMatchObject({ status: "timeout", score: 0 });
    host.stop();
    expect(store.session(host.sessionId!)!.status).toBe("timeout");
  });

  it("keeps the running session when a restart names an unknown scenario", () => {
    const { host } = testHost();
    host.start({ scenario: "soap_order", seed: 1, speed: 1 }, false);
    const id = host.sessionId;
    expect(() => host.start({ scenario: "nope", seed: 1, speed: 1 }, false)).toThrow(/unknown scenario/);
    expect(host.sessionId).toBe(id);
    host.advance(1);
  });

  it("ranks players by their best finished run per scenario", () => {
    const { store } = testHost();
    const world = worldFor("soap_order");
    const scores: Record<string, number[]> = { ada: [], bo: [] };
    for (const seed of [1, 2]) scores.ada!.push(playSoapOrder(world, seed, "oracle").state.scenario!.score!);
    for (const seed of [1, 2]) storeFinishedSim(store, "ada", "soap_order", playSoapOrder(world, seed, "oracle"));
    const bad = playSoapOrder(world, 3, { oilPresses: 5, lyePresses: 3, heat: 9, cookTicks: 520, useHood: false });
    storeFinishedSim(store, "bo", "soap_order", bad);
    const board = store.leaderboard("soap_order");
    expect(board.map((r) => r.player)).toEqual(Math.max(...scores.ada!) >= bad.state.scenario!.score! ? ["ada", "bo"] : ["bo", "ada"]);
    expect(board.find((r) => r.player === "ada")).toMatchObject({ best: Math.max(...scores.ada!), runs: 2 });
    expect(store.leaderboard("soap_research")).toEqual([]);
    expect(store.sessions(2).map((s) => s.player)).toEqual(["bo", "ada"]);
  });
});
