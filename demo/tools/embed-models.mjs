// Embeds downloaded ship models so the page can use them from file:// (no server).
//   demo/assets/ships/battleship.glb  -> the length-4 ship
//   demo/assets/ships/cruiser.glb     -> the length-3 ship
//   demo/assets/ships/destroyer.glb   -> the length-2 ship
// Any that are missing fall back to the built-in ship. Use .glb without Draco compression.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../assets/ships/', import.meta.url));
const out = fileURLToPath(new URL('../ships-data.js', import.meta.url));
const want = { 4: 'battleship.glb', 3: 'cruiser.glb', 2: 'destroyer.glb' };
const found = {};
for (const [cells, name] of Object.entries(want)) {
  if (!existsSync(dir + name)) continue;
  const buf = readFileSync(dir + name);
  found[cells] = buf.toString('base64');
  console.log(`${name}: ${(buf.length / 1e6).toFixed(1)} MB`);
}
const body = Object.keys(found).length ? JSON.stringify(found) : 'null';
writeFileSync(out, `// Written by tools/embed-models.mjs. null = built-in ships.\nwindow.SHIP_MODELS = ${body};\n`);
console.log(Object.keys(found).length ? `wrote ${out}` : 'no models found, built-in ships stay');
