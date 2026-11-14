import type { LlmClient, LlmMessage, LlmRequest, LlmResponse } from "./client.js";

interface Part {
  text?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [k: string]: unknown;
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}

function toContent(m: LlmMessage): Content {
  if (m.role === "assistant") {
    // Echo the model's own content back unchanged so thought signatures stay attached to its calls.
    if (m.raw) return m.raw as Content;
    return { role: "model", parts: [...(m.text ? [{ text: m.text }] : []), ...m.calls.map((c) => ({ functionCall: { name: c.name, args: c.args } }))] };
  }
  return {
    role: "user",
    parts: [...(m.results ?? []).map((r) => ({ functionResponse: { name: r.name, response: { result: r.content } } })), { text: m.text }],
  };
}

/** Gemini through the REST generateContent endpoint (function calling, one request per controller turn). */
export function geminiClient(apiKey: string, model: string, fetchFn: typeof fetch = fetch): LlmClient {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return {
    label: `gemini / ${model}`,
    async chat(req: LlmRequest): Promise<LlmResponse> {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map(toContent),
          tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
        }),
      });
      if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { candidates?: { content?: Content }[]; promptFeedback?: { blockReason?: string } };
      const content = body.candidates?.[0]?.content;
      if (!content?.parts?.length) throw new Error(`gemini returned no content${body.promptFeedback?.blockReason ? ` (${body.promptFeedback.blockReason})` : ""}`);
      const text = content.parts.flatMap((p) => (typeof p.text === "string" && !p.thought ? [p.text] : [])).join("\n");
      const calls = content.parts.flatMap((p, i) => (p.functionCall ? [{ id: p.functionCall.id ?? `call_${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} }] : []));
      return { text, calls, raw: content };
    },
  };
}
