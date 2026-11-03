// «Погоня» — главный файл: физика, полиция, монеты, гараж, барабан, интерфейс.
import * as THREE from '../vendor/three.module.min.js';
import { MAT, Vox } from './vox.js';
import { CARS, COPS, RARITY, carGeometry } from './cars.js';
import { World, BLK, T, SURF } from './world.js';
import { Sfx } from './audio.js';

// ================= сохранение =================
const SAVE_KEY = 'pogonya-v1';
const save = (() => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* приватный режим */ }
  return Object.assign({ coins: 100, owned: ['kopeyka'], sel: 'kopeyka', best: 0, sound: true, hq: true, tut: false, runs: 0, cops: 0 }, s || {});
})();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ничего */ } }

const COIN_VALUE = 5, WHEEL_PRICE = 100;
const HEAVY = { heavy: 1, cannon: 1, crush: 1 };
const $ = id => document.getElementById(id);
const sfx = new Sfx(); sfx.setOn(save.sound);

// ================= рендер =================
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const SKY = 0xa6dcff;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 75, 150);
const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x7d6f55, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3dd, 2.3);
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 160 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);
const camera = new THREE.PerspectiveCamera(34, 1, 1, 500);

const world = new World(scene);

function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, save.hq ? 2 : 1.25));
  renderer.shadowMap.enabled = save.hq;
  sun.castShadow = save.hq;
  for (const k in MAT) MAT[k].needsUpdate = true;
  resize();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  gCam.aspect = w / h;
  if (w / h < 0.9) gCam.setViewOffset(w, h, 0, h * 0.1, w, h); else gCam.clearViewOffset();
  gCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ================= гараж (3D-витрина) =================
const gScene = new THREE.Scene();
gScene.background = new THREE.Color(0x1a1d33);
gScene.add(new THREE.HemisphereLight(0xc8d6ff, 0x2a2238, 1.6));
const gKey = new THREE.DirectionalLight(0xffffff, 2.6); gKey.position.set(6, 10, 8); gScene.add(gKey);
const gRim = new THREE.DirectionalLight(0xff9a5c, 1.6); gRim.position.set(-8, 4, -6); gScene.add(gRim);
const gCam = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
const plat = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 0.5, 48), new THREE.MeshLambertMaterial({ color: 0x2c3157 }));
plat.position.y = -0.25; gScene.add(plat);
const platRing = new THREE.Mesh(new THREE.CylinderGeometry(5.65, 5.65, 0.12, 48), new THREE.MeshBasicMaterial({ color: 0xffb020 }));
platRing.position.y = -0.42; gScene.add(platRing);
const silMat = new THREE.MeshBasicMaterial({ color: 0x07080f });
const gTurn = new THREE.Group(); gScene.add(gTurn);
let gMesh = null, gIndex = Math.max(0, CARS.findIndex(c => c.id === save.sel));

function showGarageCar() {
  const def = CARS[gIndex], owned = save.owned.includes(def.id);
  if (gMesh) gTurn.remove(gMesh);
  gMesh = new THREE.Mesh(carGeometry(def), owned ? MAT.lambert : silMat);
  gTurn.add(gMesh);
  gCam.userData.size = Math.max(def.len, def.wid * 1.4, 3.6);
}

// ================= частицы =================
class Particles {
  constructor(mat, cap) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cap);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.cap = cap; this.list = [];
    scene.add(this.mesh);
  }
  add(o) { if (this.list.length >= this.cap) this.list.shift(); this.list.push(o); }
  update(dt) {
    const m = this._m || (this._m = new THREE.Matrix4()), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    let n = 0;
    this.list = this.list.filter(o => (o.t += dt) < o.life);
    for (const o of this.list) {
      o.vy -= (o.g ?? 22) * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (o.y < o.s / 2 && o.g !== 0) { o.y = o.s / 2; o.vy *= -0.35; o.vx *= 0.7; o.vz *= 0.7; }
      const k = o.t / o.life, sz = o.s * (o.grow ? 1 + k * o.grow : 1 - k * k);
      e.set(o.t * o.rx, o.t * o.ry, 0); q.setFromEuler(e);
      m.compose(p.set(o.x, o.y, o.z), q, s.set(sz, sz, sz));
      this.mesh.setMatrixAt(n, m);
      c.setHex(o.c); if (o.fade) c.lerp(this._fadeTo || (this._fadeTo = new THREE.Color(0x444444)), k);
      this.mesh.setColorAt(n, c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.list = []; }
}
const debris = new Particles(new THREE.MeshLambertMaterial(), 500);
const glow = new Particles(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }), 500);
const R = (a, b) => a + Math.random() * (b - a);

function burst(x, y, z, color, n, speed = 8, size = 0.4) {
  for (let i = 0; i < n; i++) debris.add({ x, y, z, vx: R(-1, 1) * speed, vy: R(0.4, 1.4) * speed, vz: R(-1, 1) * speed, s: size * R(0.6, 1.4), t: 0, life: R(0.8, 1.6), c: color, rx: R(-8, 8), ry: R(-8, 8) });
}
function explosion(x, z, big = 1) {
  for (let i = 0; i < 26 * big; i++) glow.add({ x: x + R(-1, 1), y: R(0.5, 2), z: z + R(-1, 1), vx: R(-1, 1) * 7, vy: R(2, 9), vz: R(-1, 1) * 7, g: 4, s: R(0.8, 1.8) * big, grow: 0.6, t: 0, life: R(0.4, 0.9), c: [0xffd54f, 0xff9800, 0xff5722, 0xfff3c4][i % 4], fade: true, rx: 3, ry: 3 });
  for (let i = 0; i < 8 * big; i++) glow.add({ x: x + R(-1, 1), y: R(1, 3), z: z + R(-1, 1), vx: R(-1, 1) * 2, vy: R(2, 5), vz: R(-1, 1) * 2, g: -1, s: R(0.9, 1.6), grow: 1.2, t: 0, life: R(1, 1.8), c: 0x555555, rx: 1, ry: 1 });
  burst(x, 1.5, z, 0x2a2a2a, 10, 10, 0.5);
  burst(x, 1.5, z, 0xffb74d, 6, 12, 0.25);
}
function smoke(x, y, z, c = 0x9e9e9e, s = 1) { glow.add({ x, y, z, vx: R(-0.5, 0.5), vy: R(1.5, 3), vz: R(-0.5, 0.5), g: 0, s: s * R(0.6, 1.1), grow: 1.6, t: 0, life: R(0.7, 1.3), c, rx: 1, ry: 1 }); }

// ================= машины =================
class Car {
  constructor(def, cop) {
    this.def = def; this.cop = cop;
    this.mesh = new THREE.Group();
    this.body = new THREE.Mesh(carGeometry(def), MAT.lambert);
    this.body.castShadow = true;
    this.mesh.add(this.body);
    this.lights = [];
    if (def.lights) for (const [x, y, z, col] of def.lights) {
      const l = new THREE.Mesh(LIGHT_GEO, new THREE.MeshBasicMaterial({ color: col }));
      l.position.set(x, y, z); this.body.add(l); this.lights.push(l);
    }
    this.r = Math.max(1.0, (def.wid / 2 + def.len / 2) * 0.5 * 1.05);
    this.mass = def.mass; this.maxHp = def.hp; this.hp = def.hp;
    this.x = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0;
    this.alive = true; this.sink = 0; this.stuck = 0; this.rev = 0; this.age = 0; this.flash = 0; this.slip = 0; this.wreckT = 0;
    this.phase = Math.random() * 10;
    scene.add(this.mesh);
  }
  speed() { return Math.hypot(this.vx, this.vz); }
  remove() { scene.remove(this.mesh); }
}
const LIGHT_GEO = new THREE.BoxGeometry(0.42, 0.2, 0.3);

