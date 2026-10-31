// Sculpts the original masked Watcher as signed distance fields, polygonises it with
// surface nets, bakes ambient occlusion and colour into vertices, and writes a standard GLB.
// Run: npm run bake:watcher
// Node contract (see docs/ARCHITECTURE.md): Head (pivot at neck), Eye_L, Eye_R.
import { writeFileSync, mkdirSync } from 'node:fs'

// ---------------------------------------------------------------- SDF helpers
const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x)
const mix = (a, b, t) => a + (b - a) * t
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h) }
const smax = (a, b, k) => -smin(-a, -b, k)

function ellipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz
  const k0 = len(x / rx, y / ry, z / rz)
  const k1 = len(x / (rx * rx), y / (ry * ry), z / (rz * rz))
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1
}
function capsule(px, py, pz, ax, ay, az, bx, by, bz, ra, rb = ra) {
  const bax = bx - ax, bay = by - ay, baz = bz - az
  const pax = px - ax, pay = py - ay, paz = pz - az
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1)
  return len(pax - bax * h, pay - bay * h, paz - baz * h) - mix(ra, rb, h)
}
const sphere = (px, py, pz, cx, cy, cz, r) => len(px - cx, py - cy, pz - cz) - r

// Small value noise for cloth irregularity.
function hash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s) }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz)
  const l = (a, b, c) => hash(ix + a, iy + b, iz + c)
  return mix(mix(mix(l(0, 0, 0), l(1, 0, 0), u), mix(l(0, 1, 0), l(1, 1, 0), u), v),
    mix(mix(l(0, 0, 1), l(1, 0, 1), u), mix(l(0, 1, 1), l(1, 1, 1), u), v), w)
}

// ---------------------------------------------------------------- The mask
// Authored in head space: mask centre at origin, face toward +Z, roughly 1.3 tall.
// An original design: a blank porcelain oval with two narrow slits, repaired with gold seams.
export const EYE = { x: 0.17, y: 0.03, z: 0.34, r: 0.05 }

function headSdf(x0, y, z) {
  const x = Math.abs(x0)
  const narrow = 1 + 0.42 * clamp(-y / 0.7, 0, 1)
  let d = ellipsoid(x * narrow, y, z, 0, 0.02, 0.02, 0.46, 0.66, 0.42)
  // one long plane down the centre, and a shallow brow carried out from it
  d = smin(d, capsule(x, y, z, 0, 0.2, 0.43, 0, -0.2, 0.475, 0.016, 0.026), 0.1)
  d = smin(d, capsule(x, y, z, 0.02, 0.17, 0.42, 0.34, 0.14, 0.26, 0.024, 0.014), 0.08)
  // the slits
  d = smax(d, -ellipsoid(x, y, z, EYE.x, EYE.y, EYE.z + 0.03, 0.13, 0.03, 0.05), 0.03)
  const tilt = (x - EYE.x) * 0.28
  d = smax(d, -ellipsoid(x, y - tilt, z, EYE.x, EYE.y, EYE.z + 0.03, 0.11, 0.011, 0.1), 0.004)
  // a single engraved line where a mouth would be
  d = smax(d, -capsule(x, y, z, 0, -0.34, 0.46, 0, -0.52, 0.38, 0.006, 0.004), 0.01)
  // neck, lost in the dark of the hood
  return smin(d, capsule(x, y, z, 0, -0.4, -0.1, 0, -1.0, -0.1, 0.24, 0.28), 0.1)
}

// ---------------------------------------------------------------- The body
// Authored in model space: y up, face toward +Z, the cloak dissolves around y = -3.5.
export const HEAD_PIVOT = [0, 2.55, 0.1]
export const HEAD_SCALE = 0.8
const HEAD_OFFSET = [0, 0.75, 0.12] // mask centre, relative to the neck pivot
const HEAD_TILT = 0.1 // a slight downward attention, in radians about X

