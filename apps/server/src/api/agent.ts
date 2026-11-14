import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Action } from "@lab-rats/shared";
import { briefing } from "@lab-rats/sim-core";
import type { SessionHost } from "../sessions/SessionHost.js";

/**
 * HTTP API for agents (LLM loops, scripts, Claude Code with curl): same action space and rules as the
 * keyboard. Agents act as "llm" (default) or "script". See docs/AGENT_API.md.
 */
const AgentActor = z.enum(["llm", "script"]).default("llm");



export function registerAgentRoutes(host: SessionHost) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get("/api/agent/briefing", async () => ({
      ...briefing(host.world, host.sim.state),
      interface: {
        observe: "GET /api/agent/observe?actor=llm",
        act: "POST /api/agent/act { action, actor? }",
        wait: "POST /api/agent/wait { robot?, maxTicks?, actor? }  (blocks until your robots are idle)",
      },
    }));

    app.get("/api/agent/observe", async (req) => {
      const actor = AgentActor.parse((req.query as Record<string, string>).actor);
      return { snapshot: host.snapshot(), completions: host.takeCompletions(actor) };
    });

    app.post("/api/agent/act", async (req, reply) => {
      const body = z.object({ action: Action, actor: AgentActor }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ ok: false, reason: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return host.submit(body.data.actor, body.data.action);
    });

    /** Blocks until the robot (or every robot this actor controls) is idle, then returns completions. */
    app.post("/api/agent/wait", async (req, reply) => {
      const body = z.object({ robot: z.string().optional(), maxTicks: z.number().int().min(1).max(6000).default(600), actor: AgentActor }).safeParse(req.body ?? {});
      if (!body.success) return reply.code(400).send({ ok: false, reason: body.error.message });
      const { robot, maxTicks, actor } = body.data;
      const mine = () => host.snapshot().robots.filter((r) => r.controller === actor).map((r) => r.id);
      const { timedOut } = await host.waitUntil(() => (robot ? [robot] : mine()).every((id) => host.robotIdle(id)) || host.sim.state.scenario?.status !== "running" && !!host.sim.state.scenario, maxTicks);
      return { timedOut, snapshot: host.snapshot(), completions: host.takeCompletions(actor) };
    });
  };
}
