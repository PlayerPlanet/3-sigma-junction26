# agents/llm/

LLM tool-use controller. `LlmDriver` drives one robot as the `llm` actor: when the robot is idle it sends
the model an observation and queues the actions the model calls. The tools (`tools.ts`) are generated
from the shared action schemas: every primitive and macro, plus `read_log` and `commit`.

Provider-neutral: `client.ts` is the interface, with one adapter per provider: `gemini.ts` (REST) and
`anthropic.ts` (official SDK). `LLM_PROVIDER` picks the adapter (`gemini` by default), `LLM_MODEL` the
model id, and the key comes from `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`. No model id is hardcoded.
Without a key + model, `llm` robots are driven by `../mock/`.

The adapters have not been run against the live APIs yet (no key at the time of writing); the driver is
unit-tested with a fake client.
