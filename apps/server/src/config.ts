import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LLM_PROVIDERS, type LlmProvider, type LlmStatus } from "@lab-rats/shared";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

// Load the repo-root .env if present (Node >= 21.7 built-in; no dotenv dependency).
const envFile = resolve(REPO_ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const fromRoot = (p: string) => (isAbsolute(p) ? p : resolve(REPO_ROOT, p));

const provider = (process.env.LLM_PROVIDER || "gemini") as LlmProvider;
if (!LLM_PROVIDERS.includes(provider)) {
  throw new Error(`LLM_PROVIDER must be one of ${LLM_PROVIDERS.join(", ")}, got "${provider}"`);
}
const API_KEY_ENV: Record<LlmProvider, string> = { gemini: "GEMINI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };

export const config = {
  port: Number(process.env.PORT || 8790),
  host: process.env.HOST || "127.0.0.1",
  dbPath: fromRoot(process.env.DB_PATH || "data/labrats.sqlite"),
  contentDir: fromRoot(process.env.CONTENT_DIR || "content"),
  llm: {
    provider,
    apiKeyEnv: API_KEY_ENV[provider],
    apiKey: process.env[API_KEY_ENV[provider]] || "",
    model: process.env.LLM_MODEL || "",
  },
};

/** The LLM controller needs a key for the chosen provider and an explicit model id; otherwise robots use the mock controller. */
export const llmStatus: LlmStatus = {
  provider,
  model: config.llm.model,
  available: Boolean(config.llm.apiKey && config.llm.model),
};