// мирные машины: те же модели, но медленнее и слабее
const CIV_DEFS = ['kopeyka', 'taxi', 'pickup', 'bus', 'icecream', 'garbage', 'cabrio', 'hotdog', 'golf', 'muscle', 'limo'].map(id => {
  const d = CARS.find(c => c.id === id);
  return { ...d, id: 'civ-' + id, spd: 11 + Math.random() * 3, acc: 8, hp: Math.round(d.hp * 0.6), perk: undefined, ability: undefined, civ: true };
});
let civs = [];
function spawnCiv() {
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2, d = R(45, 85), alongX = Math.random() < 0.5, dir = Math.random() < 0.5 ? 1 : -1;
    let [x, z] = World.snapRoad(player.x + Math.sin(a) * d, player.z + Math.cos(a) * d, alongX);
    const h = alongX ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    x += Math.cos(h) * 3; z -= Math.sin(h) * 3;
    if (!world.blockAt(x, z) || world.solidAt(x, z, 2)) continue;
    if ((x - player.x) ** 2 + (z - player.z) ** 2 < 40 * 40) continue;
    if ([...civs, ...cops].some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < 100)) continue;
    const c = new Car(CIV_DEFS[Math.floor(Math.random() * CIV_DEFS.length)], false);
    c.civ = true; c.x = x; c.z = z; c.h = h; c.dir = dir; c.alongX = alongX; c.lane = alongX ? z : x;
    c.vx = Math.sin(h) * c.def.spd; c.vz = Math.cos(h) * c.def.spd;
    civs.push(c);
    return;
  }
}
function civAI(c, dt) {
  const tx = c.alongX ? c.x + c.dir * 10 : c.lane, tz = c.alongX ? c.lane : c.z + c.dir * 10;
  const steer = clamp(wrap(Math.atan2(tx - c.x, tz - c.z) - c.h) * 2, -1, 1);
  drive(c, steer, 1, dt);
}

// следы шин
const SKID_CAP = 1800;
const skidMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.01, 0.75), new THREE.MeshBasicMaterial({ color: 0x1e1e1e, transparent: true, opacity: 0.42, depthWrite: false }), SKID_CAP);
skidMesh.frustumCulled = false; skidMesh.count = 0; scene.add(skidMesh);
let skidI = 0;
const _sm = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _sp = new THREE.Vector3(), _ss = new THREE.Vector3(1, 1, 1), _sy = new THREE.Vector3(0, 1, 0);
function skid(c) {
  const sf = world.surface(c.x, c.z);
  if (sf === 'water') return;
  const y = sf === 'side' ? 0.135 : sf === 'road' ? 0.025 : 0.055;
  const fx = Math.sin(c.h), fz = Math.cos(c.h), back = c.def.len * 0.33, side = c.def.wid * 0.38;
  _sq.setFromAxisAngle(_sy, c.h);
  for (const sd of [-1, 1]) {
    _sp.set(c.x - fx * back + fz * sd * side, y, c.z - fz * back - fx * sd * side);
    _sm.compose(_sp, _sq, _ss); skidMesh.setMatrixAt(skidI % SKID_CAP, _sm); skidI++;
  }
  skidMesh.count = Math.min(SKID_CAP, skidI); skidMesh.instanceMatrix.needsUpdate = true;
}

// вертолёт на высоком розыске: кружит над игроком и постреливает
const heli = (() => {
  const v = new Vox(), B = 0x1f2a44;
  v.box(0, 0, 0, 1.7, 1.5, 3.4, B, { top: 0x2b3a5c }); v.box(0, 0.45, 1.5, 1.4, 0.9, 0.6, 0x7fb3d5);
  v.box(0, 0.6, -2.8, 0.4, 0.4, 3.0, B); v.box(0, 0.5, -4.2, 0.12, 1.4, 0.7, B);
  v.box(0.8, -0.5, 0, 0.1, 0.1, 3.4, 0x222222); v.box(-0.8, -0.5, 0, 0.1, 0.1, 3.4, 0x222222);
  v.box(0.8, -0.45, 0.9, 0.08, 0.5, 0.08, 0x222222); v.box(-0.8, -0.45, 0.9, 0.08, 0.5, 0.08, 0x222222);
  v.box(0.8, -0.45, -0.9, 0.08, 0.5, 0.08, 0x222222); v.box(-0.8, -0.45, -0.9, 0.08, 0.5, 0.08, 0x222222);
  v.box(0, 1.5, 0, 0.3, 0.3, 0.3, 0x333333);
  const g = new THREE.Group(); const body = new THREE.Mesh(v.geometry(), MAT.lambert); body.castShadow = true; g.add(body);
  const rotor = new THREE.Group(); rotor.position.y = 1.85;
  const bm = new THREE.MeshLambertMaterial({ color: 0x111111 });
  rotor.add(new THREE.Mesh(new THREE.BoxGeometry(8, 0.06, 0.32), bm), new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 8), bm));
  rotor.children.forEach(m => m.castShadow = true);
  g.add(rotor); g.userData.rotor = rotor;
  const l1 = new THREE.Mesh(LIGHT_GEO, new THREE.MeshBasicMaterial({ color: 0xff1744 })), l2 = new THREE.Mesh(LIGHT_GEO, new THREE.MeshBasicMaterial({ color: 0x2979ff }));
  l1.position.set(0.5, -0.1, 1.0); l2.position.set(-0.5, -0.1, 1.0); g.add(l1, l2); g.userData.lights = [l1, l2];
  g.visible = false; scene.add(g); return g;
})();
function updateHeli(dt) {
  const p = player;
  if (!G.heli) { if (G.stars >= 4 && state === 'play') G.heli = { x: p.x + 60, z: p.z + 60, h: 0, a: 0, fire: 3 }; else { heli.visible = false; return; } }
  const H = G.heli; H.a += dt * 0.5;
  const tx = p.x + Math.sin(H.a) * 16, tz = p.z + Math.cos(H.a) * 16;
  const k = 1 - Math.exp(-1.2 * dt);
  const nx = H.x + (tx - H.x) * k, nz = H.z + (tz - H.z) * k;
  H.h = Math.atan2(p.x - nx, p.z - nz); H.x = nx; H.z = nz;
  heli.visible = true; heli.position.set(H.x, 21, H.z); heli.rotation.y = H.h; heli.rotation.x = 0.12;
  heli.userData.rotor.rotation.y += dt * 30;
  const on = Math.sin(G.t * 12) > 0; heli.userData.lights[0].visible = on; heli.userData.lights[1].visible = !on;
  H.fire -= dt;
  if (H.fire <= 0 && p.alive && state === 'play') {
    H.fire = R(3, 4.5);
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      glow.add({ x: H.x + (p.x - H.x) * t, y: 21 - 20 * t, z: H.z + (p.z - H.z) * t, vx: 0, vy: 0, vz: 0, g: 0, s: 0.22, t: -i * 0.02, life: 0.2, c: 0xfff176, rx: 0, ry: 0 });
    }
    for (let i = 0; i < 6; i++) glow.add({ x: p.x + R(-1.5, 1.5), y: 0.5, z: p.z + R(-1.5, 1.5), vx: R(-3, 3), vy: R(2, 5), vz: R(-3, 3), s: 0.2, t: 0, life: 0.4, c: 0xffe082, rx: 3, ry: 3 });
    damage(p, HEAVY[p.def.perk] ? 3 : 7, 'boom'); p.flash = 0.12; sfx.crash(0.3);
  }
}

// ================= состояние игры =================
let state = 'garage';
let player = null, cops = [], coins = [], kits = [];
let G = null; // текущий заезд

// Деньги — зелёная купюра со знаком $
const billGeo = (() => {
  const v = new Vox();
  v.box(0, 0, 0, 1.8, 0.95, 0.08, 0x2f8f46);
  v.box(0, 0.08, 0, 1.6, 0.79, 0.1, 0x6fcf87);
  const G = ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'];
  G.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') v.box(-0.18 + i * 0.09, 0.79 - j * 0.09, 0, 0.09, 0.09, 0.14, 0x1d5e30); }));
  v.box(-0.6, 0.38, 0, 0.18, 0.18, 0.12, 0x2f8f46); v.box(0.6, 0.38, 0, 0.18, 0.18, 0.12, 0x2f8f46);
  return v.geometry();
})();
const coinMesh = new THREE.InstancedMesh(billGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0d3a1a }), 80);
coinMesh.castShadow = true; coinMesh.frustumCulled = false; coinMesh.count = 0; scene.add(coinMesh);
// снаряды танка и волна НЛО
const shellGeo = new THREE.BoxGeometry(0.35, 0.35, 1.2), shellMat = new THREE.MeshBasicMaterial({ color: 0xffe082 });
const empRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
empRing.rotation.x = -Math.PI / 2; empRing.visible = false; scene.add(empRing);
const kitMesh = (() => {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.0), new THREE.MeshLambertMaterial({ color: 0x2ecc71, emissive: 0x0b4d26 }));
  const w = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 1.04), w), b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 1.04), w);
  g.add(box, a, b); g.visible = false; scene.add(g); return g;
})();

