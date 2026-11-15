// A physically based ocean with a fog bank over a 6x6 grid.
// The fog is the player's belief: dense where a cell is uncertain, clear where it is known,
// sea blue where a ship is likely. Everything is procedural (no texture files), so the page
// works from file:// with no server.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { WATER_NORMALS } from './gen/assets.js';
import { buildShip, loadShipModels } from './ships.js';

export const CELL = 10; // metres per cell
const HALF = 30;
const cellX = (c) => -HALF + CELL * (c + 0.5);
const cellZ = (r) => -HALF + CELL * (r + 0.5);

// Large swells: [dirX, dirZ, wavelength m, amplitude m]. Shared by the vertex shader and the
// JS that makes ships and buoys ride the water.
const SWELL = [
  [0.86, 0.5, 46, 0.42],
  [0.6, 0.8, 31, 0.26],
  [0.98, -0.17, 23, 0.17],
  [0.34, 0.94, 17, 0.11],
  [0.77, -0.64, 13, 0.07],
];
const swellGLSL = SWELL.map(
  (w) => `W(vec2(${w[0].toFixed(3)}, ${w[1].toFixed(3)}), ${w[2].toFixed(1)}, ${w[3].toFixed(3)});`,
).join('\n    ');

export function swellHeight(x, z, t) {
  let y = 0;
  for (const [dx, dz, lam, a] of SWELL) {
    const k = (2 * Math.PI) / lam;
    y += a * Math.sin(k * (dx * x + dz * z - Math.sqrt(9.81 / k) * t));
  }
  return y;
}

