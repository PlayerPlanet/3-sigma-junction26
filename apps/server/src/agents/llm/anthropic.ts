import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmMessage, LlmRequest, LlmResponse } from "./client.js";

function toParam(m: LlmMessage): Anthropic.MessageParam {
  if (m.role === "assistant") {
    // Echo the model's own content back unchanged so thinking blocks stay valid.
    if (m.raw) return { role: "assistant", content: m.raw as Anthropic.ContentBlockParam[] };
    return {
      role: "assistant",
      content: [...(m.text ? [{ type: "text" as const, text: m.text }] : []), ...m.calls.map((c) => ({ type: "tool_use" as const, id: c.id, name: c.name, input: c.args }))],
    };
  }
  // All tool results go in one user message, before the observation text.
  return {
    role: "user",
    content: [...(m.results ?? []).map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content })), { type: "text" as const, text: m.text }],
  };
}

/** Claude through the official SDK (Messages API, client-side tools, one request per controller turn). */
export function anthropicClient(apiKey: string, model: string): LlmClient {
  const client = new Anthropic({ apiKey });
  return {
    label: `anthropic / ${model}`,
    async chat(req: LlmRequest): Promise<LlmResponse> {
      const res = await client.messages.create({
        model,
        max_tokens: 16000,
        system: req.system,
        tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })),
        messages: req.messages.map(toParam),
      });
      if (res.stop_reason === "refusal") throw new Error("the model declined the request");
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      const calls = res.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, args: (b.input ?? {}) as Record<string, unknown> }] : []));
      return { text, calls, raw: res.content };
    },
  };
}