function newRun() {
  for (const c of cops) c.remove(); cops = [];
  for (const c of civs) c.remove(); civs = [];
  skidI = 0; skidMesh.count = 0; heli.visible = false;
  if (player) player.remove();
  coins = []; kits = []; debris.clear(); glow.clear();
  if (G && G.shells) for (const sh of G.shells) scene.remove(sh.mesh);
  empRing.visible = false;
  world.clear();
  const def = CARS.find(c => c.id === save.sel) || CARS[0];
  player = new Car(def, false);
  player.x = T / 2; player.z = 30; player.h = Math.PI;
  player.vx = 0; player.vz = -8;
  world.update(player.x, player.z, true);
  G = { t: 0, score: 0, coins: 0, wrecks: 0, stars: 1, civT: 0, arrest: 0, heli: null, spawnT: 2.5, coinT: 3, kitT: 12, bonusDone: new Set(), trail: [], trailT: 0, shells: [], cd: 2, emp: -1, shake: 0, dieT: 0, cause: '', camX: player.x, camZ: player.z, look: new THREE.Vector3(player.x, 0, player.z) };
  camPos.set(player.x + 30, 63, player.z + 37); camLook.set(player.x, 0, player.z);
  for (let i = 0; i < 2; i++) spawnCoins(true);
  state = 'play';
  save.runs++; persist();
  showScreen('hud');
  updateHud(true);
  if (!save.tut) { $('tut').classList.remove('hidden'); setTimeout(() => $('tut').classList.add('hidden'), 4000); save.tut = true; persist(); }
}

// ================= ввод =================
const input = { l: false, r: false };
const ptrs = new Map();
const keys = new Set();
function syncInput() {
  let l = keys.has('ArrowLeft') || keys.has('KeyA'), r = keys.has('ArrowRight') || keys.has('KeyD');
  for (const side of ptrs.values()) { if (side < 0) l = true; else r = true; }
  input.l = l; input.r = r;
}
const playArea = $('touch');
playArea.addEventListener('pointerdown', e => { sfx.unlock(); ptrs.set(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1); syncInput(); e.preventDefault(); });
const endPtr = e => { ptrs.delete(e.pointerId); syncInput(); };
window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);
window.addEventListener('keydown', e => {
  keys.add(e.code); syncInput(); sfx.unlock();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pause(); else if (state === 'pause') resume(); }
  if ((e.code === 'Space' || e.code === 'Enter') && state === 'over') newRun();
});
window.addEventListener('keyup', e => { keys.delete(e.code); syncInput(); });
document.addEventListener('touchmove', e => { if (state === 'play') e.preventDefault(); }, { passive: false });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (state === 'play') pause(); sfx.suspend(); } });

// ================= физика =================
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function drive(c, steer, throttle, dt) {
  const d = c.def;
  const sname = world.surface(c.x, c.z), surf = SURF[sname];
  const floats = d.perk === 'float';
  let maxS = d.spd * (c.cop ? G.copMul * (c.boost || 1) : 1), grip = d.grip;
  if (surf.water) { if (floats) maxS *= 0.78; }
  else if (!(d.hover && sname !== 'ice')) { maxS *= surf.spd; grip *= surf.grip; }
  if (d.hover) grip = d.grip * (sname === 'ice' ? 0.6 : 1);
  let fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h);
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
  if (throttle > 0) { const top = maxS * Math.min(1, throttle); if (vf < top) vf = Math.min(top, vf + d.acc * dt * (1 - 0.6 * Math.max(0, vf) / maxS)); else vf -= 8 * dt; }
  else if (throttle < 0) vf = Math.max(c === player ? -3 : -9, vf - 26 * dt);
  else vf *= Math.exp(-1.5 * dt);
  vf -= Math.abs(steer) * vf * 0.22 * dt;
  vl *= Math.exp(-grip * dt);
  c.slip = Math.abs(vl);
  c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
  const sf = clamp(Math.abs(vf) / 7, 0, 1) * (vf < -0.5 ? -1 : 1);
  c.h = wrap(c.h + steer * d.turn * sf * dt);
  c.x += c.vx * dt; c.z += c.vz * dt;
  c.steer = steer;
  if (surf.water && !floats && !c.sink) startSink(c);
}

function damage(c, amount, cause) {
  if (!c.alive || amount <= 0) return;
  c.hp -= amount; c.flash = 0.12;
  if (c.hp <= 0) kill(c, cause || 'boom');
}

function kill(c, cause) {
  if (!c.alive) return;
  c.alive = false; c.hp = 0;
  if (cause !== 'sink') {
    c.body.material = MAT.wreck; for (const l of c.lights) l.visible = false;
    explosion(c.x, c.z, c.cop ? 1 : 1.5); sfx.boom();
    G.shake = Math.max(G.shake, c.cop ? 0.5 : 1.2);
  }
  c.vx *= 0.3; c.vz *= 0.3; c.wreckT = 0;
  if (c.cop) {
    G.wrecks++; G.score += c.def.score;
    toast(`+${c.def.score}`);
  } else if (c === player) {
    G.cause = cause; G.dieT = 0; state = 'dying';
  }
}

function startSink(c) {
  c.sink = 0.001; sfx.splash();
  for (let i = 0; i < 18; i++) glow.add({ x: c.x + R(-1.5, 1.5), y: 0.2, z: c.z + R(-1.5, 1.5), vx: R(-2, 2), vy: R(4, 9), vz: R(-2, 2), g: 20, s: R(0.3, 0.7), t: 0, life: R(0.5, 1), c: 0xd6f1ff, rx: 2, ry: 2 });
  kill(c, 'sink');
}

function impact(c, j, isStatic) {
  if (!c.alive) return;
  const heavy = HEAVY[c.def.perk];
  if (c !== player) damage(c, Math.max(0, j - 7) * 3.2);
  else damage(c, Math.max(0, j - 6) * (heavy ? 0.8 : 1.6), 'boom');
  if (j > 5 && (c === player || dist2(c, player) < 1600)) {
    sfx.crash(j / 25);
    for (let i = 0; i < Math.min(8, j / 2); i++) glow.add({ x: c.x + R(-1, 1), y: R(0.5, 1.5), z: c.z + R(-1, 1), vx: R(-6, 6), vy: R(2, 7), vz: R(-6, 6), s: 0.18, t: 0, life: 0.4, c: 0xffe082, rx: 4, ry: 4 });
    if (c === player) G.shake = Math.max(G.shake, Math.min(0.8, j / 30));
  }
}
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

function collideStatic(c) {
  const r = c.r * 0.82;
  for (const b of world.near(c.x, c.z, r + 1)) {
    for (const s of b.solids) {
      let nx, nz, d;
      if (s.b) {
        const px = clamp(c.x, s.x0, s.x1), pz = clamp(c.z, s.z0, s.z1);
        nx = c.x - px; nz = c.z - pz; d = Math.hypot(nx, nz);
        if (d >= r) continue;
        if (d < 1e-4) {
          const dl = c.x - s.x0, dr = s.x1 - c.x, dt = c.z - s.z0, db = s.z1 - c.z, m = Math.min(dl, dr, dt, db);
          if (m === dl) { nx = -1; nz = 0; d = -dl; } else if (m === dr) { nx = 1; nz = 0; d = -dr; } else if (m === dt) { nx = 0; nz = -1; d = -dt; } else { nx = 0; nz = 1; d = -db; }
        } else { nx /= d; nz /= d; }
      } else {
        nx = c.x - s.x; nz = c.z - s.z; d = Math.hypot(nx, nz);
        if (d >= r + s.r) continue;
        if (d < 1e-4) { nx = 1; nz = 0; } else { nx /= d; nz /= d; }
        d -= s.r;
      }
      const pen = r - d;
      c.x += nx * pen; c.z += nz * pen;
      const vn = c.vx * nx + c.vz * nz;
      if (vn < 0) {
        c.vx -= 1.35 * vn * nx; c.vz -= 1.35 * vn * nz;
        c.vx *= 0.9; c.vz *= 0.9;
        impact(c, -vn, true);
      }
    }
    for (const p of b.props) {
      if (!p.alive) continue;
      if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 > (c.r * 0.9 + p.r) ** 2) continue;
      const col = world.breakProp(p);
      const sp = c.speed();
      burst(p.x, 1, p.z, col, 7, Math.max(4, sp * 0.4), 0.35);
      const slow = HEAVY[c.def.perk] ? 0.985 : 0.93;
      c.vx *= slow; c.vz *= slow;
      if (c === player || dist2(c, player) < 900) sfx.thud();
      if (c === player) G.score += 1;
    }
  }
}

