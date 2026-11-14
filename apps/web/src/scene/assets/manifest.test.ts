import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";
import { PRIMITIVES } from "./primitives";

const MANIFEST = readFileSync(new URL("../../../../../assets/MANIFEST.md", import.meta.url), "utf8");

describe("asset manifest", () => {
  it("parses id -> file and skips rows without a file", () => {
    const md = "| id | kind | file |\n|----|------|------|\n| `a.one` | model | `models/one.glb` |\n| `a.two` | model | |";
    expect(parseManifest(md)).toEqual({ "a.one": "models/one.glb" });
  });

  it("every manifest id has a code primitive", () => {
    const ids = [...MANIFEST.matchAll(/^\|\s*`([^`]+)`/gm)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !PRIMITIVES[id])).toEqual([]);
  });
});

describe("content asset ids", () => {
  it("every equipment assetId is in the manifest", async () => {
    const { readdirSync } = await import("node:fs");
    const dir = new URL("../../../../../content/equipment/", import.meta.url);
    const ids = new Set([...MANIFEST.matchAll(/^\|\s*`([^`]+)`/gm)].map((m) => m[1]!));
    const missing = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")).assetId as string)
      .filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });
});
