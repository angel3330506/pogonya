// Бесконечный мир из кварталов. Квартал = 6×6 клеток по 12 м: дорога по двум краям + 5×5 внутри.
// Зоны: город, пригород, лес с озёрами, пустыня, снега со льдом.
import * as THREE from '../vendor/three.module.min.js';
import { Vox, MAT } from './vox.js';
import { CARS } from './cars.js';

export const T = 12, BT = 6, BLK = T * BT;
const LOAD_R = 2;

// ---------- шум и случайность ----------
function hash(x, z, s = 0) {
  let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

export function biomeOf(bx, bz) {
  if (Math.abs(bx) <= 1 && Math.abs(bz) <= 1) return 'city';
  const urb = vnoise(bx * 0.23 + 0.5, bz * 0.23 + 0.5, 11) * 0.7 + vnoise(bx * 0.6, bz * 0.6, 12) * 0.3;
  const tmp = vnoise(bx * 0.15 + 3.3, bz * 0.15 + 7.1, 21);
  if (urb < 0.4) return 'city';
  if (urb < 0.5) return 'suburb';
  if (tmp > 0.6) return 'desert';
  if (tmp < 0.36) return 'snow';
  return 'forest';
}

const GROUND = {
  city: 0xbdb7ab, suburb: 0x86c45c, forest: 0x62ad4b, desert: 0xe7c98b, snow: 0xf1f5f9,
};
const GKIND = { city: 'side', suburb: 'grass', forest: 'grass', desert: 'sand', snow: 'snow' };
export const SURF = {
  road: { spd: 1, grip: 1 }, side: { spd: 0.97, grip: 1 }, grass: { spd: 0.8, grip: 0.85 }, gold: { spd: 1, grip: 1 },
  sand: { spd: 0.7, grip: 0.75 }, snow: { spd: 0.78, grip: 0.65 }, ice: { spd: 1, grip: 0.18 },
  water: { spd: 0.72, grip: 0.5, water: true },
};

// ---------- ломаемые предметы (общие instanced-пулы) ----------
const PROP_DEFS = {
  lamp: { r: 0.35, cap: 700, debris: 0x5b6169, build(v) { v.box(0, 0, 0, 0.5, 0.3, 0.5, 0x4a5058); v.box(0, 0.3, 0, 0.18, 4.4, 0.18, 0x5b6169); v.box(0, 4.6, 0.6, 0.16, 0.16, 1.4, 0x5b6169); v.box(0, 4.4, 1.2, 0.5, 0.22, 0.5, 0xfff3b0); } },
  hydrant: { r: 0.4, cap: 250, debris: 0xd32f2f, build(v) { v.box(0, 0, 0, 0.5, 0.7, 0.5, 0xd32f2f); v.box(0, 0.7, 0, 0.36, 0.2, 0.36, 0xb71c1c); v.box(0, 0.4, 0, 0.8, 0.14, 0.14, 0xd32f2f); } },
  bin: { r: 0.5, cap: 250, debris: 0x2e7d32, build(v) { v.box(0, 0, 0, 0.8, 1.0, 0.8, 0x2e7d32); v.box(0, 1.0, 0, 0.9, 0.1, 0.9, 0x1b5e20); } },
  bench: { r: 0.8, cap: 250, debris: 0x8d6e63, build(v) { v.box(0, 0.45, 0, 2.0, 0.12, 0.6, 0x8d6e63); v.box(0, 0.55, -0.3, 2.0, 0.5, 0.1, 0x8d6e63); v.box(0.85, 0, 0, 0.1, 0.45, 0.5, 0x333333); v.box(-0.85, 0, 0, 0.1, 0.45, 0.5, 0x333333); } },
  fence: { r: 1.3, cap: 900, debris: 0xf2efe8, build(v) { for (let i = 0; i < 4; i++) v.box(-1.1 + i * 0.73, 0, 0, 0.16, 1.1, 0.1, 0xf5f2ea); v.box(0, 0.35, 0, 3, 0.12, 0.08, 0xe8e3d6); v.box(0, 0.8, 0, 3, 0.12, 0.08, 0xe8e3d6); } },
  bush: { r: 0.9, cap: 900, debris: 0x43a047, build(v) { v.box(0, 0, 0, 1.6, 0.9, 1.6, 0x43a047, { top: 0x5cbf60 }); v.box(0.2, 0.7, -0.1, 1.0, 0.5, 1.1, 0x4caf50, { top: 0x66cc6a }); } },
  cactus: { r: 0.45, cap: 700, debris: 0x2e7d32, build(v) { v.box(0, 0, 0, 0.6, 3.0, 0.6, 0x2e8b3e, { top: 0x3aa04b }); v.box(0.55, 1.2, 0, 0.5, 0.35, 0.4, 0x2e8b3e); v.box(0.7, 1.2, 0, 0.4, 1.2, 0.4, 0x2e8b3e); v.box(-0.55, 1.7, 0, 0.5, 0.35, 0.4, 0x2e8b3e); v.box(-0.7, 1.7, 0, 0.4, 0.9, 0.4, 0x2e8b3e); v.box(0, 3.0, 0, 0.3, 0.2, 0.3, 0xff80ab); } },
  snowman: { r: 0.7, cap: 250, debris: 0xffffff, build(v) { v.box(0, 0, 0, 1.4, 1.1, 1.4, 0xfdfdff); v.box(0, 1.1, 0, 1.0, 0.8, 1.0, 0xfdfdff); v.box(0, 1.9, 0, 0.7, 0.6, 0.7, 0xfdfdff); v.box(0, 2.1, 0.45, 0.14, 0.14, 0.4, 0xff7a00); v.box(0, 2.5, 0, 0.6, 0.12, 0.6, 0x222222); v.box(0, 2.6, 0, 0.42, 0.45, 0.42, 0x222222); v.box(0.15, 2.2, 0.36, 0.08, 0.08, 0.04, 0x111111); v.box(-0.15, 2.2, 0.36, 0.08, 0.08, 0.04, 0x111111); } },
  mailbox: { r: 0.35, cap: 300, debris: 0x1e63c8, build(v) { v.box(0, 0, 0, 0.12, 1.0, 0.12, 0x6d4c41); v.box(0, 1.0, 0, 0.45, 0.4, 0.7, 0x1e63c8); v.box(0.24, 1.2, -0.1, 0.04, 0.3, 0.1, 0xe53935); } },
  cone: { r: 0.35, cap: 300, debris: 0xff6d00, build(v) { v.box(0, 0, 0, 0.6, 0.08, 0.6, 0xff6d00); v.box(0, 0.08, 0, 0.42, 0.3, 0.42, 0xff6d00); v.box(0, 0.38, 0, 0.3, 0.16, 0.3, 0xffffff); v.box(0, 0.54, 0, 0.2, 0.2, 0.2, 0xff6d00); } },
  deadbush: { r: 0.6, cap: 400, debris: 0x8d6e47, build(v) { v.box(0, 0, 0, 0.15, 0.7, 0.15, 0x8d6e47); v.box(0.25, 0.4, 0, 0.5, 0.1, 0.1, 0x8d6e47); v.box(-0.2, 0.55, 0.1, 0.4, 0.1, 0.1, 0x8d6e47); v.box(0, 0.6, -0.2, 0.1, 0.1, 0.4, 0x8d6e47); } },
};

class PropPool {
  constructor(def, scene) {
    const v = new Vox(); def.build(v);
    this.def = def;
    this.mesh = new THREE.InstancedMesh(v.geometry(), MAT.lambert, def.cap);
    this.mesh.castShadow = true; this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.free = []; for (let i = def.cap - 1; i >= 0; i--) this.free.push(i);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < def.cap; i++) this.mesh.setMatrixAt(i, this.zero);
    scene.add(this.mesh);
  }
  alloc(m) {
    if (!this.free.length) return -1;
    const s = this.free.pop();
    this.mesh.setMatrixAt(s, m);
    if (s + 1 > this.mesh.count) this.mesh.count = s + 1;
    this.mesh.instanceMatrix.needsUpdate = true;
    return s;
  }
  hide(s) { this.mesh.setMatrixAt(s, this.zero); this.mesh.instanceMatrix.needsUpdate = true; }
  release(s) { this.hide(s); this.free.push(s); }
}