// The cloak's silhouette, as a radius around a central axis that trails away behind him.
function robeAxis(y) { const t = clamp((1.4 - y) / 5, 0, 1); return -0.9 * t * t }
function robeRadius(y) {
  const flare = smoothstep(1.8, -3.6, y)
  return mix(0.9, 1.6, Math.pow(flare, 1.2))
}
function foldField(theta, y) {
  const a = smoothstep(1.8, -1.8, y)
  const wander = 0.5 * Math.sin(y * 1.1 + theta * 3) + 0.8 * vnoise(theta * 1.5 + 9, y * 0.45, 2.3)
  const large = Math.sin(theta * 7 + wander * 2.2)
  const fine = Math.sin(theta * 17 + wander * 3.6 + y * 0.4)
  return (0.24 + 0.76 * a) * (0.16 * large + 0.04 * fine)
}
function robeBody(x, y, z) {
  const zc = z - robeAxis(y)
  const r = Math.sqrt(x * x + zc * zc)
  const theta = Math.atan2(zc, x)
  const R = robeRadius(y) * (1 - 0.06 * Math.sin(theta)) + foldField(theta, y)
  let d = (r - R) * 0.72
  const hem = -3.55 + 0.36 * Math.sin(theta * 3 + 1.1) + 0.16 * Math.sin(theta * 8)
  d = smax(d, hem - y, 0.12)
  return smax(d, y - 2.5, 0.2)
}

const hoodOuter = (x, y, z) => ellipsoid(x, y, z, 0, 3.3, -0.04, 0.8, 1.05, 0.95)
const hoodCavity = (x, y, z) => ellipsoid(x, y, z, 0, 3.28, 0.62, 0.62, 0.9, 0.95)

function hood(x, y, z) {
  let d = smin(hoodOuter(x, y, z), capsule(x, y, z, 0, 3.9, -0.28, 0, 4.62, -0.7, 0.36, 0.03), 0.3)
  const a = Math.atan2(z + 0.04, x)
  d += 0.012 * Math.sin(a * 6 + y * 3.2) * smoothstep(3.6, 2.7, y)
  return d
}

function sleeve(x, y, z) {
  // shoulder -> elbow -> sleeves meeting at the front, the hands lost inside them
  let d = capsule(x, y, z, 1.02, 2.25, -0.02, 1.22, 1.12, 0.1, 0.26, 0.3)
  d = smin(d, capsule(x, y, z, 1.22, 1.12, 0.1, 0.1, 0.84, 0.92, 0.3, 0.34), 0.14)
  // the sleeve's long hanging drape
  d = smin(d, ellipsoid(x, y, z, 0.88, 0.14, 0.42, 0.3, 0.92, 0.17), 0.2)
  const s = Math.atan2(z - 0.3, x - 0.7)
  return d + 0.022 * Math.sin(s * 5 + y * 7) * smoothstep(2, 1, y)
}

function clothSdf(x0, y, z) {
  const x = Math.abs(x0)
  // a narrow body under a broad mantle, falling from a deep hood
  let d = ellipsoid(x, y, z, 0, 2.35, 0, 1.15, 0.95, 0.72)
  // heavy pleats falling from the shoulders
  const drape = Math.atan2(z, x0)
  d += (0.048 * Math.sin(drape * 9 + y * 1.3) + 0.016 * Math.sin(drape * 23 - y)) * smoothstep(3, 1.9, y)
  d = smin(d, robeBody(x0, y, z), 0.16)
  d = smin(d, hood(x, y, z), 0.3)
  d = smin(d, sleeve(x, y, z), 0.1)
  return smax(d, -hoodCavity(x, y, z), 0.035)
}