const NOISE = /* glsl */ `
  float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

const WATER_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec2 vFlat;
  varying float vH;
  varying vec4 vMirror;
  uniform mat4 uMirrorVP;
  void main(){
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    vFlat = p.xz;
    float h = 0.0; vec2 off = vec2(0.0);
    #define W(D, lam, a) { float k = 6.28318 / lam; float f = k * (dot(D, p.xz) - sqrt(9.81 / k) * uTime); h += a * sin(f); off += D * a * 0.6 * cos(f); }
    ${swellGLSL}
    float fade = 1.0 - smoothstep(350.0, 900.0, length(p.xz));
    p.y += h * fade; p.xz += off * fade;
    vH = h; vWorld = p;
    vMirror = uMirrorVP * vec4(vFlat.x, 0.0, vFlat.y, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const WATER_FRAG = /* glsl */ `
  precision highp float;
  ${NOISE}
  uniform float uTime;
  uniform vec3 uSun, uSunColor;
  uniform samplerCube uEnv;
  uniform sampler2D uNormals;
  uniform sampler2D uMirror;
  uniform vec3 uHover;          // x, z of hovered cell centre, z = strength
  uniform vec4 uRipple[6];      // x, z, start time, strength
  uniform vec4 uLine;           // highlighted scan line: axis (0 row / 1 col), index, strength
  uniform vec4 uShip[3];        // x, z, half length, 1 = along x / 0 = along z
  uniform float uShipOn[3];
  uniform float uGrid;
  varying vec3 vWorld;
  varying vec2 vFlat;
  varying float vH;
  varying vec4 vMirror;

  vec2 nm(vec2 uv){ return texture2D(uNormals, uv).xy * 2.0 - 1.0; }

  void main(){
    vec3 V = normalize(cameraPosition - vWorld);
    float dist = length(cameraPosition - vWorld);
    vec2 slope = vec2(0.0);
    #define W(D, lam, a) { float k = 6.28318 / lam; float f = k * (dot(D, vFlat) - sqrt(9.81 / k) * uTime); slope += D * k * a * cos(f); }
    ${swellGLSL}
    // wind chop from a measured-looking normal map, four drifting layers at three scales
    float t = uTime;
    vec2 d1 = nm(vFlat / 9.0 + t * vec2(0.031, 0.017)) + nm(vFlat / 6.1 - t * vec2(0.022, 0.035));
    vec2 d2 = nm(vFlat / 27.0 + t * vec2(0.012, -0.008)) + nm(vFlat / 61.0 - t * vec2(0.006, 0.004));
    float near = clamp(140.0 / dist, 0.0, 1.0);
    slope += d1 * 0.20 * near + d2 * mix(0.30, 0.16, near);
    // splash rings
    float ring = 0.0;
    for (int i = 0; i < 6; i++){
      float age = uTime - uRipple[i].z;
      if (age > 0.0 && age < 6.0){
        vec2 d = vFlat - uRipple[i].xy; float r = length(d) + 1e-3;
        float wv = sin(1.6 * r - 9.0 * age) * exp(-0.5 * age) * smoothstep(9.0 * age + 2.0, 9.0 * age - 4.0, r) * uRipple[i].w;
        slope += (d / r) * wv * 0.22; ring += abs(wv) * smoothstep(3.0, 0.0, age);
      }
    }
    // hulls: contact shadow, and foam where the water meets the plating
    float shade = 0.0, hullFoam = 0.0;
    for (int i = 0; i < 3; i++){
      vec2 q = vFlat - uShip[i].xy;
      q = uShip[i].w > 0.5 ? q : q.yx;
      float sd = length(vec2(max(abs(q.x) - uShip[i].z + 2.0, 0.0), q.y)) - 2.1;
      hullFoam += uShipOn[i] * smoothstep(1.6, 0.0, abs(sd - 0.3)) * (0.45 + 0.55 * vnoise(vFlat * 1.3 + t * 0.6));
      vec2 qs = vFlat - uShip[i].xy + uSun.xz * 7.0;
      qs = uShip[i].w > 0.5 ? qs : qs.yx;
      float ss = length(vec2(max(abs(qs.x) - uShip[i].z, 0.0), qs.y));
      shade += uShipOn[i] * smoothstep(9.0, 1.0, ss);
    }
    shade = clamp(shade, 0.0, 1.0);

    vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
    float nv = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.015; R = normalize(R);
    vec3 refl = min(textureCube(uEnv, R).rgb, vec3(2.2));
    vec2 muv = vMirror.xy / vMirror.w * 0.5 + 0.5 + N.xz * 0.04;
    vec4 mir = texture2D(uMirror, muv);
    refl = mix(refl, mir.rgb, mir.a * 0.92);
    // sun glitter
    vec3 Hh = normalize(V + uSun);
    float spec = min(pow(max(dot(N, Hh), 0.0), 520.0) * 14.0, 6.0) + pow(max(dot(N, Hh), 0.0), 60.0) * 0.2;
    refl += uSunColor * spec * (1.0 - shade);
    // water body: deep absorption plus light scattered back through the crests
    vec3 deep = vec3(0.004, 0.030, 0.050);
    vec3 scatter = vec3(0.012, 0.115, 0.125);
    float crest = clamp(vH * 0.8 + 0.45 + dot(d1, uSun.xz) * 0.25, 0.0, 1.0);
    float back = pow(max(dot(V, -uSun), 0.0), 4.0);
    vec3 body = deep + scatter * crest * (0.55 + 1.6 * back) * (1.0 - 0.5 * shade);
    vec3 col = mix(body, refl, F);
    col *= 1.0 - 0.35 * shade;
    float foam = clamp(hullFoam * 0.28 + ring * 0.6, 0.0, 0.9);
    col = mix(col, vec3(0.80, 0.84, 0.86) * (0.55 + 0.6 * max(uSun.y * 2.0, 0.3)), foam);
    // the grid, painted on the surface
    vec2 g = (vFlat + 30.0) / 10.0;
    float inside = step(0.0, g.x) * step(g.x, 6.0) * step(0.0, g.y) * step(g.y, 6.0);
    vec2 fw = fwidth(g) * 1.2 + 0.012;
    vec2 gl = smoothstep(fw, vec2(0.0), abs(fract(g + 0.5) - 0.5));
    float line = max(gl.x, gl.y) * inside;
    float border = max(smoothstep(fw.x * 2.0, 0.0, abs(g.x)) + smoothstep(fw.x * 2.0, 0.0, abs(g.x - 6.0)), smoothstep(fw.y * 2.0, 0.0, abs(g.y)) + smoothstep(fw.y * 2.0, 0.0, abs(g.y - 6.0)));
    border *= step(-0.05, g.x) * step(g.x, 6.05) * step(-0.05, g.y) * step(g.y, 6.05);
    col = mix(col, vec3(0.9), uGrid * clamp(line * 0.2 + border * 0.45, 0.0, 0.65));
    vec2 hd = abs(vFlat - uHover.xy);
    col += uHover.z * 0.10 * step(max(hd.x, hd.y), 5.0);
    float lc = uLine.x < 0.5 ? g.y : g.x;
    col += uLine.z * 0.09 * inside * step(uLine.y, lc) * step(lc, uLine.y + 1.0);
    // aerial perspective toward the horizon colour of the real sky
    vec3 hz = min(textureCube(uEnv, normalize(vec3(-V.x, 0.03, -V.z))).rgb, vec3(1.6));
    col = mix(col, hz, 1.0 - exp(-dist * 0.00055));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FOG_FRAG = /* glsl */ `
  precision highp float;
  precision highp sampler3D;
  uniform sampler2D uBelief;    // r = density, g = probability of a ship
  uniform sampler3D uNoise;
  uniform float uTime, uAmount, uSteps;
  uniform vec3 uSun, uSunColor, uAmbient;
  varying vec3 vWorld;
  const float TOP = 12.0;
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  vec2 belief(vec2 xz){
    vec2 uv = (xz + 30.0) / 60.0;
    vec2 e = smoothstep(vec2(-0.07), vec2(0.04), uv) * smoothstep(vec2(1.07), vec2(0.96), uv);
    vec4 b = texture2D(uBelief, clamp(uv, 0.02, 0.98));
    return vec2(b.r * e.x * e.y, b.g);
  }
  float density(vec3 p, float detail){
    vec2 b = belief(p.xz);
    if (b.x < 0.015) return 0.0;
    float h = p.y / TOP;
    float prof = smoothstep(0.0, 0.07, h) * smoothstep(1.0, 0.18, h);
    vec3 q = p * 0.021 + vec3(uTime * 0.006, uTime * 0.002, uTime * 0.004);
    float n = texture(uNoise, q).r;
    if (detail > 0.5) n = n * 0.72 + texture(uNoise, q * 3.3 + 0.37).r * 0.2 + texture(uNoise, q * 8.1 + 0.11).r * 0.08;
    float cover = mix(0.60, 0.27, b.x) + h * 0.22;
    return clamp((n - cover) * 4.2, 0.0, 1.0) * prof * b.x;
  }
  void main(){
    vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
    vec3 lo = vec3(-37.0, 0.0, -37.0), hi = vec3(37.0, TOP, 37.0);
    vec3 t0 = (lo - ro) / rd, t1 = (hi - ro) / rd;
    vec3 tn = min(t0, t1), tf = max(t0, t1);
    float ta = max(max(tn.x, tn.y), max(tn.z, 0.0)), tb = min(min(tf.x, tf.y), tf.z);
    if (tb <= ta) discard;
    const int STEPS = 44;
    float dt = (tb - ta) / uSteps;
    float t = ta + dt * ign(gl_FragCoord.xy + fract(uTime * 7.0) * 13.0);
    float cosT = dot(rd, uSun);
    float g = 0.55;
    float phase = mix(0.9, (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5), 0.55);
    float trans = 1.0; vec3 acc = vec3(0.0);
    for (int i = 0; i < STEPS; i++){
      if (float(i) >= uSteps) break;
      vec3 p = ro + rd * t;
      float den = density(p, 1.0) * uAmount;
      if (den > 0.002){
        float od = 0.0;
        for (int j = 1; j <= 3; j++) od += density(p + uSun * (float(j) * 2.2), 0.0);
        float sunT = exp(-od * 1.9);
        float powder = 1.0 - exp(-den * 7.0);
        float h = p.y / TOP;
        vec3 light = uSunColor * sunT * phase * mix(0.6, 1.0, powder) + uAmbient * (0.45 + 0.55 * h);
        float pr = belief(p.xz).y;
        vec3 alb = mix(vec3(1.0), vec3(0.24, 0.66, 0.92), smoothstep(0.30, 0.85, pr) * 0.85);
        vec3 c = light * alb + vec3(0.10, 0.52, 0.95) * smoothstep(0.45, 0.95, pr) * 0.55 * (1.0 - h);
        float a = 1.0 - exp(-den * dt * 0.62);
        acc += trans * a * c; trans *= 1.0 - a;
      }
      t += dt;
      if (trans < 0.015) break;
    }
    gl_FragColor = vec4(acc, 1.0 - trans);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const PASS_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 d = vUv - 0.5;
      c *= 1.0 - 0.38 * dot(d, d) * 1.6;
      c += (h(vUv * 911.0 + fract(uTime)) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Tileable 3D value-noise fbm for the fog, built once per page.
let NOISE3D = null;
function noiseTexture() {
  if (NOISE3D) return NOISE3D;
  const S = 48, data = new Uint8Array(S * S * S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const octave = (P) => {
    const lat = new Float32Array(P * P * P).map(rnd);
    const at = (x, y, z) => lat[((x % P) * P + (y % P)) * P + (z % P)];
    const sm = (f) => f * f * (3 - 2 * f);
    return (u, v, w) => {
      const x = u * P, y = v * P, z = w * P;
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
      const L = (a, b, f) => a + (b - a) * f;
      return L(L(L(at(xi, yi, zi), at(xi + 1, yi, zi), fx), L(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), fx), fy),
        L(L(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), fx), L(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), fx), fy), fz);
    };
  };
  const o = [octave(3), octave(6), octave(12), octave(24)], w = [0.5, 0.27, 0.15, 0.08];
  let i = 0;
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += w[k] * o[k](x / S, y / S, z / S);
    data[i++] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  const t = new THREE.Data3DTexture(data, S, S, S);
  t.format = THREE.RedFormat;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return (NOISE3D = t);
}

export class Sea {
  constructor(host, { interactive = false } = {}) {
    this.host = host;
    this.interactive = interactive;
    this.onAction = null;
    this.locked = false;
    host.classList.add('sea');
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const small = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
    this.small = small;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5));
    this.renderer = renderer;
    host.appendChild(renderer.domElement);
    this.labels = document.createElement('div');
    this.labels.className = 'sea-labels';
    host.appendChild(this.labels);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 12, 9000);
    this.mirrorCam = new THREE.PerspectiveCamera(46, 1, 12, 9000);
    this.mirrorCam.layers.set(1);
    this.mirrorRT = new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.HalfFloatType });
    this.sun = new THREE.Vector3(-0.66, 0.2, -0.74).normalize();
    this.sunColor = new THREE.Color(1.0, 0.78, 0.55).multiplyScalar(3.2);
    this.time = { value: 0 };

    // physically based sky (Preetham scattering with a thin cloud deck), also used as the
    // environment that the water and the ships reflect
    const makeSky = () => {
      const sky = new Sky();
      sky.scale.setScalar(5000);
      const u = sky.material.uniforms;
      u.turbidity.value = 3.2;
      u.rayleigh.value = 1.35;
      u.mieCoefficient.value = 0.0025;
      u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(this.sun);
      if (u.showSunDisc) u.showSunDisc.value = 0;
      if (u.cloudCoverage) {
        u.cloudCoverage.value = 0.46;
        u.cloudDensity.value = 0.42;
        u.cloudElevation.value = 0.42;
      }
      return sky;
    };
    this.sky = makeSky();
    this.scene.add(this.sky);
    const envScene = new THREE.Scene();
    envScene.add(makeSky());
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cubeCam = new THREE.CubeCamera(1, 8000, cubeRT);
    cubeCam.update(renderer, envScene);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(envScene, 0, 1, 8000).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const light = new THREE.DirectionalLight(0xffe2c0, 1.7);
    light.position.copy(this.sun).multiplyScalar(160);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 20, far: 320 });
    light.shadow.bias = -0.0015;
    light.shadow.normalBias = 0.3;
    light.layers.enable(1);
    this.scene.add(light);

    const normals = new THREE.TextureLoader().load(WATER_NORMALS);
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    normals.anisotropy = 8;

    this.ripples = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -100, 0));
    this.rippleIx = 0;
    this.waterU = {
      uTime: this.time, uSun: { value: this.sun }, uSunColor: { value: this.sunColor },
      uEnv: { value: cubeRT.texture }, uNormals: { value: normals },
      uShip: { value: [0, 1, 2].map(() => new THREE.Vector4(0, 0, 10, 1)) }, uShipOn: { value: [0, 0, 0] },
      uMirror: { value: this.mirrorRT.texture },
      uMirrorVP: { value: new THREE.Matrix4() }, uHover: { value: new THREE.Vector3(0, 0, 0) },
      uRipple: { value: this.ripples }, uLine: { value: new THREE.Vector4(0, 0, 0, 0) },
      uGrid: { value: 1 },
    };
    const wg = new THREE.PlaneGeometry(2400, 2400, 320, 320);
    wg.rotateX(-Math.PI / 2);
    // pull vertices toward the centre so the mesh is dense under the grid and coarse far away
    const pos = wg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / 1200, z = pos.getZ(i) / 1200;
      const r = Math.max(Math.abs(x), Math.abs(z));
      const s = r > 0 ? Math.pow(r, 2.6) / r : 0;
      pos.setX(i, x * s * 1200 + (r > 0.999 ? x * 3000 : 0));
      pos.setZ(i, z * s * 1200 + (r > 0.999 ? z * 3000 : 0));
    }
    const water = new THREE.Mesh(wg, new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: this.waterU,
    }));
    water.frustumCulled = false;
    this.scene.add(water);

    // belief texture -> fog
    this.cur = new Float32Array(36 * 2);
    this.target = new Float32Array(36 * 2);
    this.beliefData = new Uint8Array(36 * 4);
    this.beliefTex = new THREE.DataTexture(this.beliefData, 6, 6, THREE.RGBAFormat);
    this.beliefTex.magFilter = THREE.LinearFilter;
    this.beliefTex.minFilter = THREE.LinearFilter;
    this.fogU = {
      uBelief: { value: this.beliefTex }, uTime: this.time, uAmount: { value: 1 },
      uSun: { value: this.sun }, uSunColor: { value: this.sunColor.clone().multiplyScalar(0.62) },
      uAmbient: { value: new THREE.Color(0.52, 0.62, 0.76).multiplyScalar(0.95) },
      uNoise: { value: noiseTexture() }, uSteps: { value: small ? 28 : 44 },
    };
    this.fogAmountTarget = 1;
    const fogBox = new THREE.Mesh(
      new THREE.BoxGeometry(74, 12, 74),
      new THREE.ShaderMaterial({
        vertexShader: PASS_VERT, fragmentShader: FOG_FRAG, uniforms: this.fogU,
        side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    fogBox.position.y = 6;
    fogBox.renderOrder = 5;
    this.scene.add(fogBox);

    this.ships = new THREE.Group();
    this.markers = new THREE.Group();
    this.scene.add(this.ships, this.markers);
    this.floaters = [];
    this.shots = new Map();   // cell -> count
    this.scanResults = Array.from({ length: 12 }, () => []);
    this.anim = [];
    this.hover = null;
    this.hoverLine = null;
    this.orbit = 0;
    this.revealed = false;

    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.1, 0.5, 3.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);

    this._buildLabels();
    this._bindPointer();
    this._resize();
    new ResizeObserver(() => this._resize()).observe(host);
    this.visible = false;
    new IntersectionObserver((es) => {
      this.visible = es[0].isIntersecting;
    }, { threshold: 0.01 }).observe(host);
    this.clock = new THREE.Clock();
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.visible) this._frame();
    };
    loop();
  }

  // ---- public ---------------------------------------------------------------------------
  setBelief(occ, instant = false) {
    for (let c = 0; c < 36; c++) {
      const p = Math.min(Math.max(occ[c], 1e-6), 1 - 1e-6);
      const H = -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
      this.target[c * 2] = Math.max(H, 0.8 * p);
      this.target[c * 2 + 1] = p;
    }
    if (instant) this.cur.set(this.target);
  }

  reset() {
    for (const g of [this.ships, this.markers]) while (g.children.length) g.remove(g.children[0]);
    this.floaters = [];
    this.shots.clear();
    this.scanResults.forEach((r) => (r.length = 0));
    this.anim = [];
    this.revealed = false;
    this.fogAmountTarget = 1;
    this.waterU.uGrid.value = 1;
    this.orbitTarget = 0;
    this.waterU.uShipOn.value = [0, 0, 0];
    this._renderScanLabels();
    this.host.classList.remove('revealed');
  }

  showFire(cell, hit) {
    const r = Math.floor(cell / 6), c = cell % 6;
    const n = this.shots.get(cell) || 0;
    this.shots.set(cell, n + 1);
    const x = cellX(c) + (n ? (n % 2 ? 2.4 : -2.4) : 0), z = cellZ(r) + (n > 1 ? 2.4 : 0);
    this._ripple(x, z, 1);
    const col = hit ? 0x38a8d8 : 0xf4f8fb;
    const g = new THREE.Group();
    const buoy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.75, 1.5, 16),
      new THREE.MeshStandardMaterial({ color: hit ? 0x1c6f94 : 0xdfe6ea, roughness: 0.5 }),
    );
    buoy.position.y = 0.5;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(hit ? 0.62 : 0.42, 16, 12),
      new THREE.MeshBasicMaterial({ color: col }),
    );
    lamp.position.y = 1.7;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, hit ? 0.7 : 0.4, hit ? 9 : 5, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: hit ? 0.5 : 0.3, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    beam.position.y = hit ? 6.2 : 4.2;
    g.add(buoy, lamp, beam);
    g.traverse((o) => {
      o.layers.enable(1);
      o.renderOrder = 8;
    });
    g.position.set(x, 0, z);
    g.scale.setScalar(0.01);
    this.markers.add(g);
    this.floaters.push({ obj: g, x, z, tilt: 0.35 });
    this._tween(0.5, (k) => g.scale.setScalar(Math.max(0.01, easeOutBack(k))));
    // splash plume
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 9, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    plume.position.set(x, 0, z);
    plume.renderOrder = 7;
    this.markers.add(plume);
    this._tween(0.9, (k) => {
      plume.scale.set(1 + k * 0.8, Math.sin(k * Math.PI) * 1.2 + 0.01, 1 + k * 0.8);
      plume.position.y = 4.5 * plume.scale.y;
      plume.material.opacity = 0.7 * (1 - k);
    }, () => this.markers.remove(plume));
  }

  showScan(line, count) {
    this.scanResults[line].push(count);
    this._renderScanLabels();
    const isRow = line < 6, i = line % 6;
    this.waterU.uLine.value.set(isRow ? 0 : 1, i, 1, 0);
    this._tween(1.4, (k) => (this.waterU.uLine.value.z = 1 - k));
    for (let s = 0; s < 6; s++) {
      const x = isRow ? cellX(s) : cellX(i), z = isRow ? cellZ(i) : cellZ(s);
      setTimeout(() => this._ripple(x, z, 0.35), s * 70);
    }
  }

  reveal(ships) {
    if (this.revealed) return;
    this.revealed = true;
    this.fogAmountTarget = 0;
    this.orbitTarget = 1;
    this.host.classList.add('revealed');
    ships.forEach((s, i) => {
      const m = buildShip(s.length);
      const cs = s.cells;
      const cx = cs.reduce((a, c) => a + cellX(c[1]), 0) / cs.length;
      const cz = cs.reduce((a, c) => a + cellZ(c[0]), 0) / cs.length;
      m.rotation.y = s.horiz ? 0 : Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(m);
      holder.position.set(cx, -11, cz);
      this.ships.add(holder);
      const f = { obj: holder, x: cx, z: cz, tilt: 0.1, lift: -11 };
      this.floaters.push(f);
      this.waterU.uShip.value[i].set(cx, cz, s.length * CELL * 0.43, s.horiz ? 1 : 0);
      setTimeout(() => {
        this._ripple(cx, cz, 0.8);
        this._tween(2.4, (k) => {
          f.lift = -11 * (1 - easeOutCubic(k));
          this.waterU.uShipOn.value[i] = k * k;
        });
      }, 500 + i * 350);
    });
  }

  // ---- internals ------------------------------------------------------------------------
  _tween(dur, fn, done) {
    this.anim.push({ t: 0, dur, fn, done });
  }

  _ripple(x, z, strength) {
    this.ripples[this.rippleIx].set(x, z, this.time.value, strength);
    this.rippleIx = (this.rippleIx + 1) % this.ripples.length;
  }

  _buildLabels() {
    this.scanBtns = [];
    for (let line = 0; line < 12; line++) {
      const b = document.createElement('button');
      b.className = 'scan-btn';
      b.type = 'button';
      const isRow = line < 6;
      b.setAttribute('aria-label', `Scan ${isRow ? 'row' : 'column'} ${(line % 6) + 1}`);
      b.innerHTML = `<span class="scan-ico">${isRow ? '&rarr;' : '&darr;'}</span><span class="scan-res"></span>`;
      b.addEventListener('click', () => {
        if (this.interactive && !this.locked && this.onAction) this.onAction(36 + line);
      });
      b.addEventListener('pointerenter', () => (this.hoverLine = line));
      b.addEventListener('pointerleave', () => (this.hoverLine = null));
      this.labels.appendChild(b);
      const p = isRow
        ? new THREE.Vector3(-HALF - 5.5, 0.5, cellZ(line))
        : new THREE.Vector3(cellX(line - 6), 0.5, -HALF - 5.5);
      this.scanBtns.push({ el: b, p });
    }
  }

  _renderScanLabels() {
    this.scanBtns.forEach(({ el }, line) => {
      const res = this.scanResults[line];
      el.querySelector('.scan-res').textContent = res.join(' · ');
      el.classList.toggle('has-res', res.length > 0);
    });
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pick = (ev) => {
      const b = el.getBoundingClientRect();
      const v = new THREE.Vector2(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(v, this.camera);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return null;
      const c = Math.floor((p.x + HALF) / CELL), r = Math.floor((p.z + HALF) / CELL);
      return c >= 0 && c < 6 && r >= 0 && r < 6 ? r * 6 + c : null;
    };
    el.addEventListener('pointermove', (ev) => {
      this.hover = this.interactive && !this.locked ? pick(ev) : null;
      el.style.cursor = this.hover !== null ? 'crosshair' : 'default';
    });
    el.addEventListener('pointerleave', () => (this.hover = null));
    el.addEventListener('click', (ev) => {
      if (!this.interactive || this.locked || !this.onAction) return;
      const cell = pick(ev);
      if (cell !== null) this.onAction(cell);
    });
  }

  _resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.size = [w, h];
  }

  _frame() {
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.05) * (window.__seaSpeed || 1);
    // keep it smooth on weaker GPUs: drop fog steps first, then resolution
    this.ft = (this.ft ?? 0.016) * 0.95 + Math.min(raw, 0.2) * 0.05;
    if ((this.fq = (this.fq || 0) + 1) > 45 && this.ft > 0.03 && !window.__seaFixedQuality) {
      this.fq = 0;
      if (this.fogU.uSteps.value > 22) this.fogU.uSteps.value -= 11;
      else if (this.renderer.getPixelRatio() > 0.7) {
        this.renderer.setPixelRatio(this.renderer.getPixelRatio() * 0.8);
        this._resize();
      }
    }
    const t = (this.time.value += dt);
    // camera: frame the grid for this aspect, drift slowly, drop lower on reveal
    this.orbit += ((this.orbitTarget || 0) - this.orbit) * Math.min(1, dt * 0.8);
    const asp = this.camera.aspect;
    // phones get a closer, steeper view so the cells are big enough to tap
    const sm = this.small && asp < 1.3;
    const dist = (sm ? 118 / Math.min(asp, 1.1) : 116 / Math.min(asp / 1.18, 1.2)) * (1 - 0.06 * this.orbit);
    const elev = THREE.MathUtils.degToRad((sm ? 44 : 25) - (sm ? 26 : 9) * this.orbit);
    const pitch = THREE.MathUtils.degToRad((sm ? 40 : 21) - (sm ? 25 : 7) * this.orbit);
    const az = Math.sin(t * 0.05) * 0.06 + 0.42 * this.orbit;
    const cx = Math.sin(az) * Math.cos(elev) * dist, cy = Math.sin(elev) * dist;
    const cz = Math.cos(az) * Math.cos(elev) * dist;
    const reach = cy / Math.tan(pitch) / Math.hypot(cx, cz);
    this.look = [cx * (1 - reach), 0, cz * (1 - reach)];
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.look[0], 0, this.look[2]);
    if (window.__seaCam) {
      this.camera.position.set(...window.__seaCam.slice(0, 3));
      this.look = [window.__seaCam[3], 0, window.__seaCam[5]];
      this.camera.lookAt(...window.__seaCam.slice(3));
    }

    for (const a of this.anim) {
      a.t += dt;
      a.fn(Math.min(a.t / a.dur, 1));
      if (a.t >= a.dur && a.done) a.done();
    }
    this.anim = this.anim.filter((a) => a.t < a.dur);

    for (const f of this.floaters) {
      const y = swellHeight(f.x, f.z, t);
      const dx = swellHeight(f.x + 2, f.z, t) - y, dz = swellHeight(f.x, f.z + 2, t) - y;
      f.obj.position.y = y * 0.85 + (f.lift || 0);
      f.obj.children[0]?.userData.tick?.(t);
      f.obj.rotation.z = dx * f.tilt;
      f.obj.rotation.x = -dz * f.tilt;
    }

    // fog follows belief
    const k = Math.min(1, dt * 2.2);
    for (let i = 0; i < 72; i++) this.cur[i] += (this.target[i] - this.cur[i]) * k;
    for (let c = 0; c < 36; c++) {
      this.beliefData[c * 4] = Math.round(this.cur[c * 2] * 255);
      this.beliefData[c * 4 + 1] = Math.round(this.cur[c * 2 + 1] * 255);
      this.beliefData[c * 4 + 3] = 255;
    }
    this.beliefTex.needsUpdate = true;
    this.fogU.uAmount.value += (this.fogAmountTarget - this.fogU.uAmount.value) * Math.min(1, dt * 1.1);
    this.waterU.uGrid.value += ((this.revealed ? 0.3 : 1) - this.waterU.uGrid.value) * k;

    const hv = this.waterU.uHover.value;
    if (this.hover !== null) hv.set(cellX(this.hover % 6), cellZ(Math.floor(this.hover / 6)), 1);
    else hv.z = 0;
    if (this.hoverLine !== null && this.interactive && !this.locked && this.waterU.uLine.value.z < 0.5)
      this.waterU.uLine.value.set(this.hoverLine < 6 ? 0 : 1, this.hoverLine % 6, 0.45, 0);
    else if (this.hoverLine === null && this.waterU.uLine.value.z === 0.45) this.waterU.uLine.value.z = 0;

    // mirror pass: ships and buoys reflected in the water plane
    const cam = this.camera, mc = this.mirrorCam, r = this.renderer;
    mc.fov = cam.fov;
    mc.aspect = cam.aspect;
    mc.updateProjectionMatrix();
    mc.position.set(cam.position.x, -cam.position.y, cam.position.z);
    mc.up.set(0, -1, 0);
    mc.lookAt(this.look[0], 0, this.look[2]);
    mc.updateMatrixWorld();
    this.waterU.uMirrorVP.value.multiplyMatrices(mc.projectionMatrix, mc.matrixWorldInverse);
    r.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.2)];
    r.setRenderTarget(this.mirrorRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, mc);
    r.setRenderTarget(null);
    r.clippingPlanes = [];
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = t;
    this.grade.uniforms.uTime.value = t;
    this.composer.render();

    // labels
    const [w, h] = this.size;
    const show = this.interactive || this.scanResults.some((s) => s.length);
    for (const [line, { el, p }] of this.scanBtns.entries()) {
      const v = p.clone().project(cam);
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      const on = show && !this.revealed && (this.interactive || this.scanResults[line].length);
      el.style.opacity = on ? 1 : 0;
      el.style.pointerEvents = on && this.interactive && !this.locked ? 'auto' : 'none';
    }
  }
}

const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const easeOutBack = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