// ---------- генерация квартала ----------
const BUILD_COLORS = [0xd9cbb5, 0xc98b6b, 0x9fb4c7, 0xe3e0d6, 0x8c9aa6, 0xd4a373, 0xb5838d, 0x9aa5a8, 0xe9c46a, 0xa3b18a, 0xcfd8dc, 0xbc8a5f];
const HOUSE_COLORS = [0xf3e3c3, 0xcfe3f0, 0xf6d0c4, 0xdfe8c9, 0xf7f0d8, 0xe5d4f2];
const ROOF_COLORS = [0xa8433a, 0x6b4f3a, 0x48606e, 0x8a5a44];

function building(v, x0, z0, x1, z1, h, color, R) {
  const w = x1 - x0, l = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  v.box(cx, 0, cz, w, h, l, color, { noBottom: true });
  const floors = Math.floor((h - 2.5) / 3.4);
  const glass = R() < 0.5 ? 0x3d5266 : 0x4a5d6e;
  for (let f = 0; f < floors; f++) v.box(cx, 2.6 + f * 3.4, cz, w + 0.14, 1.3, l + 0.14, glass, { noBottom: true });
  v.box(cx, h, cz, w + 0.3, 0.5, l + 0.3, 0xdedad2, { noBottom: true });
  v.box(cx, h, cz, w - 0.8, 0.3, l - 0.8, 0x8f8a82, { noBottom: true });
  const ac = 1 + Math.floor(R() * 3);
  for (let i = 0; i < ac; i++) v.box(x0 + 2 + R() * (w - 4), h + 0.3, z0 + 2 + R() * (l - 4), 1.4, 0.9, 1.4, 0xb9bec4);
  if (h > 20 && R() < 0.35) { v.box(cx, h + 0.3, cz, 0.3, 6, 0.3, 0x777777); v.box(cx, h + 6.3, cz, 0.5, 0.5, 0.5, 0xff3d3d); }
  if (R() < 0.6) {
    const ac2 = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d][Math.floor(R() * 4)];
    v.box(cx, 2.3, z0 - 0.6, w * 0.9, 0.2, 1.2, ac2); v.box(cx, 2.3, z1 + 0.6, w * 0.9, 0.2, 1.2, ac2);
  }
}