function trimSdf(x0, y, z) {
  const x = Math.abs(x0)
  // gold running around the mouth of the hood
  let d = smax(Math.abs(hoodOuter(x, y, z)) - 0.036, Math.abs(hoodCavity(x, y, z)) - 0.036, 0.014)
  const skin = Math.abs(clothSdf(x0, y, z))
  // two lines falling down the front of the cloak
  const seam = Math.abs(x - (0.07 + (2.2 - y) * 0.055)) - 0.022
  d = smin(d, smax(smax(skin - 0.02, seam, 0.006), Math.max(y - 1.7, -2.05 - y), 0.02), 0.01)
  // a double hem of gold, where the cloak still holds together
  const theta = Math.atan2(z, x0)
  const wave = y + 1.7 + 0.1 * Math.sin(theta * 3 + 1.1)
  d = smin(d, smax(skin - 0.012, Math.abs(wave) - 0.024, 0.006), 0.01)
  d = smin(d, smax(skin - 0.012, Math.abs(wave + 0.13) - 0.01, 0.005), 0.01)
  // a lens clasp at the chest
  const ring = Math.sqrt(Math.pow(len(x, y - 2.02, 0) - 0.17, 2) + Math.pow(z - 1, 2)) - 0.03
  d = smin(d, ring, 0.01)
  d = smin(d, ellipsoid(x, y, z, 0, 2.02, 1, 0.1, 0.1, 0.05), 0.01)
  // sleeve cuffs
  const cuff = Math.abs(capsule(x, y, z, 1.22, 1.12, 0.1, 0.1, 0.84, 0.92, 0.3, 0.34)) - 0.022
  const slab = Math.abs((x - 0.42) * -0.791 + (y - 0.92) * -0.198 + (z - 0.69) * 0.579) - 0.05
  return smin(d, smax(cuff, slab, 0.012), 0.01)
}

// ---------------------------------------------------------------- Colours (linear RGB)
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const NIGHT = [0.022, 0.018, 0.07], VIOLET = [0.1, 0.045, 0.34], LINING = [0.006, 0.003, 0.018]
const PORCELAIN = [0.74, 0.7, 0.68], GOLD = [1, 0.66, 0.24], SHADOW = [0.02, 0.012, 0.05]

function clothColor(x, y, z) {
  // night at the shoulders, deepening into violet as the cloak starts to come apart
  const c = lerp3(NIGHT, VIOLET, smoothstep(0, -3, y))
  return lerp3(c, LINING, 1 - smoothstep(0, 0.16, hoodCavity(Math.abs(x), y, z) - 0.04))
}

// Thin gold repairs: one line down the brow, and a fracture running up from the left slit.
function segment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const h = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
  return Math.hypot(px - ax - dx * h, py - ay - dy * h)
}
function maskColor(x, y, z) {
  if (z < -0.05 || y < -0.56) return SHADOW
  const s = Math.min(
    segment(x, y, 0.005, 0.6, 0.015, 0.2), segment(x, y, 0.015, 0.2, -0.008, -0.1),
    segment(x, y, 0.2, 0.07, 0.25, 0.27), segment(x, y, 0.25, 0.27, 0.19, 0.42), segment(x, y, 0.19, 0.42, 0.26, 0.6),
    segment(x, y, 0.25, 0.27, 0.34, 0.33),
  )
  return lerp3(PORCELAIN, GOLD, 1 - smoothstep(0.013, 0.019, s))
}

