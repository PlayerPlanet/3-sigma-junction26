import type { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { CONTROLLER_KINDS, ClientMessage, PROTOCOL_VERSION, type Health, type LabView, type ServerMessage } from "@lab-rats/shared";
import { SIM_CORE_VERSION } from "@lab-rats/sim-core";
import { config, llmStatus } from "../config.js";
import { listScenarios } from "../content/load.js";
import type { SessionHost } from "../sessions/SessionHost.js";

export function registerRoutes(host: SessionHost) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get("/api/health", async (): Promise<Health> => ({
      ok: true,
      protocol: PROTOCOL_VERSION,
      simCoreVersion: SIM_CORE_VERSION,
      llm: llmStatus,
      dbPath: config.dbPath,
    }));

    app.get("/api/lab", async (): Promise<LabView> => host.lab);
    app.get("/api/snapshot", async () => host.snapshot());
    app.get("/api/scenarios", async () => listScenarios(config.contentDir));
    app.get("/api/session", async () => ({ ...host.config, tick: host.sim.state.tick, status: host.sim.state.scenario?.status ?? "sandbox", score: host.sim.state.scenario?.score ?? null }));

    /** Restart the live session (new scenario and/or seed). All connected browsers switch over. */
    app.post("/api/session", async (req, reply) => {
      const body = z
        .object({
          scenario: z.string().nullable().optional(),
          seed: z.number().int().optional(),
          speed: z.number().min(1).max(50).optional(),
          controllers: z.record(z.string(), z.enum(CONTROLLER_KINDS)).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) return reply.code(400).send({ ok: false, reason: body.error.message });
      const b = body.data;
      try {
        host.start({
          scenario: b.scenario === undefined ? host.config.scenario : b.scenario,
          seed: b.seed ?? randomInt(2 ** 31),
          speed: b.speed ?? host.config.speed,
          controllers: b.controllers,
        });
      } catch (err) {
        return reply.code(400).send({ ok: false, reason: (err as Error).message });
      }
      return { ok: true, ...host.config };
    });

    app.get("/ws", { websocket: true }, (socket) => {
      const send = (m: ServerMessage) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(m));
      const greet = () => {
        send({ type: "hello", protocol: PROTOCOL_VERSION, simCoreVersion: SIM_CORE_VERSION, llm: llmStatus });
        send({ type: "lab", lab: host.lab });
        send({ type: "snapshot", snapshot: host.snapshot() });
      };
      greet();
      const offSnap = host.onSnapshot((snapshot) => send({ type: "snapshot", snapshot }));
      const offReset = host.onReset(greet);

      socket.on("message", (raw: Buffer) => {
        let parsed;
        try {
          parsed = ClientMessage.safeParse(JSON.parse(raw.toString()));
        } catch {
          return send({ type: "action_result", result: { ok: false, reason: "message is not JSON" } });
        }
        if (!parsed.success) {
          return send({ type: "action_result", result: { ok: false, reason: `invalid message: ${parsed.error.issues[0]?.message ?? "schema mismatch"}` } });
        }
        // Browser clients always act as the human actor.
        const { log: _log, ...result } = host.submit("human", parsed.data.action);
        send({ type: "action_result", ...(parsed.data.requestId ? { requestId: parsed.data.requestId } : {}), result });
      });
      socket.on("close", () => {
        offSnap();
        offReset();
      });
    });
  };
}