function tree(v, x, z, R, kind = 'round') {
  if (kind === 'pine' || kind === 'snowpine') {
    const s = 0.8 + R() * 0.5, c = kind === 'snowpine' ? 0x2f6e4f : 0x2e7d4f;
    v.box(x, 0, z, 0.5 * s, 1.4 * s, 0.5 * s, 0x6d4c41);
    for (let i = 0; i < 3; i++) {
      const w = (3.0 - i * 0.8) * s;
      v.box(x, (1.2 + i * 1.4) * s, z, w, 1.5 * s, w, c, { top: kind === 'snowpine' ? 0xf5f9fc : 0x3b9160 });
    }
    return 0.6 * s;
  }
  const s = 0.85 + R() * 0.5, c = [0x4caf50, 0x43a047, 0x66bb6a, 0x8bc34a][Math.floor(R() * 4)];
  v.box(x, 0, z, 0.6 * s, 2.2 * s, 0.6 * s, 0x795548);
  v.box(x, 2.0 * s, z, 3.0 * s, 2.0 * s, 3.0 * s, c);
  v.box(x + 0.3 * s, 3.6 * s, z - 0.2 * s, 2.0 * s, 1.2 * s, 2.0 * s, c);
  return 0.6 * s;
}

function rock(v, x, z, R, c = 0x9e9e9e) {
  const w = 1.5 + R() * 2.5, l = 1.5 + R() * 2.5, h = 1 + R() * 1.6;
  v.box(x, 0, z, w, h, l, c, { noBottom: true });
  v.box(x + 0.2, h, z - 0.1, w * 0.6, h * 0.4, l * 0.6, c, { noBottom: true });
  return { b: 1, x0: x - w / 2, x1: x + w / 2, z0: z - l / 2, z1: z + l / 2 };
}

