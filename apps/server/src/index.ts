import { randomInt } from "node:crypto";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { config, llmStatus } from "./config.js";
import { openDb } from "./db/index.js";
import { loadWorld } from "./content/load.js";
import { registerRoutes } from "./api/routes.js";
import { registerAgentRoutes } from "./api/agent.js";
import { SessionHost } from "./sessions/SessionHost.js";

const host = new SessionHost((scenario) => loadWorld(config.contentDir, scenario));
const scenario = process.env.SCENARIO === "none" ? null : process.env.SCENARIO || "soap_order";
host.start({ scenario, seed: process.env.SEED ? Number(process.env.SEED) : randomInt(2 ** 31), speed: Number(process.env.SPEED || 1) });

const db = openDb(config.dbPath);
const app = Fastify({ logger: { level: "info" } });
await app.register(websocket);
await app.register(registerRoutes(host));
await app.register(registerAgentRoutes(host));

const close = async () => {
  host.stop();
  await app.close();
  db.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: config.port, host: config.host });
app.log.info(`session: scenario ${host.config.scenario ?? "(sandbox)"}, seed ${host.config.seed}, speed ${host.config.speed}x`);
app.log.info(`db: ${config.dbPath}`);
app.log.info(
  llmStatus.available
    ? `llm controller: ${llmStatus.provider} / ${llmStatus.model}`
    : `llm controller: unavailable (set ${config.llm.apiKeyEnv} and LLM_MODEL) -> mock`,
);
