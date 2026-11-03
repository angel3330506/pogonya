// Сборщик «воксельных» моделей: всё в игре собрано из коробок,
// которые склеиваются в одну геометрию с цветами вершин (1 draw call на модель).
import * as THREE from '../vendor/three.module.min.js';

const tmpColor = new THREE.Color();

export class Vox {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.idx = [];
    this.n = 0; this.vol = 0; this.wz = [];
    this.setTransform(0, 0, 0, 0, 1);
  }

  // Смещение/поворот/масштаб для всех следующих коробок
  setTransform(ox = 0, oy = 0, oz = 0, ry = 0, s = 1) {
    this.ox = ox; this.oy = oy; this.oz = oz; this.s = s;
    this.cs = Math.cos(ry); this.sn = Math.sin(ry);
    return this;
  }

  _p(x, y, z) {
    x *= this.s; y *= this.s; z *= this.s;
    this.pos.push(this.ox + x * this.cs + z * this.sn, this.oy + y, this.oz - x * this.sn + z * this.cs);
  }
  _nrm(x, y, z) { this.nor.push(x * this.cs + z * this.sn, y, -x * this.sn + z * this.cs); }

  // Коробка: x,z — центр, y — низ; w — ширина (x), h — высота, l — длина (z)
  box(x, y, z, w, h, l, color, opt) {
    this.vol += w * h * l * this.s ** 3;
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - l / 2, z1 = z + l / 2;
    tmpColor.setHex(color);
    const r = tmpColor.r, g = tmpColor.g, b = tmpColor.b;
    const top = opt && opt.top != null ? new THREE.Color().setHex(opt.top) : null;
    const noBottom = opt && opt.noBottom;
    const F = [
      [1, 0, 0, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [-1, 0, 0, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [0, 1, 0, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [0, -1, 0, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [0, 0, 1, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [0, 0, -1, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    ];
    for (let f = 0; f < 6; f++) {
      if (noBottom && f === 3) continue;
      const q = F[f];
      for (let k = 3; k < 7; k++) {
        this._p(q[k][0], q[k][1], q[k][2]);
        this._nrm(q[0], q[1], q[2]);
        if (f === 2 && top) this.col.push(top.r, top.g, top.b);
        else this.col.push(r, g, b);
      }
      const n = this.n;
      this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      this.n += 4;
    }
    return this;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export const MAT = {
  lambert: new THREE.MeshLambertMaterial({ vertexColors: true }),
  wreck: new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x3a3532 }),
  flash: new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xffffff, emissive: 0xff5533, emissiveIntensity: 0.6 }),
};