const BEAM_MAT = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.blocks = new Map();
    this.pools = {};
    for (const k in PROP_DEFS) this.pools[k] = new PropPool(PROP_DEFS[k], scene);
    this.queue = [];
    this._near = [];
  }

  key(bx, bz) { return bx + ',' + bz; }

  // Загрузить/выгрузить кварталы вокруг точки. force — построить все сразу.
  update(x, z, force) {
    const cbx = Math.floor(x / BLK), cbz = Math.floor(z / BLK);
    const want = new Set();
    for (let dz = -LOAD_R; dz <= LOAD_R; dz++) for (let dx = -LOAD_R; dx <= LOAD_R; dx++) {
      const bx = cbx + dx, bz = cbz + dz, k = this.key(bx, bz);
      want.add(k);
      if (!this.blocks.has(k) && !this.queue.some(q => q.k === k)) this.queue.push({ k, bx, bz, d: dx * dx + dz * dz });
    }
    for (const [k, b] of this.blocks) if (!want.has(k)) this.unload(b);
    this.queue = this.queue.filter(q => want.has(q.k));
    this.queue.sort((a, b) => a.d - b.d);
    let n = force ? 999 : 1;
    while (n-- > 0 && this.queue.length) { const q = this.queue.shift(); this.blocks.set(q.k, this.build(q.bx, q.bz)); }
  }

  clear() { for (const b of [...this.blocks.values()]) this.unload(b); this.queue = []; }

  unload(b) {
    this.scene.remove(b.ground); this.scene.remove(b.stat);
    for (const m of b.extra || []) { this.scene.remove(m); m.geometry.dispose(); }
    b.ground.geometry.dispose(); b.stat.geometry.dispose();
    for (const p of b.props) if (p.slot >= 0) this.pools[p.type].release(p.slot);
    this.blocks.delete(b.k);
  }

  addProp(b, type, x, z, ry = 0, s = 1) {
    _q.setFromAxisAngle(_up, ry); _p.set(x, b.groundY(x, z), z); _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    const slot = this.pools[type].alloc(_m);
    if (slot < 0) return;
    b.props.push({ type, x, z, r: PROP_DEFS[type].r * s, slot, alive: true, ry });
  }

  build(bx, bz) {
    const X0 = bx * BLK, Z0 = bz * BLK, IX = X0 + T, IZ = Z0 + T, S = BLK - T;
    const biome = biomeOf(bx, bz);
    const R = rng(hash(bx, bz, 7));
    const g = new Vox(), v = new Vox();
    const b = {
      k: this.key(bx, bz), bx, bz, biome, X0, Z0,
      tiles: new Array(25).fill(GKIND[biome]), solids: [], props: [],
      groundY: () => biome === 'city' ? 0.12 : 0.04,
    };
    const city = biome === 'city';
    // редкое «денежное место»: золотая площадка с кучей купюр и столбом света
    const bonus = Math.abs(bx) + Math.abs(bz) > 1 && hash(bx, bz, 99) < 0.08;
    // редкая военная база (пригород/лес)
    const base = !bonus && (biome === 'suburb' || biome === 'forest') && Math.abs(bx) + Math.abs(bz) > 2 && hash(bx, bz, 55) < 0.07;

    // дороги
    const asph = biome === 'desert' ? 0x6b6258 : 0x3e4249;
    g.box(X0 + T / 2, -0.5, Z0 + BLK / 2, T, 0.5, BLK, asph, { noBottom: true });
    g.box(X0 + T + S / 2, -0.5, Z0 + T / 2, S, 0.5, T, asph, { noBottom: true });
    const line = biome === 'desert' ? 0xf2d16b : 0xf1efe6;
    for (let i = 0; i < 10; i++) {
      g.box(X0 + T / 2, 0, IZ + 3 + i * 6, 0.3, 0.02, 3, line);
      g.box(IX + 3 + i * 6, 0, Z0 + T / 2, 3, 0.02, 0.3, line);
    }
    if (city) {
      for (let i = 0; i < 6; i++) {
        g.box(X0 + 1.5 + i * 1.8, 0, IZ + 1.6, 1.0, 0.02, 2.4, 0xf4f4f4);
        g.box(IX + 1.6, 0, Z0 + 1.5 + i * 1.8, 2.4, 0.02, 1.0, 0xf4f4f4);
      }
    }

    // особая местность: озеро (лес), лёд (снега)
    if (!bonus && !base && ((biome === 'forest' && R() < 0.5) || (biome === 'snow' && R() < 0.45))) {
      const w = 2 + Math.floor(R() * 2), h = 2 + Math.floor(R() * 2);
      const ox = Math.floor(R() * (5 - w + 1)), oz = Math.floor(R() * (5 - h + 1));
      const kind = biome === 'forest' ? 'water' : 'ice';
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.tiles[(oz + j) * 5 + ox + i] = kind;
    }
    // земля внутри квартала
    const gy = b.groundY();
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const t = b.tiles[j * 5 + i], cx = IX + i * T + T / 2, cz = IZ + j * T + T / 2;
      const jit = (R() - 0.5) * 0.06;
      if (t === 'water') {
        g.box(cx, -1.2, cz, T, 0.9, T, 0x2f8fd8, { top: 0x3fa6ec, noBottom: true });
      } else if (t === 'ice') {
        g.box(cx, -0.5, cz, T, 0.5 + gy, T, 0xbfe7f7, { top: 0xd4f1fc, noBottom: true });
      } else {
        const c = new THREE.Color(GROUND[biome]); c.offsetHSL(0, 0, jit);
        g.box(cx, -0.5, cz, T, 0.5 + gy, T, c.getHex(), { noBottom: true });
      }
    }
    // берег у воды
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (b.tiles[j * 5 + i] === 'water') {
      const cx = IX + i * T + T / 2, cz = IZ + j * T + T / 2;
      if (i === 0 || b.tiles[j * 5 + i - 1] !== 'water') g.box(cx - T / 2 + 0.3, -1.2, cz, 0.6, 1.2 + gy, T, 0xc9b98a, { noBottom: true });
      if (i === 4 || b.tiles[j * 5 + i + 1] !== 'water') g.box(cx + T / 2 - 0.3, -1.2, cz, 0.6, 1.2 + gy, T, 0xc9b98a, { noBottom: true });
      if (j === 0 || b.tiles[(j - 1) * 5 + i] !== 'water') g.box(cx, -1.2, cz - T / 2 + 0.3, T, 1.2 + gy, 0.6, 0xc9b98a, { noBottom: true });
      if (j === 4 || b.tiles[(j + 1) * 5 + i] !== 'water') g.box(cx, -1.2, cz + T / 2 - 0.3, T, 1.2 + gy, 0.6, 0xc9b98a, { noBottom: true });
    }

    const tileAt = (x, z) => {
      const i = Math.floor((x - IX) / T), j = Math.floor((z - IZ) / T);
      if (i < 0 || j < 0 || i > 4 || j > 4) return 'road';
      return b.tiles[j * 5 + i];
    };
    const placed = [];
    const free = (x, z, r) => {
      if (x - r < IX + 0.5 || x + r > IX + S - 0.5 || z - r < IZ + 0.5 || z + r > IZ + S - 0.5) return false;
      for (const dx of [-r, r]) for (const dz of [-r, r]) { const t = tileAt(x + dx, z + dz); if (t === 'water' || t === 'ice') return false; }
      for (const p of placed) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + r) ** 2) return false;
      return true;
    };
    const scatter = (n, r, fn) => {
      for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
        const x = IX + R() * S, z = IZ + R() * S;
        if (!free(x, z, r)) continue;
        placed.push({ x, z, r }); fn(x, z); i++;
      }
    };
    v.setTransform(0, gy, 0);
    b.extra = [];
    if (bonus) {
      const cx = IX + S / 2, cz = IZ + S / 2;
      v.box(cx, 0, cz, 17, 0.12, 17, 0xe0a91f, { top: 0xffd24a });
      v.box(cx, 0.12, cz, 13, 0.06, 13, 0xffe27a);
      for (const [dx, dz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) v.box(cx + dx, 0, cz + dz, 0.6, 1.6, 0.6, 0xffc107, { top: 0xfff3b0 });
      placed.push({ x: cx, z: cz, r: 12 });
      b.bonus = { x: cx, z: cz };
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 60, 16, 1, true), BEAM_MAT);
      beam.position.set(cx, 30, cz); this.scene.add(beam); b.extra.push(beam);
    }

    if (base) {
      const cx = IX + S / 2, cz = IZ + S / 2;
      v.box(cx, 0, cz, S - 3, 0.05, S - 3, 0x80857c);
      for (let i = 0; i < 6; i++) v.box(cx - 18 + i * 7, 0.05, cz + 14, 3, 0.02, 0.4, 0xf2c94c);
      for (let k = 0; k < 18; k++) {
        const t = IX + 3.5 + k * 3.05;
        if (k < 8 || k > 10) { this.addProp(b, 'fence', t, IZ + 2, 0); this.addProp(b, 'fence', t, IZ + S - 2, 0); }
        this.addProp(b, 'fence', IX + 2, IZ + 3.5 + k * 3.05, Math.PI / 2); this.addProp(b, 'fence', IX + S - 2, IZ + 3.5 + k * 3.05, Math.PI / 2);
      }
      for (const hx of [cx - 13, cx + 13]) {
        const hz = cz - 12;
        v.box(hx, 0, hz, 18, 7, 14, 0x4a4f55, { noBottom: true }); v.box(hx, 7, hz, 18.4, 0.6, 14.4, 0x5c6269);
        for (let r = 0; r < 4; r++) v.box(hx, 7.6 + r * 0.5, hz, 18.4 - r * 4, 0.5, 14.4, 0x5c6269);
        v.box(hx, 0, hz + 7.02, 12, 5.5, 0.08, 0x2c3034);
        b.solids.push({ b: 1, x0: hx - 9, x1: hx + 9, z0: hz - 7, z1: hz + 7 });
      }
      const tx = cx + 20, tz = cz + 20;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) v.box(tx + dx, 0, tz + dz, 0.25, 7, 0.25, 0x6d4c41);
      v.box(tx, 7, tz, 3.4, 2.2, 3.4, 0x5d4037); v.box(tx, 9.2, tz, 4, 0.4, 4, 0x3e2723);
      b.solids.push({ x: tx, z: tz, r: 1.8 });
      const tank = CARS.find(c => c.id === 'tank');
      for (const [dx, dz] of [[-14, 9], [-6, 9], [2, 9]]) {
        v.setTransform(cx + dx, gy + 0.05, cz + dz, Math.PI); tank.build(v); v.setTransform(0, gy, 0);
        b.solids.push({ x: cx + dx, z: cz + dz, r: 2.6 });
      }
      placed.push({ x: cx, z: cz, r: 40 });
    } else if (city && bonus) {
      for (let i = 0; i < 4; i++) { this.addProp(b, 'lamp', IX + 1.2, IZ + 6 + i * 15, -Math.PI / 2); this.addProp(b, 'lamp', IX + 6 + i * 15, IZ + 1.2, Math.PI); }
      scatter(6, 2, (x, z) => { b.solids.push({ x, z, r: tree(v, x, z, R) + 0.1 }); });
    } else if (city) {
      // фонари и прочее по краю тротуара
      for (let i = 0; i < 4; i++) {
        this.addProp(b, 'lamp', IX + 1.2, IZ + 6 + i * 15, -Math.PI / 2);
        this.addProp(b, 'lamp', IX + 6 + i * 15, IZ + 1.2, Math.PI);
      }
      if (R() < 0.7) this.addProp(b, 'hydrant', IX + 1.3, IZ + 12 + R() * 36);
      if (R() < 0.7) this.addProp(b, 'bin', IX + 10 + R() * 40, IZ + 1.4);
      if (R() < 0.4) this.addProp(b, 'cone', X0 + 3 + R() * 6, IZ + 10 + R() * 40);
      if (R() < 0.4) this.addProp(b, 'cone', IX + 10 + R() * 40, Z0 + 3 + R() * 6);

      if (R() < 0.18) {
        // площадь с фонтаном
        const cx = IX + S / 2, cz = IZ + S / 2;
        v.box(cx, 0, cz, 9, 0.7, 9, 0xd7d2c8); v.box(cx, 0.1, cz, 8, 0.7, 8, 0x4fb3ea);
        v.box(cx, 0.7, cz, 1.2, 2.2, 1.2, 0xd7d2c8); v.box(cx, 2.9, cz, 3, 0.3, 3, 0xd7d2c8); v.box(cx, 3.2, cz, 0.6, 1.2, 0.6, 0x9fdcff);
        b.solids.push({ b: 1, x0: cx - 4.5, x1: cx + 4.5, z0: cz - 4.5, z1: cz + 4.5 });
        placed.push({ x: cx, z: cz, r: 7 });
        for (const [dx, dz] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
          const x = cx + dx, z = cz + dz; v.box(x, 0, z, 3.6, 0.5, 3.6, 0xa1887f);
          b.solids.push({ x, z, r: tree(v, x, z, R) + 0.3 }); placed.push({ x, z, r: 3 });
        }
        for (const [dx, dz, ry] of [[0, -9, 0], [0, 9, Math.PI], [-9, 0, Math.PI / 2], [9, 0, -Math.PI / 2]]) this.addProp(b, 'bench', cx + dx, cz + dz, ry);
        scatter(4, 1, (x, z) => this.addProp(b, 'bin', x, z));
      } else {
        // дома, между ними — проезды
        const A = IX + 3, B = IZ + 3, E = S - 6, lots = [];
        const lay = R();
        const gap = R() < 0.6 ? 7 : 1.5;
        const h2 = (E - gap) / 2;
        if (lay < 0.2) lots.push([A, B, A + E, B + E]);
        else if (lay < 0.45) { lots.push([A, B, A + h2, B + E]); lots.push([A + h2 + gap, B, A + E, B + E]); }
        else if (lay < 0.65) { lots.push([A, B, A + E, B + h2]); lots.push([A, B + h2 + gap, A + E, B + E]); }
        else for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) lots.push([A + i * (h2 + gap), B + j * (h2 + gap), A + i * (h2 + gap) + h2, B + j * (h2 + gap) + h2]);
        for (const [x0, z0, x1, z1] of lots) {
          const big = (x1 - x0) * (z1 - z0) > 1000;
          const h = (big ? 8 : 6) + R() * (big ? 12 : 10);
          const ins = 0.5 + R() * 1.5;
          building(v, x0 + ins, z0 + ins, x1 - ins, z1 - ins, h, BUILD_COLORS[Math.floor(R() * BUILD_COLORS.length)], R);
          b.solids.push({ b: 1, x0: x0 + ins - 0.2, x1: x1 - ins + 0.2, z0: z0 + ins - 0.2, z1: z1 - ins + 0.2 });
        }
      }
    } else if (biome === 'suburb') {
      const A = IX + 2, B = IZ + 2, h2 = (S - 4 - 8) / 2;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const x0 = A + i * (h2 + 8), z0 = B + j * (h2 + 8);
        if (R() < 0.15) continue;
        const w = 9 + R() * 4, l = 8 + R() * 4, cx = x0 + h2 / 2 + (R() - 0.5) * 4, cz = z0 + h2 / 2 + (R() - 0.5) * 4;
        const hc = HOUSE_COLORS[Math.floor(R() * HOUSE_COLORS.length)], rc = ROOF_COLORS[Math.floor(R() * ROOF_COLORS.length)];
        const hh = 3.6 + R() * 1.5;
        v.box(cx, 0, cz, w, hh, l, hc, { noBottom: true });
        for (let k = 0; k < 4; k++) v.box(cx, hh + k * 0.7, cz, w + 0.8 - k * (w / 4.5), 0.7, l + 0.8 - k * 0.25, rc);
        v.box(cx + w / 4, hh + 0.5, cz + l / 4, 0.8, 2.2, 0.8, 0x8d6e63);
        v.box(cx, 0, cz + l / 2 + 0.02, 1.2, 2.2, 0.06, 0x6d4c41);
        for (const s of [-1, 1]) { v.box(cx + s * w / 3.2, 1.3, cz + l / 2 + 0.03, 1.4, 1.2, 0.06, 0x9fd3f0); v.box(cx + s * w / 3.2, 1.3, cz - l / 2 - 0.03, 1.4, 1.2, 0.06, 0x9fd3f0); }
        b.solids.push({ b: 1, x0: cx - w / 2, x1: cx + w / 2, z0: cz - l / 2, z1: cz + l / 2 });
        placed.push({ x: cx, z: cz, r: Math.max(w, l) / 2 + 1.5 });
        // заборчик вдоль дороги, если участок у дороги
        if (j === 0) for (let k = 0; k < 6; k++) this.addProp(b, 'fence', x0 + 1.5 + k * 3.05, z0 - 0.4, 0);
        if (i === 0) for (let k = 0; k < 6; k++) this.addProp(b, 'fence', x0 - 0.4, z0 + 1.5 + k * 3.05, Math.PI / 2);
        this.addProp(b, 'mailbox', cx + 2, cz + l / 2 + 3);
      }
      scatter(5, 2, (x, z) => b.solids.push({ x, z, r: tree(v, x, z, R) + 0.1 }));
      scatter(6, 1, (x, z) => this.addProp(b, 'bush', x, z, R() * 6));
    } else if (biome === 'forest') {
      scatter(16 + Math.floor(R() * 8), 2.2, (x, z) => b.solids.push({ x, z, r: tree(v, x, z, R, R() < 0.35 ? 'pine' : 'round') + 0.1 }));
      scatter(6, 1, (x, z) => this.addProp(b, 'bush', x, z, R() * 6));
      scatter(1 + Math.floor(R() * 2), 2.5, (x, z) => b.solids.push(rock(v, x, z, R)));
    } else if (biome === 'desert') {
      if (R() < 0.22) {
        // ступенчатая пирамида
        const cx = IX + S / 2 + (R() - 0.5) * 8, cz = IZ + S / 2 + (R() - 0.5) * 8, n = 10;
        for (let i = 0; i < n; i++) { const w = 30 - i * 3; v.box(cx, i * 1.8, cz, w, 1.8, w, i % 2 ? 0xc98a4b : 0xbf7f40, { noBottom: true, top: 0xd99c5c }); }
        b.solids.push({ b: 1, x0: cx - 15, x1: cx + 15, z0: cz - 15, z1: cz + 15 });
        placed.push({ x: cx, z: cz, r: 22 });
      } else if (R() < 0.35) {
        const cx = IX + 12 + R() * (S - 24), cz = IZ + 12 + R() * (S - 24), w = 10 + R() * 6, l = 10 + R() * 6;
        v.box(cx, 0, cz, w, 3, l, 0xc8763c, { noBottom: true }); v.box(cx, 3, cz, w - 0.6, 2.5, l - 0.6, 0xd9894a, { noBottom: true });
        v.box(cx, 5.5, cz, w - 2, 0.6, l - 2, 0xe39a5c, { noBottom: true });
        b.solids.push({ b: 1, x0: cx - w / 2, x1: cx + w / 2, z0: cz - l / 2, z1: cz + l / 2 });
        placed.push({ x: cx, z: cz, r: Math.max(w, l) / 2 + 1 });
      }
      scatter(10, 1.5, (x, z) => this.addProp(b, 'cactus', x, z, R() * 6, 0.8 + R() * 0.5));
      scatter(6, 1, (x, z) => this.addProp(b, 'deadbush', x, z, R() * 6));
      scatter(3 + Math.floor(R() * 3), 2.5, (x, z) => b.solids.push(rock(v, x, z, R, 0xc08552)));
      if (R() < 0.5) scatter(1, 1, (x, z) => { v.box(x, 0, z, 0.8, 0.5, 1.0, 0xf3efe5); v.box(x, 0.2, z + 0.5, 0.6, 0.3, 0.3, 0xf3efe5); });
    } else if (biome === 'snow') {
      scatter(12 + Math.floor(R() * 6), 2.2, (x, z) => b.solids.push({ x, z, r: tree(v, x, z, R, 'snowpine') + 0.1 }));
      scatter(3, 1.2, (x, z) => this.addProp(b, 'snowman', x, z, R() * 6));
      scatter(2, 2.5, (x, z) => b.solids.push(rock(v, x, z, R, 0x90a4ae)));
    }

    b.ground = new THREE.Mesh(g.geometry(), MAT.lambert); b.ground.receiveShadow = true;
    if (v.n === 0) v.box(IX + 1, -0.5, IZ + 1, 0.1, 0.1, 0.1, 0x000000);
    b.stat = new THREE.Mesh(v.geometry(), MAT.lambert); b.stat.castShadow = true; b.stat.receiveShadow = true;
    this.scene.add(b.ground); this.scene.add(b.stat);
    return b;
  }

  // ---------- запросы ----------
  blockAt(x, z) { return this.blocks.get(this.key(Math.floor(x / BLK), Math.floor(z / BLK))); }

  surface(x, z) {
    const b = this.blockAt(x, z);
    if (!b) return 'road';
    const i = Math.floor((x - b.X0) / T) - 1, j = Math.floor((z - b.Z0) / T) - 1;
    if (i < 0 || j < 0) return 'road';
    return b.tiles[j * 5 + i];
  }

  // кварталы, которых может касаться круг радиуса r
  near(x, z, r) {
    const out = this._near; out.length = 0;
    const bx0 = Math.floor((x - r) / BLK), bx1 = Math.floor((x + r) / BLK), bz0 = Math.floor((z - r) / BLK), bz1 = Math.floor((z + r) / BLK);
    for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) { const b = this.blocks.get(this.key(bx, bz)); if (b) out.push(b); }
    return out;
  }

  solidAt(x, z, pad = 0) {
    for (const b of this.near(x, z, pad + 1)) for (const s of b.solids) {
      if (s.b) { if (x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad) return true; }
      else if ((x - s.x) ** 2 + (z - s.z) ** 2 < (s.r + pad) ** 2) return true;
    }
    const sf = this.surface(x, z);
    return sf === 'water';
  }

  breakProp(p) { p.alive = false; this.pools[p.type].hide(p.slot); return PROP_DEFS[p.type].debris; }

  // ближайшая точка на дороге
  static snapRoad(x, z, alongX) {
    if (alongX) return [x, Math.round((z - T / 2) / BLK) * BLK + T / 2];
    return [Math.round((x - T / 2) / BLK) * BLK + T / 2, z];
  }
}