function collideCars(list) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.sink || b.sink) continue;
    let nx = b.x - a.x, nz = b.z - a.z; const rr = (a.r + b.r) * 0.85;
    const d2 = nx * nx + nz * nz;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 0.001; nx /= d; nz /= d;
    const ma = a.alive ? a.mass : a.mass * 3, mb = b.alive ? b.mass : b.mass * 3;
    const pen = rr - d, tot = ma + mb;
    a.x -= nx * pen * mb / tot; a.z -= nz * pen * mb / tot;
    b.x += nx * pen * ma / tot; b.z += nz * pen * ma / tot;
    const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (vrel >= 0) continue;
    const J = -1.4 * vrel / (1 / ma + 1 / mb);
    a.vx -= J / ma * nx; a.vz -= J / ma * nz; b.vx += J / mb * nx; b.vz += J / mb * nz;
    const imp = -vrel;
    hitCar(a, b, imp, mb / tot); hitCar(b, a, imp, ma / tot);
  }
}
function hitCar(c, other, j, share) {
  if (!c.alive) return;
  if (c.cop && other === player && player.alive && player.def.perk === 'crush') { c.body.scale.y = 0.35; kill(c, 'boom'); return; }
  const frag = c !== player ? (c.civ ? 2.4 : 3.4) : (HEAVY[c.def.perk] ? 0.9 : 1.4);
  let dmg = Math.max(0, j - 3) * frag * 2 * share;
  if (c.cop && !other.cop) dmg *= 1.25;
  damage(c, dmg, 'boom');
  if (j > 4 && (c === player || other === player)) {
    sfx.crash(j / 22); G.shake = Math.max(G.shake, Math.min(0.7, j / 25));
    for (let i = 0; i < 6; i++) glow.add({ x: (c.x + other.x) / 2, y: 1, z: (c.z + other.z) / 2, vx: R(-7, 7), vy: R(2, 8), vz: R(-7, 7), s: 0.2, t: 0, life: 0.45, c: 0xffe082, rx: 4, ry: 4 });
  }
}

// ================= полиция =================
const STAR_TIME = 20;
const MAX_COPS = [0, 2, 3, 5, 7, 9];
function pickCopType(stars) {
  const r = Math.random();
  if (stars >= 5 && r < 0.3) return 'jeep';
  if (stars >= 4 && r < (stars >= 5 ? 0.18 : 0.1)) return 'armored';
  if (stars >= 3 && r < 0.35) return 'swat';
  if (stars >= 2 && r < 0.6) return 'interceptor';
  return 'cruiser';
}

function spawnCop() {
  for (let tries = 0; tries < 12; tries++) {
    const a = Math.random() * Math.PI * 2, d = R(58, 72);
    let [x, z] = World.snapRoad(player.x + Math.sin(a) * d, player.z + Math.cos(a) * d, Math.random() < 0.5);
    if (world.solidAt(x, z, 2.5) || !world.blockAt(x, z)) continue;
    if ((x - player.x) ** 2 + (z - player.z) ** 2 < 45 * 45) continue;
    const c = new Car(COPS[pickCopType(G.stars)], true);
    c.x = x; c.z = z; c.h = Math.atan2(player.x - x, player.z - z);
    c.vx = Math.sin(c.h) * 10; c.vz = Math.cos(c.h) * 10;
    cops.push(c);
    return;
  }
}

function copAI(c, dt) {
  const p = player;
  if (c.stun > 0) { c.stun -= dt; for (const l of c.lights) l.visible = false; drive(c, 0, 0, dt); return; }
  const dx0 = p.x - c.x, dz0 = p.z - c.z, dist = Math.hypot(dx0, dz0);
  const lead = clamp(dist / 22, 0, 1.1) * (p.alive ? 1 : 0);
  const tx = p.x + p.vx * lead - c.x, tz = p.z + p.vz * lead - c.z;
  let steer = clamp(wrap(Math.atan2(tx, tz) - c.h) * 2.6, -1, 1);
  const sp = c.speed();
  // объезд препятствий, если игрок ещё далеко
  if (dist > 14) {
    const pd = 5 + sp * 0.4;
    const probe = a => world.solidAt(c.x + Math.sin(c.h + a) * pd, c.z + Math.cos(c.h + a) * pd, 1.2);
    if (probe(0)) { if (!probe(0.6)) steer = 1; else if (!probe(-0.6)) steer = -1; else steer = Math.sign(steer || 1); }
  }
  c.boost = dist > 50 ? 1.12 : 1;
  let throttle = p.alive ? 1 : 0.2;
  if (p.alive && dist < 10 && p.speed() < 5) throttle = 0.45;  // прижимают, чтобы арестовать
  if (c.rev > 0) { c.rev -= dt; throttle = -1; steer = -steer; }
  else if (sp < 2.5 && c.age > 1.5) { c.stuck += dt; if (c.stuck > 1.1) { c.rev = 0.9; c.stuck = 0; } }
  else c.stuck = 0;
  drive(c, steer, throttle, dt);
}

// ================= деньги и аптечки =================
// Купюры редкие: несколько штук вокруг игрока + «денежные места» (золотые площадки) на карте
function spawnCoins(initial) {
  for (let tries = 0; tries < 10; tries++) {
    const a = Math.random() * Math.PI * 2, d = initial ? R(20, 50) : R(40, 85);
    const x = player.x + Math.sin(a) * d, z = player.z + Math.cos(a) * d;
    if (!world.blockAt(x, z) || world.solidAt(x, z, 1.5) || world.surface(x, z) === 'ice') continue;
    coins.push({ x, z, ph: Math.random() * 6 });
    return;
  }
}
const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cp = new THREE.Vector3(), _cs = new THREE.Vector3(1, 1, 1), _cy = new THREE.Vector3(0, 1, 0);
function updateCoins(dt) {
  G.coinT -= dt;
  if (coins.filter(c => !c.bonus).length < 4 && G.coinT <= 0) { spawnCoins(false); G.coinT = R(2.5, 5); }
  for (const b of world.blocks.values()) {
    if (!b.bonus || G.bonusDone.has(b.k)) continue;
    G.bonusDone.add(b.k);
    const { x, z } = b.bonus;
    coins.push({ x, z, ph: 0, bonus: true });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; coins.push({ x: x + Math.sin(a) * 3.2, z: z + Math.cos(a) * 3.2, ph: a, bonus: true }); }
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.3; coins.push({ x: x + Math.sin(a) * 6, z: z + Math.cos(a) * 6, ph: a, bonus: true }); }
  }
  coins = coins.filter(c => {
    const d2 = (c.x - player.x) ** 2 + (c.z - player.z) ** 2;
    if (d2 > (c.bonus ? 170 : 110) ** 2) return false;
    if (player.alive && d2 < (player.r + 1.4) ** 2) {
      G.coins += COIN_VALUE; save.coins += COIN_VALUE; sfx.coin();
      for (let i = 0; i < 6; i++) glow.add({ x: c.x, y: 1.2, z: c.z, vx: R(-3, 3), vy: R(3, 7), vz: R(-3, 3), s: 0.25, t: 0, life: 0.5, c: 0x8ef0a8, rx: 3, ry: 3 });
      return false;
    }
    return true;
  });
  const t = G.t;
  const n = Math.min(coins.length, 80);
  for (let i = 0; i < n; i++) {
    const c = coins[i];
    _cq.setFromAxisAngle(_cy, t * 2.5 + c.ph); _cp.set(c.x, 0.9 + Math.sin(t * 4 + c.ph) * 0.2, c.z);
    _cm.compose(_cp, _cq, _cs); coinMesh.setMatrixAt(i, _cm);
  }
  coinMesh.count = n; coinMesh.instanceMatrix.needsUpdate = true;
  // аптечка
  G.kitT -= dt;
  if (!kits.length && G.kitT <= 0) {
    G.kitT = R(14, 22);
    const a = Math.random() * Math.PI * 2, [x, z] = World.snapRoad(player.x + Math.sin(a) * 50, player.z + Math.cos(a) * 50, Math.random() < 0.5);
    if (!world.solidAt(x, z, 1)) kits.push({ x, z });
  }
  kits = kits.filter(k => {
    const d2 = (k.x - player.x) ** 2 + (k.z - player.z) ** 2;
    if (d2 > 120 * 120) return false;
    if (player.alive && d2 < (player.r + 1.4) ** 2) { player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.4); sfx.heal(); toast('✚'); return false; }
    return true;
  });
  kitMesh.visible = kits.length > 0;
  if (kits.length) { kitMesh.position.set(kits[0].x, 1.3 + Math.sin(t * 4) * 0.2, kits[0].z); kitMesh.rotation.y = t * 2; }
}