// ---------------------------------------------------------------- Polygoniser
function polygonize(name, sdf, min, max, voxel, colorFn, aoScale) {
  const nx = Math.ceil((max[0] - min[0]) / voxel) + 1
  const ny = Math.ceil((max[1] - min[1]) / voxel) + 1
  const nz = Math.ceil((max[2] - min[2]) / voxel) + 1
  const field = new Float32Array(nx * ny * nz).fill(1e3)
  const at = (i, j, k) => i + nx * (j + ny * k)
  const B = 6, skipR = voxel * B * 1.1
  // narrow band: only sample blocks near the surface
  for (let bk = 0; bk < nz; bk += B) for (let bj = 0; bj < ny; bj += B) for (let bi = 0; bi < nx; bi += B) {
    const c = sdf(min[0] + (bi + B / 2) * voxel, min[1] + (bj + B / 2) * voxel, min[2] + (bk + B / 2) * voxel)
    if (c > skipR * 1.6) continue
    const inside = c < -skipR * 1.6
    for (let k = bk; k < Math.min(bk + B + 1, nz); k++) for (let j = bj; j < Math.min(bj + B + 1, ny); j++) for (let i = bi; i < Math.min(bi + B + 1, nx); i++) {
      field[at(i, j, k)] = inside ? -1e3 : sdf(min[0] + i * voxel, min[1] + j * voxel, min[2] + k * voxel)
    }
  }
  const index = new Int32Array(nx * ny * nz).fill(-1)
  const pos = [], tri = []
  const cc = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]
  const ee = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  const v = new Float32Array(8)
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0
    for (let c = 0; c < 8; c++) { v[c] = field[at(i + cc[c][0], j + cc[c][1], k + cc[c][2])]; if (v[c] < 0) mask |= 1 << c }
    if (mask === 0 || mask === 255) continue
    let sx = 0, sy = 0, sz = 0, n = 0
    for (const [a, b] of ee) {
      if ((v[a] < 0) === (v[b] < 0)) continue
      const t = v[a] / (v[a] - v[b])
      sx += mix(cc[a][0], cc[b][0], t); sy += mix(cc[a][1], cc[b][1], t); sz += mix(cc[a][2], cc[b][2], t); n++
    }
    index[at(i, j, k)] = pos.length / 3
    pos.push(min[0] + (i + sx / n) * voxel, min[1] + (j + sy / n) * voxel, min[2] + (k + sz / n) * voxel)
  }
  const quad = (a, b, c, d, flip) => flip ? tri.push(a, c, b, a, d, c) : tri.push(a, b, c, a, c, d)
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s = field[at(i, j, k)] < 0
    if (s !== (field[at(i + 1, j, k)] < 0)) {
      const a = index[at(i, j - 1, k - 1)], b = index[at(i, j, k - 1)], c = index[at(i, j, k)], d = index[at(i, j - 1, k)]
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quad(a, b, c, d, !s)
    }
    if (s !== (field[at(i, j + 1, k)] < 0)) {
      const a = index[at(i - 1, j, k - 1)], b = index[at(i, j, k - 1)], c = index[at(i, j, k)], d = index[at(i - 1, j, k)]
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quad(a, d, c, b, !s)
    }
    if (s !== (field[at(i, j, k + 1)] < 0)) {
      const a = index[at(i - 1, j - 1, k)], b = index[at(i, j - 1, k)], c = index[at(i, j, k)], d = index[at(i - 1, j, k)]
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quad(a, b, c, d, !s)
    }
  }
  const N = pos.length / 3
  const P = new Float32Array(pos), Nrm = new Int8Array(N * 4), Col = new Uint8Array(N * 4)
  const e = voxel * 0.6
  for (let i = 0; i < N; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nx_, ny_, nz_
    for (let it = 0; it < 3; it++) {
      nx_ = sdf(x + e, y, z) - sdf(x - e, y, z); ny_ = sdf(x, y + e, z) - sdf(x, y - e, z); nz_ = sdf(x, y, z + e) - sdf(x, y, z - e)
      const l = len(nx_, ny_, nz_) || 1; nx_ /= l; ny_ /= l; nz_ /= l
      if (it < 2) { const d = clamp(sdf(x, y, z), -voxel, voxel); x -= nx_ * d * 0.8; y -= ny_ * d * 0.8; z -= nz_ * d * 0.8 }
    }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z
    Nrm[i * 4] = Math.round(nx_ * 127); Nrm[i * 4 + 1] = Math.round(ny_ * 127); Nrm[i * 4 + 2] = Math.round(nz_ * 127); Nrm[i * 4 + 3] = 127
    // ambient occlusion: how much of a short walk along the normal is unobstructed
    let occ = 0, w = 1
    for (let s = 1; s <= 5; s++) {
      const h = aoScale * s * s * 0.04
      occ += w * Math.max(0, h - sdf(x + nx_ * h, y + ny_ * h, z + nz_ * h)) / h
      w *= 0.68
    }
    const ao = Math.pow(clamp(1 - 0.46 * occ, 0.06, 1), 1.25)
    const c = colorFn(x, y, z)
    // occlusion drifts toward violet rather than to grey
    const tint = 1 - ao
    Col[i * 4] = Math.round(255 * Math.pow(clamp(c[0] * ao * (1 - tint * 0.28), 0, 1), 1 / 2.2))
    Col[i * 4 + 1] = Math.round(255 * Math.pow(clamp(c[1] * ao * (1 - tint * 0.5), 0, 1), 1 / 2.2))
    Col[i * 4 + 2] = Math.round(255 * Math.pow(clamp(c[2] * ao, 0, 1), 1 / 2.2))
    Col[i * 4 + 3] = 255
  }
  console.log(`${name}: ${nx}x${ny}x${nz}, ${N} verts, ${tri.length / 3} tris`)
  return { pos: P, nrm: Nrm, col: Col, idx: new Uint32Array(tri) }
}

