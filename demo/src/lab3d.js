// A 3D lab for Bench Pressure. It only LOOKS at the game: every frame it reads the state that
// bench-pressure/index.html keeps (through window.__bp, a read-only accessor the wrapper adds)
// and draws a lab, a robot and the plates. Rules, timing, RNG and the recorded model runs
// stay in the game's own script.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BP = window.__bp;
const $ = (s) => document.querySelector(s);
const { T, FY, COLS, ROWS, MAP, TYPES } = BP;
const X0 = -COLS / 2, Z0 = -ROWS / 2;
const tileX = (c) => X0 + c + 0.5, tileZ = (r) => Z0 + r + 0.5;
const pxX = (x) => X0 + x / T, pxZ = (y) => Z0 + (y - FY) / T;
const TOP = 0.92; // worktop height
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const STRAIN = ['--s1', '--s2', '--s3', '--s4'].map((n) => new THREE.Color(css(n) || '#888'));
const STRAIN_CSS = ['--s1', '--s2', '--s3', '--s4'].map((n) => css(n) || '#888');
const small = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;

// ---------------------------------------------------------------- renderer and scene
const host = $('#lab');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.74;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.6));
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d5ce);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.42;

const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 120);
camera.position.set(0, 13.5, 13.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0.2);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3.2;
controls.maxDistance = 30;
controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
controls.minPolarAngle = THREE.MathUtils.degToRad(8);
controls.enablePan = true;
controls.screenSpacePanning = false;
controls.zoomSpeed = 0.9;

const sun = new THREE.DirectionalLight(0xfff1dc, 2.9);
sun.position.set(-7, 11, -9);
sun.castShadow = true;
sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 5;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5);
fill.position.set(8, 9, 10);
scene.add(fill);

const M = {
  floor: new THREE.MeshStandardMaterial({ color: 0x8b9195, roughness: 0.38, metalness: 0.0 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xdedbd3, roughness: 0.9 }),
  cab: new THREE.MeshStandardMaterial({ color: 0xd9dad8, roughness: 0.5 }),
  kick: new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.7 }),
  top: new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.28, metalness: 0.1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xc3c7ca, roughness: 0.28, metalness: 0.95 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.45, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xeaf4f6, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.28, envMapIntensity: 2.2, depthWrite: false }),
  screen: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.2, emissive: 0x1d4a66, emissiveIntensity: 0.9 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2a8db5, roughness: 0.45 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.8 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe9b30c, roughness: 0.5 }),
};
const shadow = (o, cast = true, recv = true) => {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = cast && !m.material.transparent;
      m.receiveShadow = recv;
    }
  });
  return o;
};
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};
const cyl = (r1, r2, h, mat, x = 0, y = 0, z = 0, seg = 28) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z);
  return m;
};
const rbox = (w, h, d, r, mat) => {
  const s = new THREE.Shape();
  const x = -w / 2, z = -d / 2;
  s.moveTo(x + r, z); s.lineTo(x + w - r, z); s.quadraticCurveTo(x + w, z, x + w, z + r);
  s.lineTo(x + w, z + d - r); s.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
  s.lineTo(x + r, z + d); s.quadraticCurveTo(x, z + d, x, z + d - r);
  s.lineTo(x, z + r); s.quadraticCurveTo(x, z, x + r, z);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  return new THREE.Mesh(g, mat);
};

