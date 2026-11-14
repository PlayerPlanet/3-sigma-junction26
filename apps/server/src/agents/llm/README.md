# agents/llm/

LLM tool-use controller. The tools are the action-space macros (`go_to`, `pick`, `place`, `transfer`,
`operate`, `analyze`, `read_log`, `commit`). Milestone 7.

Provider-neutral: `LLM_PROVIDER` picks the backend (`gemini` by default, or `anthropic`), `LLM_MODEL` the
model id, and the key comes from `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`. One adapter file per provider
behind a shared interface; the rest of the server only sees "an llm controller". No model id is hardcoded.
Without a key + model, robots fall back to `../mock/`.
