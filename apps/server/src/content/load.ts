import { loadContent, worldFromContent } from "@lab-rats/sim-core/node";
import type { World } from "@lab-rats/sim-core";

/** Loads and compiles a lab (optionally with a scenario); throws with every problem listed if content is invalid. */
export function loadWorld(contentDir: string, scenario: string | null, layout = "default"): World {
  return worldFromContent(loadContent(contentDir), { layout, scenario });
}

export function listScenarios(contentDir: string) {
  return Object.values(loadContent(contentDir).scenarios).map((s) => ({ id: s.id, type: s.type, title: s.title }));
}
