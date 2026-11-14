/**
 * Parses the asset table in assets/MANIFEST.md into id -> file (relative to assets/).
 * Rows with an empty file column are left out, so the registry uses the code primitive.
 */
export function parseManifest(markdown: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    const id = cells[1]?.match(/^`([^`]+)`$/)?.[1];
    const file = cells[3]?.replace(/`/g, "");
    if (id && file) files[id] = file;
  }
  return files;
}