// ---------------------------------------------------------------- UV sphere for eyes
function eyeball(r) {
  const seg = 32, ring = 24, pos = [], nrm = [], col = [], idx = [], uv = []
  for (let j = 0; j <= ring; j++) for (let i = 0; i <= seg; i++) {
    const v = j / ring, u = i / seg, t = v * Math.PI, p = u * Math.PI * 2
    const nx = Math.sin(t) * Math.sin(p), ny = Math.cos(t), nz = Math.sin(t) * Math.cos(p)
    pos.push(nx * r, ny * r, nz * r); nrm.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127), 127); col.push(255, 255, 255, 255); uv.push(u, v)
  }
  for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  return { pos: new Float32Array(pos), nrm: new Int8Array(nrm), col: new Uint8Array(col), idx: new Uint32Array(idx) }
}

// ---------------------------------------------------------------- GLB writer
function writeGlb(path, parts, nodes, materials) {
  const chunks = [], views = [], accessors = [], meshes = []
  let offset = 0
  const pushView = (typed, target) => {
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)
    const pad = (4 - (buf.length % 4)) % 4
    chunks.push(buf, Buffer.alloc(pad))
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target })
    offset += buf.length + pad
    return views.length - 1
  }
  for (const part of parts) {
    const { mesh: m } = part
    const n = m.pos.length / 3
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], m.pos[i * 3 + c]); hi[c] = Math.max(hi[c], m.pos[i * 3 + c]) }
    const add = (a) => (accessors.push(a), accessors.length - 1)
    const POSITION = add({ bufferView: pushView(m.pos, 34962), componentType: 5126, count: n, type: 'VEC3', min: lo, max: hi })
    const NORMAL = add({ bufferView: pushView(m.nrm, 34962), componentType: 5120, normalized: true, count: n, type: 'VEC4' })
    views[views.length - 1].byteStride = 4
    const COLOR_0 = add({ bufferView: pushView(m.col, 34962), componentType: 5121, normalized: true, count: n, type: 'VEC4' })
    views[views.length - 1].byteStride = 4
    const indices = add({ bufferView: pushView(m.idx, 34963), componentType: 5125, count: m.idx.length, type: 'SCALAR' })
    meshes.push({ name: part.name, primitives: [{ attributes: { POSITION, NORMAL, COLOR_0 }, indices, material: part.material }] })
  }
  // NORMAL as a normalized byte VEC3 needs a 4-byte stride, which the VEC4 slot gives us.
  accessors.forEach((a) => { if (a.componentType === 5120) a.type = 'VEC3' })
  const json = {
    asset: { version: '2.0', generator: 'tools/bake-watcher.mjs' },
    extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0, scenes: [{ nodes: [0] }], nodes, meshes, materials, accessors, bufferViews: views,
    buffers: [{ byteLength: offset }],
  }
  const jsonBuf = Buffer.from(JSON.stringify(json))
  const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)
  const bin = Buffer.concat(chunks)
  const total = 12 + 8 + jsonBuf.length + jsonPad.length + 8 + bin.length
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8)
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length + jsonPad.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4)
  writeFileSync(path, Buffer.concat([head, jh, jsonBuf, jsonPad, bh, bin]))
  console.log(`${path}: ${(total / 1048576).toFixed(2)} MB`)
}

