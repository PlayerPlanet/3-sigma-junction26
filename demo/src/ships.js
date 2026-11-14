// Ships for the reveal. Two sources:
//  1. Downloaded glTF models, if ships-data.js defines window.SHIP_MODELS (see demo/README.md).
//  2. Otherwise a procedural warship: lofted hull with sheer, flare and a raked bow,
//     tiered superstructure, raked funnels, tripod mast with a turning radar, twin-gun turrets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CELL = 10;
const models = {};

export async function loadShipModels() {
  const M = window.SHIP_MODELS;
  if (!M) return;
  for (const [cells, b64] of Object.entries(M)) {
    try {
      const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
      const gltf = await new GLTFLoader().parseAsync(buf, '');
      const obj = gltf.scene;
      // put the long axis on X, scale to the cells it covers, sit it at the waterline
      let box = new THREE.Box3().setFromObject(obj);
      let size = box.getSize(new THREE.Vector3());
      if (size.z > size.x) {
        obj.rotation.y = Math.PI / 2;
        box = new THREE.Box3().setFromObject(obj);
        size = box.getSize(new THREE.Vector3());
      }
      const wrap = new THREE.Group();
      wrap.add(obj);
      const k = (+cells * CELL * 0.86) / size.x;
      wrap.scale.setScalar(k);
      const c = box.getCenter(new THREE.Vector3());
      const waterline = window.SHIP_WATERLINE ?? 0.22; // share of the model's height under water
      obj.position.set(-c.x, -box.min.y - size.y * waterline, -c.z);
      wrap.traverse((o) => {
        if (o.isMesh) o.castShadow = o.receiveShadow = true;
        o.layers.enable(1);
      });
      models[cells] = wrap;
    } catch (e) {
      console.warn(`ship model for length ${cells} could not be read, using the built-in ship`, e);
    }
  }
}

const smooth = (x) => {
  x = Math.min(Math.max(x, 0), 1);
  return x * x * (3 - 2 * x);
};

function hull(L, B, D, draft) {
  const NS = 56;
  const pos = [], col = [], idx = [];
  const deckPos = [], deckIdx = [];
  const red = [0.30, 0.085, 0.07], black = [0.03, 0.035, 0.04], grey = [0.30, 0.33, 0.36];
  const RING = 15;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const x0 = -L / 2 + s * L;
    const bow = s > 0.52 ? 1 - Math.pow((s - 0.52) / 0.48, 1.75) : 1;
    const stern = 0.7 + 0.3 * smooth(s / 0.22);
    const b = Math.max((B / 2) * bow * stern, 0.03);
    const deckY = D + 1.5 * Math.pow(Math.max(0, (s - 0.58) / 0.42), 2);
    const flare = 0.1 * smooth((s - 0.55) / 0.4);
    const rake = 2.6 * smooth((s - 0.8) / 0.2);
    const keelUp = draft * 0.35 * smooth((0.12 - s) / 0.12); // slight stern counter
    const half = [
      [0, -draft + keelUp, red], [0.55 * b, -draft + keelUp, red], [0.92 * b, -draft * 0.45 + keelUp * 0.5, red],
      [0.975 * b, -0.08, red], [0.978 * b, -0.03, black], [0.985 * b, 0.42, black], [0.986 * b, 0.47, grey],
      [b * (1 + flare), deckY, grey],
    ];
    const ring = [...half.slice(1).reverse().map(([z, y, c]) => [-z, y, c]), ...half];
    for (const [z, y, c] of ring) {
      pos.push(x0 + rake * ((y + draft) / (deckY + draft)), y, z);
      col.push(...c);
    }
    const dx = x0 + rake;
    deckPos.push(dx, deckY, -b * (1 + flare), dx, deckY, b * (1 + flare));
    if (i < NS) {
      for (let j = 0; j < RING - 1; j++) {
        const a = i * RING + j, c2 = (i + 1) * RING + j;
        idx.push(a, c2, a + 1, a + 1, c2, c2 + 1);
      }
      const d = i * 2;
      deckIdx.push(d, d + 1, d + 2, d + 1, d + 3, d + 2);
    }
  }
  // transom: its own vertices, so it shades as one flat plate
  const c0 = pos.length / 3;
  for (let j = 0; j < RING; j++) {
    pos.push(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]);
    col.push(col[j * 3], col[j * 3 + 1], col[j * 3 + 2]);
  }
  pos.push(-L / 2, D * 0.4, 0);
  col.push(...grey);
  for (let j = 0; j < RING - 1; j++) idx.push(c0 + RING, c0 + j + 1, c0 + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  dg.setIndex(deckIdx);
  dg.computeVertexNormals();
  return [g, dg];
}