// ================= способности легендарных машин =================
function abilities(p, dt) {
  const perk = p.def.perk;
  if (perk === 'jet') {
    // огненный след: копы, наехавшие на него, сгорают
    G.trailT -= dt;
    if (G.trailT <= 0 && p.speed() > 8) {
      G.trailT = 0.05;
      const x = p.x - Math.sin(p.h) * 3.2, z = p.z - Math.cos(p.h) * 3.2;
      G.trail.push({ x, z, t: 0 });
      glow.add({ x, y: 0.4, z, vx: R(-0.5, 0.5), vy: R(0.5, 1.5), vz: R(-0.5, 0.5), g: 0, s: R(0.9, 1.3), grow: -0.4, t: 0, life: 1.1, c: Math.random() < 0.5 ? 0xff9800 : 0xff5722, fade: true, rx: 1, ry: 1 });
    }
    G.trail = G.trail.filter(q => (q.t += dt) < 1.1);
    for (const c of cops) if (c.alive) for (const q of G.trail) if ((c.x - q.x) ** 2 + (c.z - q.z) ** 2 < 5) { kill(c, 'boom'); break; }
  } else if (perk === 'cannon') {
    // танк сам стреляет по ближайшему копу впереди
    G.cd -= dt;
    if (G.cd <= 0) {
      let best = null, bd = 45 * 45;
      for (const c of cops) {
        if (!c.alive) continue;
        const d2 = dist2(c, p); if (d2 > bd) continue;
        if (Math.abs(wrap(Math.atan2(c.x - p.x, c.z - p.z) - p.h)) > 0.75) continue;
        best = c; bd = d2;
      }
      if (best) {
        G.cd = 1.5;
        const a = Math.atan2(best.x - p.x, best.z - p.z), sx = p.x + Math.sin(a) * 3.6, sz = p.z + Math.cos(a) * 3.6;
        const mesh = new THREE.Mesh(shellGeo, shellMat); mesh.position.set(sx, 1.25, sz); mesh.rotation.y = a; scene.add(mesh);
        G.shells.push({ x: sx, z: sz, vx: Math.sin(a) * 75, vz: Math.cos(a) * 75, life: 0.8, mesh });
        for (let i = 0; i < 8; i++) glow.add({ x: sx, y: 1.25, z: sz, vx: Math.sin(a) * 6 + R(-3, 3), vy: R(0, 3), vz: Math.cos(a) * 6 + R(-3, 3), g: 0, s: R(0.5, 0.9), grow: 0.5, t: 0, life: 0.25, c: 0xffd54f, rx: 2, ry: 2 });
        sfx.crash(0.7); G.shake = Math.max(G.shake, 0.3);
      } else G.cd = 0.25;
    }
  } else if (p.def.emp) {
    // НЛО: волна, которая глушит копов вокруг
    G.cd -= dt;
    if (G.cd <= 0) {
      let any = false; for (const c of cops) if (c.alive && dist2(c, p) < 22 * 22) any = true;
      if (any) {
        G.cd = 6; G.emp = 0; sfx.heal();
        for (const c of cops) if (c.alive && dist2(c, p) < 22 * 22) { c.stun = 3; c.vx *= 0.3; c.vz *= 0.3; }
      } else G.cd = 0.3;
    }
  }
  if (G.emp >= 0) {
    G.emp += dt;
    const k = G.emp / 0.6;
    empRing.visible = k < 1; empRing.position.set(p.x, 0.5, p.z); empRing.scale.setScalar(1 + k * 21); empRing.material.opacity = 0.75 * (1 - k);
    if (k >= 1) G.emp = -1;
  }
}
function updateShells(dt) {
  G.shells = G.shells.filter(sh => {
    sh.life -= dt; sh.x += sh.vx * dt; sh.z += sh.vz * dt; sh.mesh.position.set(sh.x, 1.25, sh.z);
    let hit = sh.life <= 0 || world.solidAt(sh.x, sh.z, 0);
    for (const c of cops) if (c.alive && (c.x - sh.x) ** 2 + (c.z - sh.z) ** 2 < (c.r + 0.6) ** 2) { kill(c, 'boom'); hit = true; break; }
    if (hit) { if (sh.life > 0) explosion(sh.x, sh.z, 0.5); scene.remove(sh.mesh); return false; }
    return true;
  });
}

// ================= шаг игры =================
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function step(dt) {
  G.t += dt;
  const p = player;
  if (state === 'play') {
    const stars = Math.min(5, 1 + Math.floor(G.t / STAR_TIME));
    if (stars > G.stars) { G.stars = stars; sfx.star(); toast('★'); }
    G.score += dt;
  }
  G.copMul = 1 + 0.035 * (G.stars - 1);

  // игрок
  if (p.alive) {
    const steer = (input.l ? 1 : 0) - (input.r ? 1 : 0);
    const brake = input.l && input.r;
    drive(p, brake ? 0 : steer, brake ? -1 : 1, dt);
    if (p.def.perk === 'regen' && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 3 * dt);
    abilities(p, dt);
  } else if (!p.sink) {
    p.vx *= Math.exp(-2 * dt); p.vz *= Math.exp(-2 * dt); p.x += p.vx * dt; p.z += p.vz * dt;
  }

  // полиция
  if (state === 'play') {
    G.spawnT -= dt;
    const active = cops.filter(c => c.alive).length;
    if (G.spawnT <= 0 && active < MAX_COPS[G.stars]) { spawnCop(); G.spawnT = 1.3; }
  }
  for (const c of cops) {
    c.age += dt;
    if (c.alive) copAI(c, dt);
    else if (!c.sink) { c.vx *= Math.exp(-2.5 * dt); c.vz *= Math.exp(-2.5 * dt); c.x += c.vx * dt; c.z += c.vz * dt; c.wreckT += dt; }
  }

  G.civT -= dt;
  if (G.civT <= 0 && civs.filter(c => c.alive).length < 7) { spawnCiv(); G.civT = 0.7; }
  for (const c of civs) {
    if (c.alive) civAI(c, dt);
    else if (!c.sink) { c.vx *= Math.exp(-2.5 * dt); c.vz *= Math.exp(-2.5 * dt); c.x += c.vx * dt; c.z += c.vz * dt; c.wreckT += dt; }
  }
  updateHeli(dt);

  const all = [p, ...cops, ...civs];
  collideCars(all);
  for (const c of all) if (!c.sink) collideStatic(c);

  // утопленники и обломки
  for (const c of all) if (c.sink) { c.sink += dt; c.vx *= Math.exp(-3 * dt); c.vz *= Math.exp(-3 * dt); c.x += c.vx * dt; c.z += c.vz * dt; }
  civs = civs.filter(c => {
    const gone = dist2(c, p) > 120 * 120 || c.sink > 2.5 || c.wreckT > 30;
    if (gone) c.remove();
    return !gone;
  });
  // арест: стоишь на месте, а рядом копы
  if (p.alive && state === 'play') {
    const boxed = p.speed() < 4.5 && cops.some(c => c.alive && !(c.stun > 0) && dist2(c, p) < (p.r + c.r + 2.2) ** 2);
    G.arrest = boxed ? G.arrest + dt : Math.max(0, G.arrest - dt);
    if (G.arrest > 1.3) { p.alive = false; G.cause = 'busted'; G.dieT = 0; state = 'dying'; sfx.siren(1, 0); }
  }
  $('arrest').style.opacity = Math.min(1, G.arrest / 1.3);
  cops = cops.filter(c => {
    const d2 = dist2(c, p);
    const gone = (c.alive && d2 > 125 * 125) || (!c.alive && (c.wreckT > 30 || d2 > 110 * 110 || c.sink > 2.5));
    if (gone) c.remove();
    return !gone;
  });

  updateShells(dt);
  updateCoins(dt);
  world.update(p.x, p.z);

  if (state === 'dying') { G.dieT += dt; if (G.dieT > 1.8) gameOver(); }
}