// ---------------------------------------------------------------- The astrolabe halo
// Plain parametric tubes stay perfectly round however close the camera comes.
function tube(path, r, closed, sides = 10) {
  const pos = [], nrm = [], idx = []
  const n = path.length
  for (let i = 0; i < n; i++) {
    const p = path[i], a = path[closed ? (i + n - 1) % n : Math.max(i - 1, 0)], b = path[closed ? (i + 1) % n : Math.min(i + 1, n - 1)]
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]
    const tl = len(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl
    // frame: one axis out of the ring plane, the other across it
    let ux = 0, uy = 0, uz = 1
    if (Math.abs(tz) > 0.9) { ux = 1; uz = 0 }
    let vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux
    const vl = len(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl
    ux = vy * tz - vz * ty; uy = vz * tx - vx * tz; uz = vx * ty - vy * tx
    for (let s = 0; s < sides; s++) {
      const q = (s / sides) * Math.PI * 2, c = Math.cos(q), d = Math.sin(q)
      const nx = ux * c + vx * d, ny = uy * c + vy * d, nz = uz * c + vz * d
      pos.push(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r)
      nrm.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127), 127)
    }
  }
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) for (let s = 0; s < sides; s++) {
    const a = i * sides + s, b = i * sides + (s + 1) % sides
    const c = ((i + 1) % n) * sides + s, d = ((i + 1) % n) * sides + (s + 1) % sides
    idx.push(a, c, b, b, c, d)
  }
  return { pos, nrm, idx }
}
const arc = (R, from, to, steps) => Array.from({ length: steps + 1 }, (_, i) => {
  const a = mix(from, to, i / steps)
  return [Math.cos(a) * R, Math.sin(a) * R, 0]
})
const ring = (R, steps) => arc(R, 0, Math.PI * 2 * (1 - 1 / steps), steps - 1)
function merge(list) {
  const pos = [], nrm = [], idx = []
  for (const m of list) {
    const base = pos.length / 3
    pos.push(...m.pos); nrm.push(...m.nrm)
    for (const i of m.idx) idx.push(i + base)
  }
  const n = pos.length / 3
  return { pos: new Float32Array(pos), nrm: new Int8Array(nrm), col: new Uint8Array(n * 4).fill(255), idx: new Uint32Array(idx) }
}

// Outer ring, marked off in degrees like an instrument.
function haloMain() {
  const parts = [tube(ring(2.05, 360), 0.03, true), tube(ring(1.94, 360), 0.012, true)]
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, major = i % 6 === 0
    const r0 = major ? 1.86 : 1.94, c = Math.cos(a), s = Math.sin(a)
    parts.push(tube([[c * r0, s * r0, 0], [c * 2.05, s * 2.05, 0]], major ? 0.012 : 0.007, false, 6))
  }
  return merge(parts)
}
// Three broken arcs, each carrying a small bead of light.
function haloArcs() {
  const parts = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    parts.push(tube(arc(1.6, a, a + 1.5, 90), 0.02, false))
    const c = Math.cos(a + 1.5) * 1.6, s = Math.sin(a + 1.5) * 1.6
    const bead = eyeball(0.065)
    parts.push({ pos: [...bead.pos].map((v, j) => v + (j % 3 === 0 ? c : j % 3 === 1 ? s : 0)), nrm: [...bead.nrm], idx: [...bead.idx] })
  }
  return merge(parts)
}
const haloOrbit = () => merge([tube(ring(2.45, 360), 0.018, true)])