function procedural(cells) {
  const L = cells * CELL * 0.86;
  const B = Math.min(5.4, 3.0 + cells * 0.55), D = 2.5, draft = 1.7;
  const ship = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x626b72, roughness: 0.58, metalness: 0.3 });
  const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide, shadowSide: THREE.FrontSide });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x3e454b, roughness: 0.85, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.45, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1620, roughness: 0.08, metalness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const [hg, dg] = hull(L, B, D, draft);
  ship.add(new THREE.Mesh(hg, hullMat), new THREE.Mesh(dg, deckMat));
  const add = (geo, mat, x, y, z = 0, parent = ship) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (w, h, d, x, y, z = 0, mat = paint) => add(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z);
  const cyl = (r1, r2, h, x, y, z = 0, mat = paint, seg = 18) => add(new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y + h / 2, z);

  // superstructure, three tiers stepping up toward the bridge
  const sx = L * 0.02;
  const t1 = L * (cells >= 3 ? 0.36 : 0.3);
  box(t1, 2.0, B * 0.62, sx, D);
  box(t1 * 0.62, 1.9, B * 0.52, sx + t1 * 0.12, D + 2.0);
  const bx = sx + t1 * 0.3;
  box(t1 * 0.3, 1.9, B * 0.6, bx, D + 3.9);
  box(t1 * 0.3 + 0.16, 0.6, B * 0.6 + 0.16, bx, D + 4.75, 0, glass);              // bridge windows
  box(t1 * 0.34, 0.14, B * 0.92, bx - 0.2, D + 3.9);                   // bridge wings
  box(t1 * 0.2, 1.1, B * 0.36, bx - 0.4, D + 5.8);
  // portholes along the first tier
  for (let i = 0; i < Math.round(t1 / 1.6); i++)
    for (const side of [-1, 1])
      add(new THREE.CircleGeometry(0.16, 10), glass, sx - t1 / 2 + 0.9 + i * 1.6, D + 1.25, side * (B * 0.31 + 0.05)).rotation.y = side > 0 ? 0 : Math.PI;

  // tripod mast with yard, radar and a dome
  const mx = bx - 0.6, my = D + 6.9;
  cyl(0.12, 0.18, 7.5, mx, my);
  const strut = (p, q, r) => {
    const a = new THREE.Vector3(...p), b2 = new THREE.Vector3(...q);
    const m = add(new THREE.CylinderGeometry(r, r, a.distanceTo(b2), 10), paint, 0, 0);
    m.position.copy(a).add(b2).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b2.clone().sub(a).normalize());
  };
  for (const side of [-1, 1]) strut([mx - 1.9, my, side * 0.95], [mx - 0.05, my + 5.6, side * 0.08], 0.075);
  strut([mx, my + 5.4, -B * 0.42], [mx, my + 5.4, B * 0.42], 0.05);
  const radar = new THREE.Group();
  radar.position.set(mx, my + 7.7, 0);
  const dish = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 2.3), dark);
  dish.position.y = 0.6;
  radar.add(dish);
  ship.add(radar);
  add(new THREE.SphereGeometry(0.55, 16, 10), new THREE.MeshStandardMaterial({ color: 0xd9dcdc, roughness: 0.4 }), bx - 0.2, D + 7.2);

  // raked funnels with black caps
  const funnels = cells >= 4 ? [-0.06, -0.15] : [-0.1];
  for (const f of funnels) {
    const g = new THREE.Group();
    g.position.set(sx + L * f, D + 3.9, 0);
    g.rotation.z = 0.15;
    const fk = cells >= 4 ? 1 : cells === 3 ? 0.85 : 0.68;
    g.scale.set(fk, fk, 0.72 * fk);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 3.6, 20), paint);
    body.position.y = 1.8;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.97, 0.96, 0.7, 20), dark);
    cap.position.y = 3.6;
    g.add(body, cap);
    ship.add(g);
  }

  // twin-gun turrets
  const turret = (x, y, dir) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.45, 20), paint);
    base.position.y = 0.22;
    const house = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.25, 20), paint);
    house.position.y = 1.05;
    house.scale.set(1.25, 1, 0.95);
    g.add(base, house);
    for (const z of [-0.42, 0.42]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 4.4, 10), dark);
      b.rotation.z = -Math.PI / 2 + 0.12;
      b.position.set(3.0, 1.38, z);
      g.add(b);
    }
    ship.add(g);
  };
  turret(L * 0.3, D + 0.35, 1);
  if (cells >= 3) turret(-L * 0.34, D, -1);
  if (cells >= 4) {
    turret(L * 0.21, D + 1.5, 1);
    box(3.4, 1.2, B * 0.5, L * 0.21, D + 0.3);
  }

  // a breakwater and jackstaffs
  box(0.12, 0.7, B * 0.6, L * 0.39, D + 0.9);
  cyl(0.03, 0.03, 2.0, L * 0.47 + 2.2, D + 1.4);
  cyl(0.03, 0.03, 2.4, -L * 0.48, D);

  ship.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
    o.layers.enable(1);
  });
  ship.userData.tick = (t) => (radar.rotation.y = t * 1.6);
  return ship;
}

export function buildShip(cells) {
  if (models[cells]) return models[cells].clone();
  return procedural(cells);
}
