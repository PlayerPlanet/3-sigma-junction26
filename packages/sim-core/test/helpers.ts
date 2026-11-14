import { compileWorld, type World } from "../src/index";
import { loadDefaultLayout, loadTypes } from "./content";

export const world: World = compileWorld(loadDefaultLayout(), loadTypes());

/** Every number anywhere in `v` is an integer (no floats in sim state). */
export function nonIntegers(v: unknown, path = "state"): string[] {
  if (typeof v === "number") return Number.isInteger(v) ? [] : [`${path}=${v}`];
  if (Array.isArray(v)) return v.flatMap((x, i) => nonIntegers(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => nonIntegers(x, `${path}.${k}`));
  return [];
}
