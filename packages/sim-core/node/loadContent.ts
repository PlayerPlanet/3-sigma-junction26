/**
 * Node-only content loader (reads content/*.json with node:fs). Lives outside src/ so sim-core itself
 * stays free of Node APIs; import it as "@lab-rats/sim-core/node".
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EquipmentType, LabLayout, Pathway, Scenario } from "@lab-rats/shared";
import { compileWorld, type World } from "../src/index.js";

function parseFile<T>(schema: { parse(v: unknown): T }, path: string): T {
  try {
    return schema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (err) {
    throw new Error(`${path}: ${(err as Error).message}`);
  }
}

function loadDir<T extends { id: string }>(dir: string, schema: { parse(v: unknown): T }): Record<string, T> {
  const out: Record<string, T> = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const v = parseFile(schema, join(dir, f));
    if (out[v.id]) throw new Error(`${join(dir, f)}: duplicate id "${v.id}"`);
    out[v.id] = v;
  }
  return out;
}

export interface Content {
  layouts: Record<string, LabLayout>;
  types: Record<string, EquipmentType>;
  pathways: Record<string, Pathway>;
  scenarios: Record<string, Scenario>;
}

export function loadContent(contentDir: string): Content {
  return {
    layouts: loadDir(join(contentDir, "lab-layouts"), LabLayout),
    types: loadDir(join(contentDir, "equipment"), EquipmentType),
    pathways: loadDir(join(contentDir, "pathways"), Pathway),
    scenarios: loadDir(join(contentDir, "scenarios"), Scenario),
  };
}

/** Compiles a world from content. `scenario` null = a bare lab (no goal, placeholder reagents). */
export function worldFromContent(content: Content, opts: { layout?: string; scenario?: string | null } = {}): World {
  const layout = content.layouts[opts.layout ?? "default"];
  if (!layout) throw new Error(`unknown lab layout "${opts.layout ?? "default"}"`);
  const scenarioId = opts.scenario ?? null;
  const scenario = scenarioId ? content.scenarios[scenarioId] : undefined;
  if (scenarioId && !scenario) throw new Error(`unknown scenario "${scenarioId}" (have: ${Object.keys(content.scenarios).join(", ")})`);
  return compileWorld(layout, content.types, { scenario, pathways: content.pathways });
}

/** Repo-root content/ when running from inside the repo. */
export const DEFAULT_CONTENT_DIR = new URL("../../../content/", import.meta.url).pathname;
