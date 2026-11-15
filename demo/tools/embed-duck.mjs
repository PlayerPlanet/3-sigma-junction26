// Writes duck-data.js from assets/models/microduck.glb so the lab page can load the model
// from file:// (no fetch). The .glb is the Microduck model, optimised with:
//   gltf-transform optimize Microduck_WRS.glb microduck.glb --texture-size 1024 --texture-compress webp --compress meshopt
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('..', import.meta.url);
const b64 = readFileSync(new URL('assets/models/microduck.glb', here)).toString('base64');
writeFileSync(new URL('duck-data.js', here), `window.DUCK_GLB="${b64}";\n`);
console.log('duck-data.js', (b64.length / 1e6).toFixed(1), 'MB');