// ---------------------------------------------------------------- Assembly
const s = HEAD_SCALE
const cosT = Math.cos(HEAD_TILT), sinT = Math.sin(HEAD_TILT)
// The head mesh is stored relative to its neck pivot, already scaled and bowed.
function headInPivot(x, y, z) {
  const qx = x - HEAD_OFFSET[0], qy = y - HEAD_OFFSET[1], qz = z - HEAD_OFFSET[2]
  const ry = (qy * cosT + qz * sinT) / s, rz = (-qy * sinT + qz * cosT) / s
  return headSdf(qx / s, ry, rz) * s
}
function headColorPivot(x, y, z) {
  const qy = y - HEAD_OFFSET[1], qz = z - HEAD_OFFSET[2]
  return maskColor((x - HEAD_OFFSET[0]) / s, (qy * cosT + qz * sinT) / s, (-qy * sinT + qz * cosT) / s)
}
const eyeInPivot = (sign) => {
  const ex = EYE.x * s * sign, ey0 = EYE.y * s, ez0 = EYE.z * s
  return [ex + HEAD_OFFSET[0], ey0 * cosT - ez0 * sinT + HEAD_OFFSET[1], ey0 * sinT + ez0 * cosT + HEAD_OFFSET[2]]
}

const quick = process.argv.includes('--quick')
const q = quick ? 2 : 1
const head = polygonize('mask', headInPivot, [-0.5, -0.12, -0.42], [0.5, 1.42, 0.74], 0.0105 * q, headColorPivot, 0.09)
const cloth = polygonize('cloth', clothSdf, [-2.2, -4.15, -3], [2.2, 5, 1.75], 0.03 * q, clothColor, 0.42)
const trim = polygonize('trim', trimSdf, [-1.8, -3.1, -1.5], [1.8, 4.4, 1.6], 0.02 * q, () => [1, 1, 1], 0.08)
const eye = eyeball(EYE.r * s)

const materials = [
  { name: 'Mask', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.34 } },
  { name: 'Cloth', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.7 } },
  { name: 'Gold', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.98, 0.72, 0.36, 1], metallicFactor: 1, roughnessFactor: 0.3 } },
  { name: 'Eye', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.2 } },
]
const parts = [
  { name: 'Robe', mesh: cloth, material: 1 }, { name: 'Trim', mesh: trim, material: 2 },
  { name: 'Mask', mesh: head, material: 0 },
  { name: 'EyeBall', mesh: eye, material: 3 },
  { name: 'HaloMain', mesh: haloMain(), material: 2 }, { name: 'HaloArcs', mesh: haloArcs(), material: 2 },
  { name: 'HaloOrbit', mesh: haloOrbit(), material: 2 },
]
// Halo nodes spin about their own local Z at run time; replacement models can leave them out.
const tiltX = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]
const nodes = [
  { name: 'Watcher', children: [1, 2, 3, 7, 8, 9] },
  { name: 'Robe', mesh: 0 }, { name: 'Trim', mesh: 1 },
  { name: 'Head', translation: HEAD_PIVOT, children: [4, 5, 6] },
  { name: 'Mask', mesh: 2 },
  { name: 'Eye_L', mesh: 3, translation: eyeInPivot(1) },
  { name: 'Eye_R', mesh: 3, translation: eyeInPivot(-1) },
  { name: 'Halo_A', mesh: 4, translation: [0, 3.35, -0.95] },
  { name: 'Halo_B', mesh: 5, translation: [0, 3.35, -0.85] },
  { name: 'Halo_C', mesh: 6, translation: [0, 3.35, -1.7], rotation: tiltX(0.5) },
]
mkdirSync('public/assets/characters', { recursive: true })
writeGlb('public/assets/characters/watcher.glb', parts, nodes, materials)