// ---------------------------------------------------------------- room
function room() {
  const g = new THREE.Group();
  const W = COLS + 5, D = ROWS + 5;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);
  // polished floor: a faint true mirror of the room laid over the diffuse floor
  const sh = {
    uniforms: THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms),
    vertexShader: Reflector.ReflectorShader.vertexShader,
    fragmentShader: `
      uniform sampler2D tDiffuse; varying vec4 vUv;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec4 base = texture2DProj(tDiffuse, vUv);
        gl_FragColor = vec4(base.rgb, 0.2);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const mirror = new Reflector(new THREE.PlaneGeometry(W, D), { textureWidth: small ? 512 : 1024, textureHeight: small ? 512 : 1024, clipBias: 0.003, shader: sh });
  mirror.material.transparent = true;
  mirror.material.depthWrite = false;
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = 0.002;
  mirror.userData.noAO = true;
  g.add(mirror);
  // walls: back wall with a long window band, two side walls
  const H = 3.4, zb = -D / 2, xs = W / 2;
  g.add(box(W, 1.15, 0.2, M.wall, 0, 0.575, zb));
  g.add(box(W, 0.7, 0.2, M.wall, 0, H - 0.35, zb));
  for (let i = -3; i <= 3; i++) g.add(box(0.14, H, 0.24, M.wall, (i * W) / 6.4, H / 2, zb));
  const skyC = document.createElement('canvas');
  skyC.width = 8; skyC.height = 128;
  const c2 = skyC.getContext('2d');
  const gr = c2.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#9fc3ea'); gr.addColorStop(0.7, '#e6eef6'); gr.addColorStop(1, '#f6f1e6');
  c2.fillStyle = gr; c2.fillRect(0, 0, 8, 128);
  const skyT = new THREE.CanvasTexture(skyC);
  skyT.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.6), new THREE.MeshBasicMaterial({ map: skyT, toneMapped: false }));
  sky.position.set(0, 1.95, zb - 0.3);
  g.add(sky);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.55), M.glass);
  pane.position.set(0, 1.93, zb);
  g.add(pane);
  for (const sx of [-1, 1]) g.add(box(0.2, H, D, M.wall, sx * xs, H / 2, 0));
  return shadow(g, false, true);
}

// which way a wall tile faces: toward the nearest walkable tile
function facing(c, r) {
  for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const row = MAP[r + dr];
    if (row && row[c + dc] === '.') return Math.atan2(dc, dr);
  }
  return 0;
}

function counter(lowTop = true) {
  const g = new THREE.Group();
  g.add(box(1, 0.76, 0.96, M.cab, 0, 0.5, -0.02));
  g.add(box(0.98, 0.12, 0.86, M.kick, 0, 0.06, -0.05));
  if (lowTop) g.add(box(1.0, 0.05, 1.0, M.top, 0, TOP - 0.025, 0));
  g.add(box(0.5, 0.018, 0.018, M.steel, 0, 0.78, 0.475));
  return g;
}

// ---------------------------------------------------------------- equipment
const EQUIP = {
  rack(s) {
    const g = new THREE.Group();
    for (const x of [-0.3, 0.3]) for (const z of [-0.22, 0.22]) g.add(cyl(0.012, 0.012, 0.42, M.steel, x, 0.21, z, 8));
    for (const y of [0.02, 0.4]) g.add(box(0.66, 0.012, 0.5, M.steel, 0, y, 0));
    s.dyn.stack = new THREE.Group();
    g.add(s.dyn.stack);
    return g;
  },
  freezer(s) {
    const g = new THREE.Group();
    g.add(rbox(0.86, 1.0, 0.8, 0.05, M.white));
    const door = box(0.8, 0.9, 0.03, M.white, 0, 0.5, 0.41);
    g.add(door, box(0.03, 0.5, 0.04, M.steel, 0.32, 0.5, 0.44));
    const scr = box(0.26, 0.11, 0.012, M.screen.clone(), -0.2, 0.84, 0.43);
    s.dyn.screen = scr.material;
    g.add(scr);
    s.dyn.itemAt = [0, 1.02, 0];
    return g;
  },
  bench(s) {
    const g = new THREE.Group();
    g.add(box(0.5, 0.012, 0.34, M.white, -0.12, 0.006, 0.05));          // work mat
    const stand = new THREE.Group();
    stand.add(cyl(0.09, 0.1, 0.02, M.dark, 0, 0.01, 0), cyl(0.012, 0.012, 0.36, M.steel, 0, 0.19, 0, 10));
    for (let i = 0; i < 3; i++) {
      const p = cyl(0.016, 0.006, 0.2, i === 1 ? M.blue : M.white, Math.cos(i * 2.1) * 0.06, 0.24, Math.sin(i * 2.1) * 0.06, 10);
      p.rotation.z = 0.25;
      stand.add(p);
    }
    stand.position.set(0.32, 0, -0.25);
    g.add(stand);
    const tubes = new THREE.Group();
    tubes.add(box(0.26, 0.05, 0.1, M.dark, 0, 0.025, 0));
    for (let i = 0; i < 5; i++) tubes.add(cyl(0.014, 0.014, 0.1, M.glass, -0.1 + i * 0.05, 0.08, 0, 10));
    tubes.position.set(-0.22, 0, -0.32);
    g.add(tubes);
    s.dyn.itemAt = [-0.12, 0.02, 0.05];
    return g;
  },
  incubator(s) {
    const g = new THREE.Group();
    const shell = rbox(0.88, 0.62, 0.8, 0.04, M.steel);
    g.add(shell);
    g.add(box(0.7, 0.44, 0.02, M.dark, 0, 0.33, 0.39));
    const glow = box(0.66, 0.4, 0.012, new THREE.MeshStandardMaterial({ color: 0x120a04, emissive: 0xff8a2a, emissiveIntensity: 0.15, roughness: 0.3 }), 0, 0.33, 0.402);
    s.dyn.glow = glow.material;
    g.add(glow);
    const door = box(0.7, 0.44, 0.012, M.glass, 0, 0.33, 0.415);
    g.add(door, box(0.02, 0.3, 0.03, M.steel, 0.3, 0.33, 0.43));
    s.dyn.itemAt = [0, 0.2, 0.3];
    s.dyn.itemScale = 0.8;
    return g;
  },
  reader(s) {
    const g = new THREE.Group();
    g.add(rbox(0.8, 0.3, 0.7, 0.05, M.white));
    g.add(box(0.5, 0.02, 0.34, M.dark, 0, 0.1, 0.36));                     // tray
    const scr = box(0.3, 0.12, 0.012, M.screen.clone(), -0.18, 0.24, 0.352);
    scr.rotation.x = -0.35;
    s.dyn.screen = scr.material;
    g.add(scr);
    const beam = box(0.44, 0.01, 0.02, new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0, toneMapped: false }), 0, 0.125, 0.36);
    s.dyn.beam = beam;
    g.add(beam);
    s.dyn.itemAt = [0, 0.115, 0.38];
    return g;
  },
  autoclave(s) {
    const g = new THREE.Group();
    const body = cyl(0.36, 0.36, 0.8, M.steel, 0, 0.38, -0.02, 40);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    g.add(box(0.8, 0.06, 0.8, M.dark, 0, 0.03, 0));
    const door = cyl(0.33, 0.33, 0.05, M.steel, 0, 0.38, 0.4, 40);
    door.rotation.x = Math.PI / 2;
    g.add(door);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 10, 32), M.dark);
    wheel.position.set(0, 0.38, 0.45);
    s.dyn.wheel = wheel;
    g.add(wheel);
    s.dyn.itemAt = [0, 0.78, 0.1];
    return g;
  },
  bin() {
    const g = new THREE.Group();
    g.add(cyl(0.26, 0.21, 0.42, M.yellow, 0, 0.21, 0, 28), cyl(0.27, 0.27, 0.03, M.dark, 0, 0.435, 0, 28));
    return g;
  },
  desk(s) {
    const g = new THREE.Group();
    const scr = box(0.56, 0.34, 0.02, M.screen.clone(), 0, 0.3, -0.28);
    s.dyn.screen = scr.material;
    g.add(scr, box(0.04, 0.12, 0.04, M.dark, 0, 0.06, -0.3), box(0.2, 0.012, 0.12, M.dark, 0, 0.006, -0.3));
    g.add(box(0.4, 0.014, 0.13, M.dark, -0.05, 0.007, 0.02));
    s.dyn.itemAt = [0.05, 0.02, 0.28];
    return g;
  },
  hatch(s) {
    const g = new THREE.Group();
    g.add(rbox(0.8, 0.5, 0.5, 0.04, M.dark));
    const slot = box(0.5, 0.05, 0.02, new THREE.MeshBasicMaterial({ color: 0x2a8db5, toneMapped: false }), 0, 0.3, 0.255);
    s.dyn.slot = slot.material;
    g.add(slot, box(0.56, 0.01, 0.22, M.steel, 0, 0.2, 0.33));
    return g;
  },
  counter(s) {
    s.dyn.itemAt = [0, 0.01, 0];
    return new THREE.Group();
  },
};

// ---------------------------------------------------------------- plates and papers
const dishGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.035, 36);
const agarGeo = new THREE.CylinderGeometry(0.185, 0.185, 0.02, 36);
const lidGeo = new THREE.CylinderGeometry(0.205, 0.205, 0.012, 36, 1, true);
const dotGeo = new THREE.SphereGeometry(0.013, 8, 6);
function plateMesh(it) {
  const g = new THREE.Group();
  const slot = it.tk != null ? (BP.ticketById(it.tk)?.slot ?? -1) : -1;
  const col = slot >= 0 ? STRAIN[slot] : null;
  const dish = new THREE.Mesh(dishGeo, M.glass);
  dish.position.y = 0.0175;
  g.add(dish);
  const agarCol = { clean: 0xf4ecc8, inoc: 0xf0e3b0, prep: 0xeedd9c, grown: 0xead894, contam: 0x5f6a2e, dirty: 0xb6ad9b }[it.st] ?? 0xf0e3b0;
  const agar = new THREE.Mesh(agarGeo, new THREE.MeshStandardMaterial({ color: agarCol, roughness: 0.35 }));
  agar.position.y = 0.014;
  g.add(agar);
  if (col) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, emissive: col, emissiveIntensity: 0.25 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.036;
    g.add(ring);
  }
  if (it.st === 'grown' || it.st === 'contam' || it.st === 'dirty') {
    const mat = new THREE.MeshStandardMaterial({ color: it.st === 'contam' ? 0x1f2a12 : it.st === 'dirty' ? 0x8d8571 : 0xfffdf2, roughness: 0.6 });
    let a = 1.3;
    const n = it.st === 'contam' ? 46 : 26;
    for (let i = 0; i < n; i++) {
      a = (a * 7.13 + 0.37) % 1;
      const rr = 0.16 * Math.sqrt((i + 0.5) / n), th = i * 2.399 + a;
      const d = new THREE.Mesh(dotGeo, mat);
      d.scale.setScalar(it.st === 'contam' ? 1.6 + a : 0.7 + a);
      d.position.set(Math.cos(th) * rr, 0.027, Math.sin(th) * rr);
      g.add(d);
    }
  }
  const lid = new THREE.Mesh(lidGeo, M.glass);
  lid.position.y = 0.034;
  g.add(lid);
  return shadow(g);
}
function paperMesh(it) {
  const g = new THREE.Group();
  const slot = BP.ticketById(it.tk)?.slot ?? -1;
  g.add(box(0.26, 0.006, 0.36, M.paper, 0, 0.004, 0));
  for (let i = 0; i < 5; i++) g.add(box(0.18, 0.002, 0.012, M.dark, 0, 0.008, -0.11 + i * 0.045));
  if (slot >= 0) g.add(box(0.26, 0.004, 0.05, new THREE.MeshStandardMaterial({ color: STRAIN[slot], roughness: 0.6 }), 0, 0.009, -0.155));
  return shadow(g);
}
const sig = (it) => (!it ? '' : it.kind === 'paper' ? `p${it.tk}` : `${it.st}|${it.tk}|${it.exp}`);
function syncItem(holder, it) {
  const s = sig(it);
  if (holder.userData.sig === s) return;
  holder.userData.sig = s;
  holder.clear();
  if (it) holder.add(it.kind === 'paper' ? paperMesh(it) : plateMesh(it));
}

// ---------------------------------------------------------------- the robot (an original design)
function robot(colour) {
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.4, emissive: colour, emissiveIntensity: 0.5 });
  const shell = new THREE.MeshStandardMaterial({ color: 0xf2f1ed, roughness: 0.32, metalness: 0.05 });
  // drive base: a low rounded puck on hidden wheels, with a light band
  const base = cyl(0.3, 0.33, 0.16, M.dark, 0, 0.11, 0, 40);
  const skirt = cyl(0.335, 0.335, 0.03, accent, 0, 0.19, 0, 40);
  const deck = cyl(0.29, 0.3, 0.06, shell, 0, 0.23, 0, 40);
  g.add(base, skirt, deck);
  for (const sx of [-1, 1]) {
    const w = cyl(0.07, 0.07, 0.05, M.rubber, sx * 0.26, 0.07, 0, 20);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  // body: a tapered column
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.32, 8, 24), shell);
  body.position.y = 0.6;
  g.add(body);
  const belt = cyl(0.176, 0.176, 0.03, M.dark, 0, 0.5, 0, 32);
  g.add(belt);
  // head: a rounded pod with one wide visor
  const head = new THREE.Group();
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.19, 32, 20), shell);
  pod.scale.set(1.12, 0.82, 1);
  head.add(pod);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 20), new THREE.MeshStandardMaterial({ color: 0x06080a, roughness: 0.12, metalness: 0.6 }));
  visor.scale.set(1.0, 0.52, 0.8);
  visor.position.set(0, 0.0, 0.065);
  head.add(visor);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 10, 28), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
  eye.position.set(0, 0.0, 0.202);
  head.add(eye);
  const ant = cyl(0.006, 0.006, 0.16, M.steel, 0.1, 0.2, -0.04, 8);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), accent);
  tip.position.set(0.1, 0.29, -0.04);
  head.add(ant, tip);
  head.position.y = 1.02;
  g.add(head);
  // one arm with a flat tray hand
  const arm = new THREE.Group();
  const upper = cyl(0.035, 0.035, 0.3, M.dark, 0, -0.15, 0, 14);
  const fore = new THREE.Group();
  const f1 = cyl(0.03, 0.03, 0.3, shell, 0, 0, 0.15, 14);
  f1.rotation.x = Math.PI / 2;
  const tray = cyl(0.21, 0.21, 0.014, M.steel, 0, 0.0, 0.42, 30);
  const holder = new THREE.Group();
  holder.position.set(0, 0.012, 0.42);
  fore.add(f1, tray, holder);
  fore.position.y = -0.3;
  arm.add(cyl(0.05, 0.05, 0.08, M.dark, 0, 0, 0, 16), upper, fore);
  arm.position.set(0.2, 0.78, 0.02);
  g.add(arm);
  shadow(g);
  return { g, head, eye, arm, fore, holder, accent, sx: 0, sz: 0, yaw: 0, t: 0 };
}

// ---------------------------------------------------------------- build the lab from the game's map
scene.add(room());
const stations = new Map();
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const ch = MAP[r][c];
  if (ch === '.') continue;
  const type = TYPES[ch];
  const s = { type, c, r, dyn: {}, yaw: facing(c, r) };
  const tile = new THREE.Group();
  tile.position.set(tileX(c), 0, tileZ(r));
  tile.rotation.y = s.yaw;
  const tall = type === 'freezer';
  tile.add(counter(!tall && type !== 'bin'));
  const eq = EQUIP[type](s);
  eq.position.y = type === 'bin' ? TOP - 0.05 : tall ? TOP - 0.05 : TOP;
  tile.add(eq);
  s.holder = new THREE.Group();
  const at = s.dyn.itemAt || [0, 0.01, 0];
  s.holder.position.set(at[0], eq.position.y + at[1], at[2]);
  s.holder.scale.setScalar(s.dyn.itemScale || 1);
  tile.add(s.holder);
  // progress ring above the station
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 40, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: 0x2a8db5, side: THREE.DoubleSide, toneMapped: false, depthTest: false, transparent: true }));
  ring.position.y = tall ? 2.25 : 1.75;
  ring.renderOrder = 10;
  ring.visible = false;
  s.ring = ring;
  tile.add(ring);
  shadow(tile);
  s.tile = tile;
  scene.add(tile);
  stations.set(c + ',' + r, s);
}
const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), new THREE.MeshBasicMaterial({ color: 0x2a8db5, transparent: true, opacity: 0.85, toneMapped: false, side: THREE.DoubleSide }));
targetRing.rotation.x = -Math.PI / 2;
targetRing.visible = false;
scene.add(targetRing);

// goggles guide: a bobbing marker over the device the guide would go to next, and a line to it
const guide = new THREE.Group();
{
  const m = new THREE.MeshBasicMaterial({ color: 0x2a8db5, toneMapped: false });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), m);
  cone.rotation.x = Math.PI;
  guide.add(cone);
  guide.visible = false;
  scene.add(guide);
}
const guideLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0x2a8db5, dashSize: 0.18, gapSize: 0.12, toneMapped: false }));
guideLine.visible = false;
guideLine.frustumCulled = false;
scene.add(guideLine);

const robots = [robot(new THREE.Color(css('--p2') || '#2a8db5')), robot(new THREE.Color(0x2f6fb3))];
robots.forEach((b) => {
  b.g.visible = false;
  scene.add(b.g);
});

// ---------------------------------------------------------------- the Microduck (rigged model)
// The clip that ships with the model is one 10 s take at 24 fps: it stands and looks around,
// walks four steps, then sits down. We cut a standing loop and one full stride out of it and
// drop the root's forward travel, so the game decides where the duck is and the clip only
// moves the legs. If the model is missing or fails to load, the drawn robot above stays.
const DUCK_TOP = 1.115, DUCK_FWD = 0.12; // plate rest height and how far ahead of the neck
const DUCK_SCALE = 4.2; // 0.26 m tall in the file, about 1.1 lab units here
function ringFor(colour) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 48), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  return m;
}
function adoptDuck(b, model, clip, colour) {
  const noTravel = (c) => {
    c.tracks = c.tracks.filter((t) => !/^root\.(position|scale)$/.test(t.name));
    return c;
  };
  const idle = noTravel(THREE.AnimationUtils.subclip(clip, 'idle', 1, 72, 24));
  const walk = noTravel(THREE.AnimationUtils.subclip(clip, 'walk', 106, 154, 24));
  const pivot = new THREE.Group();
  pivot.rotation.y = -Math.PI / 2; // the model faces +x, the game's robots face +z
  pivot.scale.setScalar(DUCK_SCALE);
  pivot.add(model);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // skinned bounds are the rest pose
  });
  const mixer = new THREE.AnimationMixer(model);
  const aIdle = mixer.clipAction(idle), aWalk = mixer.clipAction(walk);
  aIdle.setLoop(THREE.LoopPingPong, Infinity).play();
  aWalk.play();
  aWalk.setEffectiveWeight(0);
  const holder = new THREE.Group();
  b.g.clear();
  b.g.add(pivot, holder, ringFor(colour));
  Object.assign(b, { duck: true, mixer, aIdle, aWalk, w: 0, v: 0, px: b.sx, pz: b.sz, holder, headBone: model.getObjectByName('head_roll') || model.getObjectByName('head_pitch'), pivot });
}
if (window.DUCK_GLB) {
  try {
    const bytes = Uint8Array.from(atob(window.DUCK_GLB), (c) => c.charCodeAt(0));
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.parse(bytes.buffer, '', (gltf) => {
      try {
        const clip = gltf.animations[0];
        const cols = [new THREE.Color(css('--p2') || '#2a8db5'), new THREE.Color(0xf4f2ed)];
        robots.forEach((b, i) => adoptDuck(b, i === 0 ? gltf.scene : cloneSkinned(gltf.scene), clip, cols[i]));
        window.__duck = true;
      } catch (e) { console.warn('duck setup failed, keeping the drawn robot', e); }
    }, (e) => console.warn('duck load failed, keeping the drawn robot', e));
  } catch (e) { console.warn('duck decode failed, keeping the drawn robot', e); }
}

// ---------------------------------------------------------------- post-processing
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: small ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
try {
  gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: small ? 8 : 14 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(gtao);
} catch (e) {
  console.warn('ambient occlusion unavailable', e);
}
composer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), 0.14, 0.6, 1.6));
composer.addPass(new OutputPass());

function resize() {
  const w = host.clientWidth || 1, h = host.clientHeight || 1;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // keep the whole lab in frame at the default zoom on narrow screens
  if (!userMoved) {
    const d = Math.max(19, 17.5 / Math.min(camera.aspect, 1.6) * 1.55);
    camera.position.set(0, d * 0.72, d * 0.7);
    controls.update();
  }
}
let userMoved = false;
controls.addEventListener('start', () => {
  userMoved = true;
  follow = false;
  $('#camFollow').setAttribute('aria-pressed', 'false');
});
new ResizeObserver(resize).observe(host);

// ---------------------------------------------------------------- camera buttons
let follow = false;
const dolly = (k) => {
  userMoved = true;
  const v = camera.position.clone().sub(controls.target);
  v.setLength(THREE.MathUtils.clamp(v.length() * k, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(v);
};
$('#camIn').addEventListener('click', () => dolly(0.75));
$('#camOut').addEventListener('click', () => dolly(1.33));
$('#camAll').addEventListener('click', () => {
  follow = false;
  userMoved = false;
  $('#camFollow').setAttribute('aria-pressed', 'false');
  controls.target.set(0, 0.6, 0.2);
  resize();
});
$('#camFollow').addEventListener('click', (e) => {
  follow = !follow;
  e.currentTarget.setAttribute('aria-pressed', String(follow));
  if (follow) {
    userMoved = true;
    // look down steeply enough that the island bench never hides the robot
    camera.position.copy(controls.target).add(new THREE.Vector3(0, 0.82, 0.57).setLength(7.5));
  }
});

// ---------------------------------------------------------------- HUD
const QUESTION = { gene: 'Which gene is the culprit?', dose: 'Which dose is enough?' };
const el = { cards: $('#cards'), score: $('#hScore'), time: $('#hTime'), say: $('#say'), why: $('#why'), toasts: $('#toasts'), start: $('#start'), end: $('#endCard'), endLine: $('#endLine'), speed: $('#speed'), paused: $('#paused') };
let cardSig = '';
function cards(G) {
  const ts = BP.activeTickets();
  const s = ts.map((t) => t.id + ':' + t.labels.length).join('|');
  if (s !== cardSig) {
    cardSig = s;
    el.cards.innerHTML = ts.map((t) => `
      <article class="q" data-id="${t.id}" style="--c:${STRAIN_CSS[t.slot]}">
        <header><i></i><h3>${QUESTION[t.type]}</h3><time></time></header>
        <div class="bars">${t.labels.map((l) => `<div><u></u><span>${l}</span></div>`).join('')}</div>
        <p class="guess"></p>
      </article>`).join('');
  }
  for (const t of ts) {
    const a = el.cards.querySelector(`[data-id="${t.id}"]`);
    if (!a) continue;
    const best = t.post.indexOf(Math.max(...t.post));
    const bars = a.querySelectorAll('.bars > div');
    t.shown.forEach((p, i) => {
      bars[i].firstElementChild.style.height = `${Math.max(3, p * 100)}%`;
      bars[i].classList.toggle('lead', i === best);
    });
    a.querySelector('time').textContent = `${Math.max(0, Math.ceil(t.timeLeft))} s`;
    a.classList.toggle('late', t.timeLeft < 20);
    a.querySelector('.guess').textContent = `Best guess: ${t.labels[best]}${t.type === 'dose' ? ' µM' : ''}, ${Math.round(t.post[best] * 100)}% sure`;
  }
}
// ---------------------------------------------------------------- what you can do here (human play)
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PLATE = { clean: 'clean plate', inoc: 'inoculated plate', prep: 'prepared plate', grown: 'grown plate', contam: 'contaminated plate', dirty: 'used plate' };
const itemName = (it) => (it.kind === 'paper' ? 'paper' : PLATE[it.st] || 'plate');
const PURPOSE = {
  counter: 'A spare worktop. Park anything here.',
  rack: 'Clean plates start here.',
  freezer: 'Puts a question\'s strain on a clean plate.',
  bench: 'Choose which experiment the plate will run.',
  incubator: 'Grows a prepared plate in 6 s. Leave it too long and it contaminates.',
  reader: 'Reads a grown plate. This is where you learn something.',
  autoclave: 'Washes used plates so the rack refills.',
  bin: 'For contaminated plates and bad drafts.',
  desk: 'Write up your best answer to a question.',
  hatch: 'Submit a paper. Right: points. Wrong: retraction.',
};
const qName = (t) => `${QUESTION[t.type]}`;
const unit = (t) => (t.type === 'dose' ? ' µM' : '');
const eigsOf = (t) => t.exps.map((x) => BP.Bayes.eig(t.post, x.lik));
const argmax = (a) => a.indexOf(Math.max(...a));
const lc = (x) => x.charAt(0).toLowerCase() + x.slice(1); // gene names keep their capitals

// Each entry: [key label or '', text]. Mirrors the game's own pick/tap/work rules, read-only.
function actionsAt(s, h) {
  const A = [];
  const tl = BP.activeTickets();
  const it = s.item;
  if (!h) {
    if (it) A.push(['Space', `Pick up the ${itemName(it)}`]);
    else if (s.type === 'rack') A.push(s.count > 0 ? ['Space', `Take a clean plate (${s.count} left)`] : ['', 'Empty. Wash used plates in the autoclave.']);
  } else if (s.type === 'bin') {
    if (h.kind === 'paper') A.push(['Space', 'Shred the draft']);
    else if (h.st !== 'clean' && h.st !== 'dirty') A.push(['Space', 'Bin what is on the plate (it then needs washing)']);
  } else if (s.type === 'hatch') {
    A.push(h.kind === 'paper' ? ['Space', 'Submit the paper'] : ['', 'The journal takes papers, not plates.']);
  } else if (s.type === 'rack') {
    A.push(h.kind === 'plate' && h.st === 'clean' ? ['Space', 'Put the clean plate back'] : ['', BP.REFUSE.rack + '.']);
  } else if (!it) {
    A.push(BP.accepts(s, h) ? ['Space', `Put the ${itemName(h)} down here`] : ['', (BP.REFUSE[s.type] || 'That does not go here') + '.']);
  }
  if (s.type === 'freezer' && it && it.st === 'clean' && tl.length) {
    const t = tl[s.sel % tl.length];
    if (tl.length > 1) A.push(['tap F', 'Switch question']);
    A.push(['hold F', `Inoculate for: ${qName(t)}`, t]);
  } else if (s.type === 'bench' && it && it.kind === 'plate' && (it.st === 'inoc' || it.st === 'prep')) {
    const t = BP.plateTicket(it);
    if (t) {
      const i = s.sel % t.exps.length;
      A.push(['tap F', `Next experiment (${i + 1} of ${t.exps.length})`]);
      if (it.st === 'inoc' || it.exp !== i) A.push(['hold F', `Prepare: ${t.exps[i].long}`, t]);
      else A.push(['', `Prepared: ${t.exps[i].long}`, t]);
    }
  } else if (s.type === 'incubator' && it && it.kind === 'plate') {
    if (it.st === 'prep') A.push(['', `Growing. Ready in ${((1 - it.grow) * BP.GROW).toFixed(0)} s.`]);
    else if (it.st === 'grown') A.push(['', 'Ready. Take it to the reader before it contaminates.']);
  } else if (s.type === 'reader' && it && it.kind === 'plate' && it.st === 'grown') {
    A.push(['hold F', 'Read the plate']);
  } else if (s.type === 'autoclave' && it && it.kind === 'plate' && it.st === 'dirty') {
    A.push(['hold F', 'Wash the plate']);
  } else if (s.type === 'desk' && !it && tl.length) {
    const t = tl[s.sel % tl.length], m = argmax(t.post);
    if (tl.length > 1) A.push(['tap F', 'Switch question']);
    A.push(['hold F', `Write the paper for: ${qName(t)} Answer ${t.labels[m]}${unit(t)}, ${Math.round(t.post[m] * 100)}% sure`, t]);
  }
  return A;
}

// The goggles guide: a simple greedy rule, not a proven optimum. Work on the most urgent question
// that is under 80% sure, always run the experiment with the highest expected information gain,
// publish once a question is 80% sure or has under 25 s left, and never leave a plate to spoil.
const SURE = 0.8, LATE = 25;
function advise(G, p) {
  const tl = BP.activeTickets();
  const S = [...G.stations.values()];
  const near = (pred) => {
    let best = null, bd = 1e9;
    for (const s of S) {
      if (!pred(s)) continue;
      const d = Math.hypot(s.c * T + T / 2 - p.x, FY + s.r * T + T / 2 - p.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  const type = (ty, free) => near((s) => s.type === ty && (!free || !s.item));
  const conf = (t) => Math.max(...t.post);
  const byTime = (a, b) => a.timeLeft - b.timeLeft;
  const ready = tl.filter((t) => conf(t) >= SURE || t.timeLeft < LATE).sort(byTime)[0];
  const study = tl.filter((t) => conf(t) < SURE && t.timeLeft >= LATE).sort(byTime)[0];
  const best = (t) => { const e = eigsOf(t), i = argmax(e); return { i, bits: e[i], exp: t.exps[i] }; };
  const out = (s, text, t) => ({ s, text, t });
  const h = p.held;
  if (h) {
    if (h.kind === 'paper') return out(type('hatch'), 'Submit the paper at the journal hatch.');
    const t = BP.plateTicket(h);
    if (h.st === 'clean') return study ? out(type('freezer', true), `Freezer: inoculate for “${qName(study)}”`, study) : out(type('rack'), 'Nothing left to test. Put the plate back on the rack.');
    if (h.st === 'inoc') { if (!t) return out(type('bin'), 'That question closed. Bin the plate.'); const b = best(t); return out(type('bench', true), `Design bench: ${lc(b.exp.long)} gives the most, ${b.bits.toFixed(2)} bits.`, t); }
    if (h.st === 'prep') return out(type('incubator', true), 'Put it in a free incubator.', t);
    if (h.st === 'grown') return out(type('reader', true), 'Read it at the plate reader.', t);
    if (h.st === 'contam') return out(type('bin'), 'Contaminated. Bin it.');
    return out(type('autoclave', true) || type('counter', true), 'Used plate: wash it in the autoclave.');
  }
  const has = (ty, f) => near((s) => s.type === ty && s.item && f(s.item, s));
  let s;
  if ((s = has('incubator', (i) => i.st === 'contam'))) return out(s, 'A plate contaminated. Take it to the bin.');
  if ((s = has('incubator', (i) => i.st === 'grown'))) return out(s, 'A plate is grown. Take it to the reader now.');
  if ((s = has('reader', (i) => i.st === 'grown'))) return out(s, 'Hold F to read the plate.');
  if ((s = has('desk', (i) => i.kind === 'paper'))) return out(s, 'Pick up the paper and submit it.');
  if ((s = has('freezer', (i) => i.st === 'clean')) && study) {
    const cur = tl[s.sel % tl.length];
    return out(s, cur === study ? `Hold F to inoculate for “${qName(study)}”` : `Tap F to switch to “${qName(study)}”, then hold F.`, study);
  }
  if ((s = has('freezer', (i) => i.st === 'inoc'))) return out(s, 'Pick up the plate and take it to the design bench.');
  if ((s = has('bench', (i) => i.st === 'inoc' || i.st === 'prep'))) {
    const t = BP.plateTicket(s.item);
    if (t) {
      const b = best(t), cur = s.sel % t.exps.length;
      if (s.item.st === 'prep' && s.item.exp === b.i) return out(s, 'Prepared. Pick it up and take it to an incubator.', t);
      return out(s, cur === b.i ? `Hold F to prepare: ${lc(b.exp.long)} (${b.bits.toFixed(2)} bits, the most on offer).` : `Tap F until you reach: ${lc(b.exp.long)} (${b.bits.toFixed(2)} bits, the most on offer).`, t);
    }
  }
  if ((s = has('autoclave', (i) => i.st === 'dirty'))) return out(s, 'Hold F to wash the plate.');
  if (ready && (s = type('desk', true))) {
    const cur = tl[s.sel % tl.length], m = argmax(ready.post);
    const why = conf(ready) >= SURE ? `${Math.round(conf(ready) * 100)}% sure` : 'nearly out of time';
    return out(s, cur === ready ? `Writing desk: hold F to write up ${ready.labels[m]}${unit(ready)} (${why}).` : `Writing desk: tap F to switch question, then write up ${ready.labels[m]}${unit(ready)} (${why}).`, ready);
  }
  if ((s = near((x) => x.item && x.item.kind === 'plate' && x.item.st === 'dirty' && x.type !== 'autoclave'))) return out(s, 'Pick up the used plate and wash it.');
  if (study) {
    s = near((x) => x.type === 'rack' && x.count > 0);
    if (s) return out(s, `Take a clean plate for “${qName(study)}”`, study);
  }
  return out(null, 'Nothing to do until a plate grows or a new question arrives.');
}

const act = { box: $('#act'), name: $('#actName'), info: $('#actInfo'), list: $('#actList'), guide: $('#actGuide'), btn: $('#btnGoggles'), sig: '', target: null };
act.btn?.addEventListener('click', (e) => { document.getElementById('gogglesBtn').click(); e.currentTarget.blur(); });
function actions(G, st) {
  const human = !BP.auto && (st === 'play' || st === 'pause') && !!G.players[0];
  act.box.hidden = !human;
  act.btn.hidden = !human;
  document.body.classList.toggle('human', human);
  act.target = null;
  if (!human) return;
  const p = G.players[0], on = BP.goggles;
  const s = G.stations.get(BP.targetKey(p));
  const A = s ? actionsAt(s, p.held) : [];
  const adv = on ? advise(G, p) : null;
  act.target = adv && adv.s;
  let extra = '';
  if (on && s && s.type === 'bench' && s.item && BP.plateTicket(s.item)) {
    const t = BP.plateTicket(s.item), e = eigsOf(t), b = argmax(e), cur = s.sel % t.exps.length, mx = Math.max(e[b], 1e-6);
    extra = `<div class="eig">${t.exps.map((x, i) => `<span class="${i === cur ? 'cur' : ''} ${i === b ? 'best' : ''}" title="${esc(x.long)}: ${e[i].toFixed(2)} bits"><u style="height:${Math.round((e[i] / mx) * 100)}%"></u><b>${esc(x.label)}</b></span>`).join('')}</div>`;
  }
  const name = s ? BP.NAMES[s.type] : p.held ? `Carrying a ${itemName(p.held)}` : 'Walk up to a device';
  const info = s ? PURPOSE[s.type] : 'WASD or arrows to move. Space picks up and puts down. F uses a device: tap to choose, hold to work.';
  const html = A.map(([k, text, t]) => `<li${t ? ` style="--c:${STRAIN_CSS[t.slot]}"` : ''}>${k ? `<kbd>${k}</kbd>` : ''}<span>${esc(text)}</span></li>`).join('') + extra;
  const g = adv ? adv.text : '';
  const sig = [name, info, html, g, on].join('|');
  if (sig === act.sig) return;
  act.sig = sig;
  act.name.textContent = name;
  act.info.textContent = info;
  act.list.innerHTML = html;
  act.guide.hidden = !on;
  act.guide.innerHTML = on ? `<b>Goggles</b><span>${esc(g)}</span>` : '';
  act.guide.style.setProperty('--c', adv && adv.t ? STRAIN_CSS[adv.t.slot] : 'var(--accent, #2a8db5)');
  act.btn.setAttribute('aria-pressed', String(on));
  act.btn.textContent = on ? 'Goggles on (G)' : 'Bayes goggles (G)';
}

let sayN = -1;
function narrate() {
  const auto = BP.auto;
  if (!auto) {
    if (sayN !== -2) {
      sayN = -2;
      el.say.textContent = 'You are the robot. Bring a plate round the lab, read it, publish your best answer.';
      el.why.textContent = 'WASD or arrows to move · Space to pick up or put down · F to use (tap to choose, hold to work) · Esc to pause';
    }
    return;
  }
  const log = auto.bot.log;
  if (!log.length || sayN === log.length) return;
  sayN = log.length;
  const rec = log[log.length - 1];
  const t = BP.ticketById(rec.tk);
  let line;
  if (rec.a === 'wait') line = 'Waiting for plates to grow';
  else if (rec.a === 'publish') line = t ? `Publishing an answer: ${t.labels[rec.claim]}${t.type === 'dose' ? ' µM' : ''}` : 'Publishing an answer';
  else line = t ? `Next experiment: ${t.exps[rec.e].long.toLowerCase()}` : 'Running an experiment';
  el.say.textContent = line;
  el.say.style.setProperty('--c', t ? STRAIN_CSS[t.slot] : 'transparent');
  el.why.textContent = rec.why ? `${BP.GEM?.model || 'The model'}: “${rec.why}”` : '';
}
const toastEls = new Map();
function toasts(G) {
  const live = new Set();
  const w = host.clientWidth, h = host.clientHeight;
  for (const t of G.toasts.slice(-4)) {
    live.add(t);
    let d = toastEls.get(t);
    if (!d) {
      d = document.createElement('div');
      d.className = 'toast';
      d.textContent = t.text;
      d.style.setProperty('--c', t.color);
      el.toasts.appendChild(d);
      toastEls.set(t, d);
    }
    const v = new THREE.Vector3(pxX(t.x), 1.9 + t.t * 0.25, pxZ(Math.max(t.y, FY))).project(camera);
    d.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    d.style.opacity = String(Math.min(1, (t.life - t.t) * 2));
  }
  for (const [t, d] of toastEls) if (!live.has(t)) {
    d.remove();
    toastEls.delete(t);
  }
}

$('#btnWatch3d').addEventListener('click', () => BP.startReplay(BP.GEM.traces[+$('#run3d').value || 0]));
$('#btnPlay3d').addEventListener('click', () => BP.start(1));
$('#btnAgain3d').addEventListener('click', () => (BP.auto ? BP.startReplay(BP.auto.trace) : BP.start(1)));
$('#btnMenu3d').addEventListener('click', () => BP.menu());
el.speed.addEventListener('click', () => document.getElementById('speedBtn').click());
// Charts drawer: a header with a Close button, a scrim that closes on a click outside, and Esc.
const drawer = document.getElementById('charts');
const scrim = Object.assign(document.createElement('div'), { id: 'scrim' });
document.body.appendChild(scrim);
if (drawer) {
  const head = document.createElement('div');
  head.className = 'drawer-head';
  head.innerHTML = '<h3>Live charts</h3><button type="button" id="chartsClose" aria-label="Close charts">Close</button>';
  drawer.prepend(head);
}
function setCharts(on) {
  document.body.classList.toggle('charts-open', on);
  $('#btnCharts').setAttribute('aria-pressed', String(on));
  window.dispatchEvent(new Event('resize')); // the plots size themselves to the drawer
}
$('#btnCharts').addEventListener('click', () => setCharts(!document.body.classList.contains('charts-open')));
$('#chartsClose')?.addEventListener('click', () => setCharts(false));
scrim.addEventListener('pointerdown', () => setCharts(false));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('charts-open')) {
    setCharts(false);
    e.stopImmediatePropagation(); // Esc closes the drawer first, it does not also pause
    e.preventDefault();
  }
}, true);
if (BP.GEM?.traces?.length) {
  $('#run3d').innerHTML = BP.GEM.traces.map((tr, i) => `<option value="${i}">Run ${i + 1}: ${tr.final.score} points</option>`).join('');
  $('#btnWatch3d').textContent = `Watch ${BP.GEM.model || 'the model'} run the lab`;
} else {
  $('#watchBox').hidden = true;
}

// ---------------------------------------------------------------- frame
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let lastState = '', ft = 0.016, fq = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = clock.elapsedTime;
  const G = BP.G, st = BP.state;
  if (st !== lastState) {
    if (st === 'play' && lastState !== 'pause' && !userMoved) resize();   // start from the front view
    lastState = st;
  }
  // stay smooth on weaker GPUs: drop ambient occlusion first, then resolution
  ft = ft * 0.95 + dt * 0.05;
  if (++fq > 50 && ft > 0.034 && !window.__labFixedQuality) {
    fq = 0;
    if (gtao && gtao.enabled) gtao.enabled = false;
    else if (renderer.getPixelRatio() > 0.75) {
      renderer.setPixelRatio(renderer.getPixelRatio() * 0.8);
      const keep = userMoved;
      userMoved = true;
      resize();
      userMoved = keep;
    }
  }
  el.start.hidden = st !== 'menu';
  el.end.hidden = st !== 'end';
  el.paused.hidden = st !== 'pause';
  document.body.classList.toggle('playing', st === 'play' || st === 'pause');
  el.speed.hidden = !BP.auto || st === 'menu';
  if (!el.speed.hidden) el.speed.textContent = document.getElementById('speedBtn').textContent;

  if (G) {
    el.score.textContent = G.score;
    const s = Math.ceil(G.timeLeft);
    el.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    cards(G);
    narrate();
    actions(G, st);
    toasts(G);
    if (st === 'end' && el.endLine.dataset.t !== String(G.t)) {
      el.endLine.dataset.t = String(G.t);
      const x = G.stats;
      el.endLine.textContent = `${G.score} points. ${x.papers} right answers published, ${x.retractions} wrong, ${x.expired} questions ran out of time.`;
    }
    // stations
    for (const [k, gs] of G.stations) {
      const s3 = stations.get(k);
      if (!s3) continue;
      syncItem(s3.holder, gs.item);
      const d = s3.dyn;
      let prog = gs.work > 0 ? gs.work : 0;
      if (gs.type === 'rack' && d.stack) {
        if (d.stack.userData.n !== gs.count) {
          d.stack.userData.n = gs.count;
          d.stack.clear();
          for (let i = 0; i < gs.count; i++) {
            const p = plateMesh({ st: 'clean', tk: null });
            p.position.set(0, 0.03 + i * 0.045, 0);
            d.stack.add(p);
          }
        }
      }
      if (gs.type === 'incubator' && d.glow) {
        const it = gs.item;
        let c = 0xff8a2a, e = 0.12;
        if (it && it.st === 'prep') { e = 0.5 + 0.4 * it.grow; prog = it.grow; }
        else if (it && it.st === 'grown') { c = 0x55e08a; e = 1.1 + 0.3 * Math.sin(now * 5); }
        else if (it && it.st === 'contam') { c = 0xff3322; e = 1.0 + 0.6 * Math.sin(now * 9); }
        d.glow.emissive.setHex(c);
        d.glow.emissiveIntensity = e;
      }
      if (d.beam) {
        d.beam.material.opacity = gs.work > 0 ? 0.9 : 0;
        d.beam.position.z = 0.36 + Math.sin(now * 9) * 0.14;
      }
      if (d.wheel) d.wheel.rotation.z += dt * (gs.work > 0 ? 5 : 0);
      if (d.screen) d.screen.emissiveIntensity = gs.work > 0 ? 2.2 : gs.item ? 1.3 : 0.7;
      if (d.slot) d.slot.color.setHex(0x2a8db5).multiplyScalar(0.75 + 0.25 * Math.sin(now * 3));
      const show = prog > 0.01 && prog < 0.999;
      s3.ring.visible = show;
      if (show) {
        s3.ring.geometry.dispose();
        s3.ring.geometry = new THREE.RingGeometry(0.085, 0.125, 40, 1, Math.PI / 2, -Math.PI * 2 * prog);
        s3.ring.lookAt(camera.position);
      }
    }
    // robots
    let lead = null;
    robots.forEach((b, i) => {
      const p = G.players[i];
      b.g.visible = !!p;
      if (!p) return;
      const x = pxX(p.x), z = pxZ(p.y);
      const moving = Math.hypot(x - b.sx, z - b.sz) > 0.0005;
      b.px = b.sx; b.pz = b.sz;
      b.sx = x; b.sz = z;
      b.g.position.set(x, 0, z);
      const want = Math.atan2(p.fx, p.fy);
      let dy = want - b.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw += dy * Math.min(1, dt * 12);
      b.g.rotation.y = b.yaw;
      if (b.duck) {
        // blend standing <-> stride, stride rate follows how fast the game moved it
        b.w += ((moving ? 1 : 0) - b.w) * Math.min(1, dt * 10);
        b.aWalk.setEffectiveWeight(b.w);
        b.aIdle.setEffectiveWeight(1 - b.w);
        // stride rate follows the speed the game moved it at (about 3.7 tiles/s at a walk).
        // The model's own stride is far too short for that, so this is a fast waddle, capped.
        const v = Math.hypot(x - b.px, z - b.pz) / Math.max(dt, 1e-3);
        b.v += (Math.min(v, 6) - b.v) * Math.min(1, dt * 8);
        b.aWalk.timeScale = THREE.MathUtils.clamp(b.v * 2.0, 3, 9);
        b.mixer.update(dt);
        // carried plate rides level on the flat head
        b.g.updateMatrixWorld(true);
        b.headBone.getWorldPosition(tmp);
        b.g.worldToLocal(tmp);
        b.holder.position.set(tmp.x, DUCK_TOP, tmp.z + DUCK_FWD);
        b.holder.rotation.x = p.useHeld ? -0.25 + 0.05 * Math.sin(now * 14) : 0;
        syncItem(b.holder, p.held);
        if (i === 0) lead = b;
        return;
      }
      b.t += dt * (moving ? 9 : 2);
      b.g.position.y = moving ? Math.abs(Math.sin(b.t)) * 0.012 : 0;
      b.head.rotation.y = Math.sin(now * 0.7 + i) * (moving ? 0.08 : 0.35);
      b.head.rotation.x = p.useHeld ? 0.35 : moving ? 0.05 : Math.sin(now * 0.9) * 0.06;
      b.eye.scale.setScalar(p.useHeld ? 1.25 + 0.2 * Math.sin(now * 14) : 1);
      const carrying = !!p.held;
      const armTo = p.useHeld ? -0.75 : carrying ? -0.2 : 0.55;
      b.arm.rotation.x += (armTo - b.arm.rotation.x) * Math.min(1, dt * 9);
      b.fore.rotation.x = -b.arm.rotation.x * 0.9;
      syncItem(b.holder, p.held);
      if (i === 0) lead = b;
    });
    // highlight what the lead robot is facing
    const p0 = G.players[0];
    if (p0 && st === 'play') {
      const c = Math.floor((p0.x + p0.fx * 46) / T), r = Math.floor((p0.y + p0.fy * 46 - FY) / T);
      const s3 = stations.get(c + ',' + r);
      targetRing.visible = !!s3 && s3.type !== 'counter';
      if (s3) {
        targetRing.position.set(tileX(c), TOP + 0.012, tileZ(r));
        targetRing.material.opacity = 0.55 + 0.3 * Math.sin(now * 6);
      }
    } else targetRing.visible = false;
    const gt = st === 'play' && p0 ? act.target : null;
    guide.visible = guideLine.visible = !!gt;
    if (gt) {
      const gx = tileX(gt.c), gz = tileZ(gt.r);
      guide.position.set(gx, TOP + 1.25 + 0.08 * Math.sin(now * 5), gz);
      guide.rotation.y = now * 1.5;
      const a = guideLine.geometry.attributes.position;
      a.setXYZ(0, pxX(p0.x), 0.03, pxZ(p0.y));
      a.setXYZ(1, gx, 0.03, gz);
      a.needsUpdate = true;
      guideLine.computeLineDistances();
    }
    if (follow && lead) {
      tmp.set(lead.sx, 0.7, lead.sz);
      const d = tmp.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
      controls.target.add(d);
      camera.position.add(d);
    }
  } else {
    robots.forEach((b) => (b.g.visible = false));
    targetRing.visible = false;
    guide.visible = guideLine.visible = false;
    // idle: a slow sway of the empty lab behind the start card
    if (!userMoved) {
      const a = Math.sin(now * 0.12) * 0.3;
      const d = camera.position.clone().sub(controls.target);
      const rad = Math.hypot(d.x, d.z);
      camera.position.set(controls.target.x + Math.sin(a) * rad, camera.position.y, controls.target.z + Math.cos(a) * rad);
    }
  }
  controls.update();
  composer.render();
}
resize();
frame();