// ================= отрисовка объектов =================
function syncCar(c, t, dt) {
  c.mesh.position.set(c.x, c.def.hover ? Math.sin(t * 3 + c.phase) * 0.15 : 0, c.z);
  c.mesh.rotation.y = c.h;
  if (c.sink) { c.mesh.position.y = -Math.min(3, c.sink * 1.6); c.body.rotation.x = Math.min(0.5, c.sink * 0.3); }
  // крен в повороте
  const roll = clamp((c.steer || 0) * c.speed() * 0.006, -0.12, 0.12);
  c.body.rotation.z += (-roll - c.body.rotation.z) * Math.min(1, dt * 8);
  if (c.alive) {
    if (c.lights.length && !(c.stun > 0)) { const on = Math.sin(t * 14 + c.phase) > 0; c.lights[0].visible = on; c.lights[1].visible = !on; }
    if (c.flash > 0) { c.flash -= dt; c.body.material = MAT.flash; } else c.body.material = MAT.lambert;
    // дым при дрифте и при сильных повреждениях
    if (!c.def.hover && (c.slip > 3.2 || (c === player && input.l && input.r && c.speed() > 3)) && dist2(c, player) < 3600) skid(c);
    if (c.slip > 6 && Math.random() < 0.5 && !c.def.hover) smoke(c.x - Math.sin(c.h) * c.def.len * 0.4, 0.4, c.z - Math.cos(c.h) * c.def.len * 0.4, 0xdddddd, 0.8);
    if (c.hp < c.maxHp * 0.35 && Math.random() < 0.3) smoke(c.x, 1.4, c.z, 0x555555, 0.9);
    if (c.def.perk === 'jet' && Math.random() < 0.9) {
      const bx = c.x - Math.sin(c.h) * 2.9, bz = c.z - Math.cos(c.h) * 2.9;
      glow.add({ x: bx, y: 0.85, z: bz, vx: -Math.sin(c.h) * 8 + R(-1, 1), vy: R(-0.5, 0.5), vz: -Math.cos(c.h) * 8 + R(-1, 1), g: 0, s: R(0.4, 0.7), grow: -0.6, t: 0, life: 0.25, c: Math.random() < 0.5 ? 0xffb300 : 0xff5722, rx: 3, ry: 3 });
    }
  } else if (!c.sink && c.wreckT < 6 && Math.random() < 0.12) smoke(c.x, 1.5, c.z, 0x3d3d3d, 0.8);
}

function render(t, dt) {
  if (state === 'garage' || state === 'wheel' || !G) {
    const inWheel = state === 'wheel';
    gTurn.visible = !inWheel; machine.visible = inWheel;
    if (prizeMesh) prizeMesh.visible = inWheel;
    if (!inWheel) machine.userData.drop.visible = false;
    gTurn.rotation.y += dt * 0.6;
    if (inWheel) updateMachine(dt, t);
    const size = inWheel ? 7.2 : (gCam.userData.size || 4), portrait = gCam.aspect < 0.9;
    const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(gCam.fov / 2)) * gCam.aspect);
    const d = Math.max(size * 2.2, (size * (portrait ? 1.05 : 1.6)) / Math.tan(hf / 2));
    const el = 0.36;
    gCam.position.set(Math.sin(0.5) * d * Math.cos(el), d * Math.sin(el) + 0.8, Math.cos(0.5) * d * Math.cos(el));
    gCam.lookAt(inWheel ? 0.4 : 0, inWheel ? 2.4 : 0.8, inWheel ? 0.4 : 0);
    if (inWheel) gCam.position.y += 1.6;
    if (gMesh) gMesh.position.y = CARS[gIndex].hover ? Math.sin(t * 2) * 0.15 : 0;
    renderer.render(gScene, gCam);
    return;
  }
  const p = player;
  for (const c of [p, ...cops, ...civs]) syncCar(c, t, dt);
  debris.update(dt); glow.update(dt);

  const portrait = camera.aspect < 0.9;
  const sp = p.speed();
  const zoom = (portrait ? 1.75 : 1.3) * (1 + clamp(sp / 40, 0, 1) * 0.18);
  const lead = portrait ? 0.55 : 0.4;
  const tx = p.x + p.vx * lead, tz = p.z + p.vz * lead;
  const k = 1 - Math.exp(-5 * dt);
  camLook.x += (tx - camLook.x) * k; camLook.z += (tz - camLook.z) * k; camLook.y = 0;
  const target = new THREE.Vector3(camLook.x + 17 * zoom, 36 * zoom, camLook.z + 21 * zoom);
  camPos.lerp(target, 1 - Math.exp(-4 * dt));
  camera.position.copy(camPos);
  if (G.shake > 0) { camera.position.x += R(-1, 1) * G.shake; camera.position.y += R(-1, 1) * G.shake; G.shake = Math.max(0, G.shake - dt * 2.5); }
  camera.lookAt(camLook);
  scene.fog.near = 75 * zoom; scene.fog.far = 140 * zoom;
  sun.position.set(camLook.x - 30, 60, camLook.z + 20);
  sun.target.position.copy(camLook);
  renderer.render(scene, camera);
}

// ================= интерфейс =================
const screens = ['garage', 'hud', 'over', 'pause', 'wheel'];
function showScreen(name, keepHud) {
  for (const s of screens) $(s).classList.toggle('hidden', !(s === name || (keepHud && s === 'hud')));
  $('touch').style.display = name === 'hud' ? 'block' : 'none';
}

let toastId = 0;
function toast(text) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; el.dataset.id = ++toastId;
  const box = $('toasts'); box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), 1800);
}

let hudCache = {};
function updateHud(force) {
  const p = player;
  const hp = Math.max(0, p.hp / p.maxHp);
  const v = { hp: Math.round(hp * 100), score: Math.floor(G.score), stars: G.stars, coins: save.coins };
  if (force || v.hp !== hudCache.hp) { $('h-hp').style.width = v.hp + '%'; $('h-hp').style.background = hp > 0.5 ? '#4ade80' : hp > 0.25 ? '#facc15' : '#ef4444'; }
  if (force || v.score !== hudCache.score) $('h-score').textContent = v.score;
  if (force || v.stars !== hudCache.stars) $('h-stars').innerHTML = [1, 2, 3, 4, 5].map(i => `<span class="${i <= v.stars ? 'on' : ''}">★</span>`).join('');
  if (force || v.coins !== hudCache.coins) $('h-coins').textContent = v.coins;
  hudCache = v;
}

function gameOver() {
  state = 'over';
  const score = Math.floor(G.score);
  const record = score > save.best;
  if (record) save.best = score;
  save.cops += G.wrecks;
  persist();
  $('o-title').textContent = G.cause === 'sink' ? 'Буль!' : G.cause === 'busted' ? 'Попался!' : 'Бабах!';
  $('o-score').textContent = score;
  $('o-record').classList.toggle('hidden', !record);
  $('o-best').textContent = save.best;
  $('o-coins').textContent = '+' + G.coins;
  $('o-cops').textContent = G.wrecks;
  const s = Math.floor(G.t); $('o-time').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const canSpin = save.coins >= WHEEL_PRICE && lockedCars().length;
  $('o-wheel').classList.toggle('hidden', !canSpin);
  $('o-need').classList.toggle('hidden', canSpin || !lockedCars().length);
  $('o-need').innerHTML = `ещё <span class="coin"></span> ${WHEEL_PRICE - save.coins} до 🎰`;
  showScreen('over');
  sfx.engine(0, false); sfx.siren(0, 0);
}

