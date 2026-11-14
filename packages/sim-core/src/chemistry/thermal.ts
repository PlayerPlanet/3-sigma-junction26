import { AMBIENT_TEMP } from "../constants.js";
import type { SimState } from "../state.js";

/** Items not being heated drift 1 °C toward ambient every 10 ticks. */
export function coolItems(state: SimState, heated: Set<string>): void {
  if (state.tick % 10 !== 0) return;
  for (const id of Object.keys(state.items).sort()) {
    const item = state.items[id]!;
    if (heated.has(id) || item.temp === AMBIENT_TEMP) continue;
    item.temp += item.temp > AMBIENT_TEMP ? -1 : 1;
  }
}
