import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards the architecture rule: sim-core runs in plain Node and never reaches into
// the web app, the server, rendering libraries or non-deterministic globals.
const SRC = fileURLToPath(new URL("../src", import.meta.url));

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

const FORBIDDEN_IMPORTS = [/apps\//, /@lab-rats\/(web|server)/, /^three/, /^react/, /^@react-three/, /^node:/, /^fastify/, /^better-sqlite3/];
const FORBIDDEN_GLOBALS = [/\bMath\.random\s*\(/, /\bDate\.now\s*\(/, /\bnew Date\s*\(/, /\bperformance\.now\s*\(/, /\bwindow\./, /\bdocument\./, /\bfetch\s*\(/];

describe("sim-core purity", () => {
  const files = tsFiles(SRC);

  it("has source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = relative(SRC, file);
    // Strip comments so documentation may mention forbidden names.
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const imports = [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);

    it(`${rel}: imports only pure modules`, () => {
      const bad = imports.filter((spec) => FORBIDDEN_IMPORTS.some((re) => re.test(spec)));
      expect(bad).toEqual([]);
    });

    it(`${rel}: uses no non-deterministic or browser globals`, () => {
      const bad = FORBIDDEN_GLOBALS.filter((re) => re.test(text)).map(String);
      expect(bad).toEqual([]);
    });
  }
});