function pause() { if (state !== 'play') return; state = 'pause'; showScreen('pause', true); sfx.engine(0, false); sfx.siren(0, 0); }
function resume() { if (state !== 'pause') return; state = 'play'; showScreen('hud'); ptrs.clear(); syncInput(); last = performance.now(); }

function toGarage() {
  state = 'garage';
  gIndex = Math.max(0, CARS.findIndex(c => c.id === save.sel));
  showGarageCar(); refreshGarage(); showScreen('garage');
  sfx.engine(0, false); sfx.siren(0, 0);
}

function refreshGarage() {
  const def = CARS[gIndex], owned = save.owned.includes(def.id), rar = RARITY[def.rarity];
  $('g-coins').textContent = save.coins;
  $('g-best').textContent = save.best;
  $('g-name').textContent = owned ? def.name : '???';
  const rb = $('g-rarity'); rb.style.background = rar.color; rb.textContent = rar.name;
  platRing.material.color.set(rar.color);
  const ab = $('g-ability'); ab.textContent = def.ability || ''; ab.classList.toggle('hidden', !def.ability);
  $('g-play').textContent = owned ? 'ПОЕХАЛИ!' : '🔒';
  $('g-play').classList.toggle('locked', !owned);
  $('g-count').textContent = `${save.owned.length}/${CARS.length}`;
  $('g-wheel').classList.toggle('dim', save.coins < WHEEL_PRICE || !lockedCars().length);
  $('g-sound').textContent = save.sound ? '🔊' : '🔇';
  $('g-hq').textContent = save.hq ? 'HD' : 'SD';
}

// ---------- миниатюры машин (для каталога и барабана) ----------
let thumbR = null, tScene = null, tCam = null;
const thumbs = new Map();
function thumb(def, locked) {
  const key = def.id + (locked ? '-l' : '');
  if (thumbs.has(key)) return thumbs.get(key);
  if (!thumbR) {
    thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbR.setPixelRatio(1); thumbR.setSize(192, 192, false);
    tScene = new THREE.Scene();
    tScene.add(new THREE.HemisphereLight(0xe6edff, 0x3a3348, 1.9));
    const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(6, 10, 8); tScene.add(k);
    tCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  }
  const m = new THREE.Mesh(carGeometry(def), locked ? silMat : MAT.lambert); m.rotation.y = 0.5; tScene.add(m);
  const size = Math.max(def.len, def.wid * 1.4, 3.2), d = size * 2.3;
  tCam.position.set(Math.sin(0.6) * d * 0.88, d * 0.5 + 0.6, Math.cos(0.6) * d * 0.88); tCam.lookAt(0, 0.7, 0);
  thumbR.render(tScene, tCam); tScene.remove(m);
  const c = document.createElement('canvas'); c.width = c.height = 192; c.getContext('2d').drawImage(thumbR.domElement, 0, 0);
  thumbs.set(key, c);
  return c;
}

// ---------- каталог ----------
function openCatalog() {
  const grid = $('cat-grid'); grid.innerHTML = '';
  const order = { legend: 0, epic: 1, rare: 2, common: 3 };
  [...CARS].sort((a, b) => order[a.rarity] - order[b.rarity]).forEach(def => {
    const owned = save.owned.includes(def.id);
    const cell = document.createElement('button');
    cell.className = 'cell' + (owned ? '' : ' lock') + (def.id === save.sel ? ' sel' : '');
    cell.style.setProperty('--rc', RARITY[def.rarity].color);
    const img = document.createElement('img'); img.src = thumb(def, !owned).toDataURL(); img.alt = '';
    cell.appendChild(img);
    if (owned) { const nm = document.createElement('span'); nm.textContent = def.name.replace(' «Батя»', ''); cell.appendChild(nm); }
    cell.addEventListener('click', () => {
      sfx.click();
      if (!owned) { cell.classList.remove('shake'); void cell.offsetWidth; cell.classList.add('shake'); return; }
      save.sel = def.id; persist(); gIndex = CARS.indexOf(def); showGarageCar(); refreshGarage(); closeCatalog();
    });
    grid.appendChild(cell);
  });
  $('cat-count').textContent = `${save.owned.length}/${CARS.length}`;
  $('catalog').classList.remove('hidden');
}
function closeCatalog() { $('catalog').classList.add('hidden'); }

function browse(d) {
  gIndex = (gIndex + d + CARS.length) % CARS.length;
  const def = CARS[gIndex];
  if (save.owned.includes(def.id)) { save.sel = def.id; persist(); }
  sfx.click(); showGarageCar(); refreshGarage();
}

// свайп в гараже
let swipeX = null;
window.addEventListener('pointerdown', e => { if (state !== 'garage' || e.target.closest('button')) return; swipeX = e.clientX; });
window.addEventListener('pointerup', e => { if (swipeX == null || state !== 'garage') return; const dx = e.clientX - swipeX; swipeX = null; if (Math.abs(dx) > 40) browse(dx < 0 ? 1 : -1); });

const btn = (id, fn) => $(id).addEventListener('click', e => { sfx.unlock(); fn(e); });
btn('g-prev', () => browse(-1));
btn('g-next', () => browse(1));
btn('g-play', () => {
  const def = CARS[gIndex];
  if (!save.owned.includes(def.id)) { openWheel(); return; }
  save.sel = def.id; persist(); sfx.click(); newRun();
});
btn('g-wheel', () => openWheel());
btn('g-cat', () => openCatalog());
btn('cat-close', () => closeCatalog());
btn('g-sound', () => { save.sound = !save.sound; sfx.setOn(save.sound); persist(); refreshGarage(); });
btn('g-hq', () => { save.hq = !save.hq; persist(); applyQuality(); refreshGarage(); });
btn('h-pause', () => pause());
btn('p-resume', () => resume());
btn('p-quit', () => { if (G) { G.cause = 'quit'; } toGarage(); });
btn('o-again', () => newRun());
btn('o-garage', () => toGarage());
btn('o-wheel', () => { toGarage(); openWheel(); });

// ================= призовой автомат =================
const lockedCars = () => CARS.filter(c => !save.owned.includes(c.id));
function weightedPick(list) {
  const sum = list.reduce((s, c) => s + RARITY[c.rarity].w, 0);
  let r = Math.random() * sum;
  for (const c of list) { r -= RARITY[c.rarity].w; if (r <= 0) return c; }
  return list[list.length - 1];
}
const RCOL = Object.values(RARITY).map(r => new THREE.Color(r.color));
const machine = (() => {
  const g = new THREE.Group(), v = new Vox();
  const P = 0x6d28d9, PT = 0x8b5cf6, GOLD = 0xffc23d, D = 0x160f2e;
  v.box(0, 0, 0, 3.6, 0.45, 2.8, D);
  v.box(0, 0.45, 0, 3.1, 2.5, 2.3, P, { top: PT });
  v.box(0, 2.95, 0, 3.3, 0.22, 2.5, GOLD);
  v.box(0, 0.65, 1.16, 1.5, 1.0, 0.06, 0x07040f); v.box(0, 0.55, 1.18, 1.7, 0.12, 0.08, GOLD); v.box(0, 1.7, 1.18, 1.7, 0.1, 0.08, GOLD);
  v.box(0.95, 1.95, 1.16, 0.55, 0.75, 0.06, 0x2b2147); v.box(0.95, 2.1, 1.2, 0.08, 0.32, 0.04, 0x0a0a0a);
  for (const [x, z] of [[1.5, 1.1], [-1.5, 1.1], [1.5, -1.1], [-1.5, -1.1]]) v.box(x, 3.17, z, 0.2, 2.3, 0.2, GOLD);
  v.box(0, 5.45, 0, 3.3, 0.4, 2.5, P, { top: PT }); v.box(0, 5.85, 0, 1.4, 0.35, 1.0, GOLD); v.box(0, 6.2, 0, 0.5, 0.5, 0.5, 0xff4d6d);
  const body = new THREE.Mesh(v.geometry(), MAT.lambert); g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.85, 2.3, 2.05), new THREE.MeshLambertMaterial({ color: 0xc7ecff, transparent: true, opacity: 0.22, depthWrite: false }));
  glass.position.y = 4.32; g.add(glass);
  const caps = [], ccol = [0xff4d6d, 0x3b9cff, 0xffc23d, 0x4ade80, 0xb15cff, 0xffffff, 0xff8a3d];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: ccol[i % ccol.length] }));
    m.position.set(R(-1.1, 1.1), 3.4 + (i % 3) * 0.5 + R(0, 0.2), R(-0.75, 0.75)); m.rotation.set(R(0, 3), R(0, 3), 0);
    m.userData.base = m.position.clone(); g.add(m); caps.push(m);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.32, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strip.position.set(0, 2.5, 1.18); g.add(strip);
  const button = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.25), new THREE.MeshLambertMaterial({ color: 0xff3b3b, emissive: 0x550000 }));
  button.position.set(-0.85, 2.0, 1.22); g.add(button);
  const drop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }));
  drop.visible = false; gScene.add(drop);
  g.userData = { caps, strip, button, drop };
  g.position.set(-1.3, 0, -0.6); g.visible = false; gScene.add(g);
  return g;
})();
let prizeMesh = null, wheel = null;

