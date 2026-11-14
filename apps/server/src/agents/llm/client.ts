/**
 * Provider-neutral chat interface for the LLM controller. One adapter per provider (gemini.ts,
 * anthropic.ts) maps these shapes to its API; LlmDriver only sees this file.
 */
export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmToolResult {
  id: string;
  name: string;
  content: string;
}

export type LlmMessage =
  /** An observation. `results` answers the tool calls of the assistant message just before it. */
  | { role: "user"; text: string; results?: LlmToolResult[] }
  /** `raw` is the provider's own content for this turn, echoed back unchanged (thinking blocks, signatures). */
  | { role: "assistant"; text: string; calls: LlmToolCall[]; raw?: unknown };

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
}

export interface LlmResponse {
  text: string;
  calls: LlmToolCall[];
  raw?: unknown;
}

export interface LlmClient {
  /** e.g. "gemini / <model>" */
  readonly label: string;
  chat(req: LlmRequest): Promise<LlmResponse>;
}
