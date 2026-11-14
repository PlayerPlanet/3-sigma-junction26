import { describe, expect, it } from "vitest";
import type { LlmClient, LlmRequest, LlmResponse } from "../src/agents/llm/client";
import { geminiClient } from "../src/agents/llm/gemini";
import { LLM_TOOLS, toAction } from "../src/agents/llm/tools";
import { runToEnd, settle, testHost } from "./helpers";

/** A fake model: answers each request with the next scripted response and records what it was sent. */
function fakeLlm(script: (LlmResponse | Error)[]): LlmClient & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    label: "fake",
    requests,
    async chat(req) {
      requests.push(JSON.parse(JSON.stringify(req)) as LlmRequest);
      const next = script.shift() ?? { text: "nothing to do", calls: [] };
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

describe("built-in controllers (milestone 7)", () => {
  it("the scripted controller completes an order when a human assigns it, and commits", () => {
    const { host, notes } = testHost();
    host.start({ scenario: "soap_order", seed: 4, speed: 1 }, false);
    expect(host.submit("human", { type: "set_controller", robot: "r1", controller: "script" }).ok).toBe(true);
    expect(host.driverLabel("r1")).toBe("script");
    runToEnd(host);
    expect(notes).toEqual([]);
    expect(host.sim.state.scenario).toMatchObject({ status: "committed", committedItem: "flask_1" });
    expect(host.sim.state.scenario!.score!).toBeGreaterThan(0);
  });

  it("the scripted controller answers a research question", () => {
    const { host } = testHost();
    host.start({ scenario: "soap_research", seed: 4, speed: 1, controllers: { r1: "script" } }, false);
    runToEnd(host);
    expect(host.sim.state.scenario).toMatchObject({ status: "committed", answer: { add_share: 38, temp: 63 } });
  });

  it("a human takeover detaches the controller; an agent that claims a robot itself gets none", () => {
    const { host } = testHost();
    host.start({ scenario: "soap_order", seed: 4, speed: 1, controllers: { r1: "script" } }, false);
    for (let i = 0; i < 3; i++) host.advance(10);
    expect(host.sim.state.robots.r1!.task).not.toBeNull();
    host.submit("human", { type: "set_controller", robot: "r1", controller: "human" });
    expect(host.driverLabel("r1")).toBeNull();
    host.advance(400);
    expect(host.robotIdle("r1")).toBe(true);
    expect(host.sim.state.scenario!.status).toBe("running");

    expect(host.submit("llm", { type: "set_controller", robot: "r2", controller: "llm" }).ok).toBe(true);
    expect(host.driverLabel("r2")).toBeNull();
    host.submit("llm", { type: "go_to", robot: "r2", station: "st_balance" });
    host.advance(300);
    expect(host.takeCompletions("llm")).toHaveLength(1);
  });

  it("a failing script hands the robot back", () => {
    const { host, notes } = testHost();
    host.start({ scenario: "soap_order", seed: 4, speed: 1, controllers: { r1: "script" } }, false);
    // Remove the flask the script needs: a human throws it away with r2.
    host.submit("human", { type: "set_controller", robot: "r2", controller: "human" });
    host.submit("human", { type: "set_controller", robot: "r1", controller: "idle" });
    host.submit("human", { type: "place", robot: "r2", item: "flask_1", target: "waste_1" });
    host.advance(600);
    expect(host.sim.state.items.flask_1!.location.kind).toBe("waste");
    host.submit("human", { type: "set_controller", robot: "r1", controller: "script" });
    for (let i = 0; i < 20; i++) host.advance(10);
    expect(notes.join()).toMatch(/script controller on r1 stopped/);
    expect(host.sim.state.robots.r1!.controller).toBe("idle");
    expect(host.driverLabel("r1")).toBeNull();
  });

  it("without an LLM, the llm controller is the mock: it wanders and never commits", () => {
    const { host } = testHost({ llm: null });
    host.start({ scenario: "soap_order", seed: 9, speed: 1, controllers: { r2: "llm" } }, false);
    expect(host.driverLabel("r2")).toBe("mock");
    const start = host.snapshot().robots.find((r) => r.id === "r2")!.node;
    const seen = new Set<string | null>();
    for (let i = 0; i < 60; i++) {
      host.advance(20);
      seen.add(host.snapshot().robots.find((r) => r.id === "r2")!.station);
    }
    expect(seen.size).toBeGreaterThan(2);
    expect(start).not.toBeNull();
    expect(host.sim.state.commits).toEqual([]);
    expect(Object.values(host.sim.state.items).every((i) => i.location.kind === "place")).toBe(true);
  });

  it("the LLM controller queues the model's tool calls and reports results back", async () => {
    const llm = fakeLlm([
      { text: "", calls: [{ id: "c1", name: "go_to", args: { station: "st_balance" } }, { id: "c2", name: "teleport", args: {} }, { id: "c3", name: "wait", args: { ticks: 0 } }] },
      { text: "", calls: [{ id: "c4", name: "commit", args: { result: { item: "flask_1" } } }] },
    ]);
    const { host } = testHost({ llm });
    host.start({ scenario: "soap_order", seed: 2, speed: 1, controllers: { r1: "llm" } }, false);
    expect(host.driverLabel("r1")).toBe("fake");
    for (let i = 0; i < 40 && !host.ended(); i++) {
      host.advance(10);
      await settle();
    }
    expect(host.sim.state.scenario!.status).toBe("committed");
    const [first, second] = llm.requests;
    expect(first!.system).toContain("You control robot r1");
    expect(first!.system).not.toContain("hidden");
    expect(first!.tools.map((t) => t.name)).toContain("tilt_pour");
    const obs = second!.messages.at(-1)!;
    if (obs.role !== "user") throw new Error("expected an observation");
    expect(obs.results).toEqual([
      { id: "c1", name: "go_to", content: "queued" },
      { id: "c2", name: "teleport", content: 'rejected: unknown tool "teleport"' },
      { id: "c3", name: "wait", content: expect.stringMatching(/^rejected: ticks/) },
    ]);
    const seen = JSON.parse(obs.text) as { finished: { action: { type: string }; ok: boolean }[]; robot: { station: string } };
    expect(seen.finished).toEqual([{ action: { type: "go_to", robot: "r1", station: "st_balance" }, ok: true }]);
    expect(seen.robot.station).toBe("st_balance");
  });

  it("the LLM controller gives the robot up after repeated model failures", async () => {
    const llm = fakeLlm([new Error("503"), new Error("503"), new Error("503")]);
    const { host, notes } = testHost({ llm });
    host.start({ scenario: "soap_order", seed: 2, speed: 1, controllers: { r1: "llm" } }, false);
    for (let i = 0; i < 40; i++) {
      host.advance(10);
      await settle();
    }
    expect(llm.requests).toHaveLength(3);
    expect(host.sim.state.robots.r1!.controller).toBe("idle");
    expect(notes.at(-1)).toMatch(/stopped: too many failed model calls/);
  });

  it("tools mirror the action space and validate arguments", () => {
    expect(LLM_TOOLS.map((t) => t.name)).toEqual([
      "move_along_rail", "set_hand_height", "extend_hand", "grip", "release", "tilt_pour", "press", "wait",
      "go_to", "pick", "place", "transfer", "operate", "analyze", "read_log", "commit",
    ]);
    for (const t of LLM_TOOLS) {
      expect(t.parameters).toMatchObject({ type: "object" });
      expect(JSON.stringify(t.parameters)).not.toContain('"robot"');
    }
    expect(toAction({ id: "x", name: "press", args: { hand: "b", control: "dispense" } }, "r3")).toEqual({ action: { type: "press", robot: "r3", hand: "b", control: "dispense" } });
    expect(toAction({ id: "x", name: "set_controller", args: { controller: "human" } }, "r3")).toHaveProperty("error");
  });

  it("the Gemini adapter sends function declarations and reads function calls", async () => {
    let sent: { url: string; body: Record<string, unknown>; key: string | null } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) as Record<string, unknown>, key: new Headers(init.headers).get("x-goog-api-key") };
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "ok" }, { functionCall: { name: "go_to", args: { station: "st_balance" } }, thoughtSignature: "sig" }] } }] }));
    }) as typeof fetch;
    const client = geminiClient("k", "some-model", fakeFetch);
    const res = await client.chat({
      system: "sys",
      tools: LLM_TOOLS.slice(0, 1),
      messages: [
        { role: "user", text: "obs 1" },
        { role: "assistant", text: "", calls: [{ id: "call_0", name: "wait", args: { ticks: 5 } }] },
        { role: "user", text: "obs 2", results: [{ id: "call_0", name: "wait", content: "queued" }] },
      ],
    });
    expect(res.calls).toEqual([{ id: "call_1", name: "go_to", args: { station: "st_balance" } }]);
    expect(res.text).toBe("ok");
    expect(res.raw).toMatchObject({ role: "model" });
    expect(sent!.url).toContain("/models/some-model:generateContent");
    expect(sent!.key).toBe("k");
    expect(sent!.body).toMatchObject({
      systemInstruction: { parts: [{ text: "sys" }] },
      tools: [{ functionDeclarations: [{ name: "move_along_rail" }] }],
      contents: [
        { role: "user", parts: [{ text: "obs 1" }] },
        { role: "model", parts: [{ functionCall: { name: "wait", args: { ticks: 5 } } }] },
        { role: "user", parts: [{ functionResponse: { name: "wait", response: { result: "queued" } } }, { text: "obs 2" }] },
      ],
    });
  });
});