function openWheel() {
  if (!lockedCars().length) { toastGarage('✓ ' + CARS.length + '/' + CARS.length); return; }
  wheel = { phase: 'idle', t: 0 };
  if (prizeMesh) { gScene.remove(prizeMesh); prizeMesh = null; }
  machine.userData.drop.visible = false;
  $('w-result').classList.add('hidden'); $('w-spin').classList.remove('hidden'); $('w-close').classList.remove('hidden');
  updateWheelUi();
  state = 'wheel'; showScreen('wheel');
}
function updateWheelUi() { $('w-coins').textContent = save.coins; $('w-spin').classList.toggle('dim', save.coins < WHEEL_PRICE); }
function toastGarage(t) { const el = $('g-toast'); el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1800); }
function toastWheel(t) { const el = $('w-toast'); el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2000); }

function spinWheel() {
  if (!wheel || wheel.phase !== 'idle') return;
  if (save.coins < WHEEL_PRICE) { toastWheel(`$ ${save.coins} / ${WHEEL_PRICE}`); return; }
  save.coins -= WHEEL_PRICE; persist(); updateWheelUi();
  wheel = { phase: 'shake', t: 0, win: weightedPick(lockedCars()), lastC: -1 };
  $('w-spin').classList.add('hidden'); $('w-close').classList.add('hidden');
  sfx.click();
}

function updateMachine(dt, t) {
  const M = machine.userData, W = wheel;
  machine.rotation.z = 0; machine.position.x = -1.3;
  M.button.position.z = 1.22;
  if (!W || W.phase === 'idle' || W.phase === 'done') {
    M.strip.material.color.copy(RCOL[Math.floor(t * 2) % RCOL.length]);
    M.caps.forEach((m, i) => { m.position.y = m.userData.base.y + Math.sin(t * 2 + i) * 0.04; });
    if (prizeMesh) prizeMesh.rotation.y += dt * 0.8;
    return;
  }
  W.t += dt;
  const winC = new THREE.Color(RARITY[W.win.rarity].color);
  if (W.phase === 'shake') {
    const k = W.t / 2.4;
    M.button.position.z = W.t < 0.25 ? 1.12 : 1.22;
    machine.rotation.z = Math.sin(W.t * 45) * 0.035 * (1 - k * 0.5);
    machine.position.x = -1.3 + Math.sin(W.t * 37) * 0.05;
    M.caps.forEach((m, i) => { m.position.y = m.userData.base.y + Math.abs(Math.sin(W.t * 14 + i)) * 0.35; m.rotation.x += dt * (3 + i % 4); });
    // огонёк перебирает редкости, всё медленнее, и останавливается на выигрыше
    const idx = Math.floor(Math.pow(W.t, 0.6) * 9) % RCOL.length;
    if (k < 0.85) { if (idx !== W.lastC) { W.lastC = idx; sfx.tick(); } M.strip.material.color.copy(RCOL[idx]); }
    else M.strip.material.color.copy(winC);
    if (k >= 1) { W.phase = 'drop'; W.t = 0; M.drop.material.color.copy(winC); M.drop.visible = true; sfx.thud(); }
  } else if (W.phase === 'drop') {
    // капсула выкатывается из люка и прыгает на платформу
    const k = Math.min(1, W.t / 0.7);
    const x0 = -1.3, z0 = 0.6, x1 = 2.0, z1 = 1.6;
    M.drop.position.set(x0 + (x1 - x0) * k, 0.45 + 0.6 + Math.sin(k * Math.PI) * 1.6 - k * 0.6, z0 + (z1 - z0) * k);
    M.drop.rotation.set(k * 6, k * 3, 0);
    M.strip.material.color.copy(winC);
    if (k >= 1) { W.phase = 'open'; W.t = 0; sfx.crash(0.4); }
  } else if (W.phase === 'open') {
    const k = Math.min(1, W.t / 0.35);
    M.drop.scale.setScalar(1 + k * 1.5); M.drop.material.opacity = 1;
    if (k >= 1) {
      M.drop.visible = false; M.drop.scale.setScalar(1);
      prizeMesh = new THREE.Mesh(carGeometry(W.win), silMat);
      const sc = 3.6 / Math.max(W.win.len, W.win.wid * 1.3, 3.6);
      prizeMesh.userData.sc = sc; prizeMesh.position.set(2.0, 0, 1.6); prizeMesh.scale.setScalar(0.01); prizeMesh.rotation.y = -0.6;
      gScene.add(prizeMesh);
      W.phase = 'reveal'; W.t = 0;
    }
  } else if (W.phase === 'reveal') {
    const k = Math.min(1, W.t / 0.4), sc = prizeMesh.userData.sc;
    prizeMesh.scale.setScalar(sc * (k < 1 ? 1.15 * Math.sin(k * Math.PI / 2) : 1));
    prizeMesh.rotation.y += dt * 1.5;
    if (W.t > 0.9 && prizeMesh.material === silMat) { prizeMesh.material = MAT.lambert; wheelDone(); }
  }
}

function wheelDone() {
  const c = wheel.win;
  wheel.phase = 'done';
  if (!save.owned.includes(c.id)) save.owned.push(c.id);
  save.sel = c.id; persist();
  sfx.win();
  gIndex = CARS.indexOf(c);
  $('w-res-name').textContent = c.name;
  const rr = $('w-res-rar'); rr.textContent = RARITY[c.rarity].name; rr.style.background = RARITY[c.rarity].color;
  $('w-res-desc').textContent = c.ability || '';
  $('w-res-desc').classList.toggle('hidden', !c.ability);
  $('w-result').classList.remove('hidden');
  $('w-again').classList.toggle('hidden', !(save.coins >= WHEEL_PRICE && lockedCars().length));
}
btn('w-spin', () => spinWheel());
btn('w-close', () => { if (wheel && !['idle', 'done'].includes(wheel.phase)) return; toGarage(); });
btn('w-ok', () => toGarage());
btn('w-again', () => openWheel());

// ================= главный цикл =================
let last = performance.now(), acc = 0, time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  time += dt;
  if ((state === 'play' || state === 'dying' || state === 'over') && G) {
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n++ < 4) { step(1 / 60); acc -= 1 / 60; }
    if (n >= 4) acc = 0;
    updateHud();
    const sp01 = player.alive ? clamp(player.speed() / 40, 0, 1) : 0;
    sfx.engine(sp01, state === 'play' && player.alive);
    let near = 999; for (const c of cops) if (c.alive) near = Math.min(near, Math.sqrt(dist2(c, player)));
    sfx.siren(state === 'over' ? 0 : clamp(1 - near / 70, 0, 1), time);
  }
  if (state === 'pause') { render(time, 0); return; }
  render(time, dt);
}

// ================= старт =================
applyQuality();
showGarageCar();
refreshGarage();
showScreen('garage');
requestAnimationFrame(frame);
window.__pogonya = { save, get state() { return state; }, get G() { return G; }, get player() { return player; }, get cops() { return cops; }, get coins() { return coins; }, newRun, input };
