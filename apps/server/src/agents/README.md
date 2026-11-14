# agents/

Built-in controllers ("drivers"). A robot's controller slot is one of human, llm, script, idle. When a
human (or the session config) sets a robot to `script` or `llm`, the session host attaches a driver from
`index.ts`: `scripted/` for `script`, `llm/` for `llm` (or `mock/` without an LLM key + model). Drivers
use the same action space as every other controller and detach when the robot's controller changes.

External agents on the HTTP API also act as `llm` or `script`; a robot they claim themselves gets no
built-in driver.
