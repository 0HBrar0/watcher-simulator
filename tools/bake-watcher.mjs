// Sculpts the original Watcher character as signed distance fields, polygonises it with
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

// ---------------------------------------------------------------- The head
// Authored in head space: cranium centre at origin, face toward +Z, roughly 1.4 tall.
export const EYE = { x: 0.178, y: -0.075, z: 0.43, r: 0.082 }

function headSdf(x0, y, z) {
  const x = Math.abs(x0)
  // skull: the famously oversized dome, long toward the back
  let d = ellipsoid(x, y, z, 0, 0.24, -0.1, 0.62, 0.68, 0.74)
  d = smin(d, ellipsoid(x, y, z, 0, -0.18, 0.17, 0.375, 0.5, 0.36), 0.14)
  // jaw and chin
  d = smin(d, ellipsoid(x, y, z, 0.1, -0.5, 0.16, 0.2, 0.17, 0.26), 0.1)
  d = smin(d, ellipsoid(x, y, z, 0, -0.655, 0.3, 0.115, 0.085, 0.105), 0.09)
  // zygomatic arch, cheek hollow
  d = smin(d, ellipsoid(x, y, z, 0.285, -0.2, 0.33, 0.1, 0.06, 0.11), 0.08)
  d = smax(d, -ellipsoid(x, y, z, 0.37, -0.42, 0.3, 0.13, 0.13, 0.17), 0.1)
  // heavy, contemplative brow
  d = smin(d, capsule(x, y, z, 0.03, 0.03, 0.535, 0.2, 0.05, 0.5, 0.074, 0.08), 0.08)
  d = smin(d, capsule(x, y, z, 0.2, 0.05, 0.5, 0.36, -0.03, 0.345, 0.08, 0.044), 0.07)
  // eye sockets
  d = smax(d, -ellipsoid(x, y, z, EYE.x, EYE.y, EYE.z + 0.06, 0.125, 0.082, 0.11), 0.05)
  // eyelids: a shell over the eyeball with an almond slit cut through it
  d = smin(d, sphere(x, y, z, EYE.x, EYE.y, EYE.z, EYE.r + 0.012), 0.022)
  {
    const tilt = (x - EYE.x) * 0.2
    const slit = ellipsoid(x, y - tilt, z, EYE.x, EYE.y - 0.012, EYE.z + EYE.r, 0.07, 0.0185, 0.07)
    d = smax(d, -slit, 0.012)
  }
  // lower-lid bag and upper-lid fold
  d = smin(d, capsule(x, y, z, 0.11, -0.142, 0.487, 0.255, -0.122, 0.425, 0.012), 0.024)
  d = smin(d, capsule(x, y, z, 0.1, -0.006, 0.507, 0.262, -0.032, 0.438, 0.011), 0.02)
  // nose
  d = smin(d, capsule(x, y, z, 0, 0.0, 0.535, 0, -0.245, 0.625, 0.042, 0.05), 0.045)
  d = smin(d, sphere(x, y, z, 0, -0.272, 0.635, 0.05), 0.03)
  d = smin(d, ellipsoid(x, y, z, 0.062, -0.292, 0.57, 0.04, 0.032, 0.046), 0.022)
  d = smax(d, -ellipsoid(x, y, z, 0.03, -0.322, 0.595, 0.018, 0.012, 0.024), 0.012)
  // nasolabial crease
  d = smax(d, -capsule(x, y, z, 0.098, -0.275, 0.545, 0.17, -0.47, 0.462, 0.008, 0.005), 0.03)
  // lips
  const philtrum = 0.008 * Math.exp(-x * x / 0.0005)
  d = smin(d, ellipsoid(x, y, z, 0.045, -0.425 + philtrum, 0.5, 0.078, 0.017, 0.036), 0.026)
  d = smin(d, ellipsoid(x, y, z, 0.03, -0.463, 0.49, 0.068, 0.021, 0.036), 0.026)
  d = smax(d, -capsule(x, y, z, 0, -0.444, 0.545, 0.14, -0.452, 0.47, 0.006, 0.004), 0.008)
  d = smax(d, -ellipsoid(x, y, z, 0, -0.53, 0.49, 0.08, 0.016, 0.03), 0.03)
  // ears
  {
    const ear = ellipsoid(x, y, z + (y + 0.12) * 0.22, 0.575, -0.13, -0.05, 0.05, 0.165, 0.095)
    const bowl = ellipsoid(x, y, z + (y + 0.12) * 0.22, 0.63, -0.13, -0.035, 0.05, 0.11, 0.058)
    d = smin(d, smax(ear, -bowl, 0.02), 0.03)
  }
  // neck and tendons
  d = smin(d, capsule(x, y, z, 0, -0.42, -0.08, 0, -1.3, -0.2, 0.27, 0.33), 0.13)
  d = smin(d, capsule(x, y, z, 0.17, -0.5, -0.02, 0.05, -1.15, 0.1, 0.05, 0.05), 0.09)
  // forehead lines and a temporal vein: tiny, only read as light catching skin
  const brow = smoothstep(0.1, 0.2, y) * (1 - smoothstep(0.42, 0.56, y)) * smoothstep(-0.05, 0.3, z)
  d += brow * 0.0016 * Math.sin((y + 0.03 * Math.cos(x * 6)) * 34)
  d -= 0.008 * Math.exp(-Math.pow((y - 0.26 - 0.18 * Math.sin(z * 5.2)) / 0.012, 2)) * smoothstep(0.3, 0.5, x)
  return d
}

// ---------------------------------------------------------------- The body
// Authored in model space: y up, face toward +Z, feet dissolve around y = -2.1.
export const HEAD_PIVOT = [0, 2.2, 0.04]
export const HEAD_SCALE = 0.84
const HEAD_OFFSET = [0, 0.96, 0.15] // cranium centre, relative to the neck pivot
const HEAD_TILT = 0.12 // slight contemplative bow, in radians about X

// The robe's silhouette, as a radius around the swept central axis.
function robeAxis(y) { const t = clamp((1.1 - y) / 3.2, 0, 1); return -0.62 * t * t }
function robeRadius(y) {
  const flare = smoothstep(0.9, -2.1, y)
  return mix(0.5, 1.28, Math.pow(flare, 1.35))
}
function foldField(theta, y) {
  const a = smoothstep(1.3, -1.1, y)
  const wander = 0.5 * Math.sin(y * 1.6 + theta * 3) + 0.8 * vnoise(theta * 1.5 + 9, y * 0.65, 2.3)
  const large = Math.sin(theta * 7 + wander * 2.2)
  const fine = Math.sin(theta * 17 + wander * 3.6 + y * 0.5)
  return (0.25 + 0.75 * a) * (0.09 * large + 0.03 * fine)
}
function robeBody(x, y, z) {
  const zc = z - robeAxis(y)
  const r = Math.sqrt(x * x + zc * zc)
  const theta = Math.atan2(zc, x)
  const R = robeRadius(y) * (1 - 0.06 * Math.sin(theta)) + foldField(theta, y)
  let d = (r - R) * 0.72
  const hem = -2.0 + 0.3 * Math.sin(theta * 3 + 1.1) + 0.14 * Math.sin(theta * 8)
  d = smax(d, hem - y, 0.12)
  return d
}

function sleeve(x, y, z) {
  // shoulder -> elbow -> clasped hands, swelling toward the cuff
  let d = capsule(x, y, z, 0.68, 1.68, -0.06, 0.92, 0.82, 0.08, 0.21, 0.25)
  d = smin(d, capsule(x, y, z, 0.92, 0.82, 0.08, 0.36, 0.56, 0.62, 0.25, 0.3), 0.14)
  const s = Math.atan2(z - 0.3, x - 0.7)
  d += 0.016 * Math.sin(s * 5 + y * 8) * smoothstep(1.5, 0.8, y)
  // open the cuff
  const cuff = capsule(x, y, z, 0.42, 0.59, 0.56, 0.12, 0.46, 0.84, 0.22, 0.26)
  return smax(d, -cuff, 0.03)
}

function clothSdf(x0, y, z) {
  const x = Math.abs(x0)
  // chest, broad shoulders, and a mantle falling from them
  let d = ellipsoid(x, y, z, 0, 1.22, 0, 0.66, 0.78, 0.45)
  d = smin(d, ellipsoid(x, y, z, 0.62, 1.74, -0.05, 0.3, 0.24, 0.3), 0.26)
  d = smin(d, ellipsoid(x, y, z, 0.32, 1.42, 0.26, 0.26, 0.26, 0.17), 0.18)
  d = smin(d, robeBody(x0, y, z), 0.12)
  d = smin(d, sleeve(x, y, z), 0.09)
  // neck opening
  // a soft cowl rolled around the neck
  {
    const rr = Math.sqrt(x * x + (z - 0.02) * (z - 0.02))
    const roll = Math.sqrt((rr - 0.33) * (rr - 0.33) + (y - 1.97) * (y - 1.97)) - 0.12 - 0.012 * Math.sin(Math.atan2(z, x0) * 6 + y * 5)
    d = smin(d, roll, 0.1)
    d = smax(d, -capsule(x, y, z, 0, 2.7, 0.08, 0, 1.82, 0.04, 0.235, 0.235), 0.035)
  }
  // cowl: soft swags across the chest
  const swag = 0.018 * Math.sin((y + x * x * 1.3) * 15) * smoothstep(1.2, 1.5, y) * smoothstep(0.26, 0, z < 0 ? 1 : 0) * smoothstep(0.65, 0.2, x)
  return d + swag
}

function trimSdf(x0, y, z) {
  const x = Math.abs(x0)
  // the signature standing collar: a tall flared crescent behind the head
  const rr = Math.sqrt(x * x + (z + 0.02) * (z + 0.02))
  const a = Math.atan2(x, -(z + 0.02)) // 0 at the back, pi at the front
  const openFront = smoothstep(2.25, 1.75, a)
  const lean = (y - 1.85) * 0.48
  const collarR = 0.5 + lean
  const shell = Math.abs(rr - collarR) - 0.034
  const top = 1.84 + 1.08 * openFront * (0.32 + 0.68 * Math.pow(Math.max(0, Math.cos(a * 0.72)), 1.3))
  let d = smax(shell, y - top, 0.02)
  d = smax(d, 1.82 - y, 0.02)
  d = smax(d, a - 2.25, 0.03)
  d = d * 0.7
  // collar seat
  const seat = Math.sqrt(Math.pow(rr - 0.55, 2) + Math.pow(y - 1.86, 2)) - 0.042
  d = smin(d, seat, 0.03)
  // chest clasp: a pointed drop
  const clasp = ellipsoid(x, y, z, 0, 1.68, 0.5, 0.105, 0.17, 0.05)
  d = smin(d, clasp, 0.02)
  // straps running from the seat to the clasp
  d = smin(d, capsule(x, y, z, 0.38, 1.87, 0.38, 0.04, 1.68, 0.51, 0.02), 0.01)
  // sleeve cuffs
  const cuffSurface = Math.abs(capsule(x, y, z, 0.584, 0.664, 0.404, 0.36, 0.56, 0.62, 0.296, 0.304)) - 0.016
  const slab = Math.abs((x - 0.472) * -0.683 + (y - 0.612) * -0.317 + (z - 0.512) * 0.659) - 0.05
  return smin(d, smax(cuffSurface, slab, 0.012), 0.01)
}

function handsSdf(x0, y, z) {
  const x = Math.abs(x0)
  // two hands resting together; fingers interlaced by mirroring across x
  let d = ellipsoid(x, y, z, 0.17, 0.48, 0.78, 0.13, 0.1, 0.16)
  d = smin(d, capsule(x, y, z, 0.34, 0.52, 0.66, 0.2, 0.49, 0.75, 0.085, 0.09), 0.05)
  for (let i = 0; i < 4; i++) {
    const t = i / 3, oz = mix(0.82, 0.92, t), oy = mix(0.525, 0.44, t)
    const kx = mix(0.065, 0.09, Math.abs(t - 0.4)), r = mix(0.031, 0.026, t)
    d = smin(d, capsule(x, y, z, 0.13, oy + 0.015, oz - 0.04, kx, oy + 0.03, oz + 0.075, r), 0.012)
    d = smin(d, capsule(x, y, z, kx, oy + 0.03, oz + 0.075, 0.015, oy - 0.015, oz + 0.075, r * 0.9), 0.01)
  }
  // thumb
  d = smin(d, capsule(x, y, z, 0.17, 0.57, 0.75, 0.055, 0.615, 0.81, 0.038, 0.03), 0.03)
  return d
}

// ---------------------------------------------------------------- Colours (linear RGB)
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const IVORY = [0.56, 0.54, 0.66], VIOLET = [0.2, 0.09, 0.56], INDIGO = [0.05, 0.04, 0.24]

function clothColor(x, y, z) {
  // ivory mantle sinking into violet, with a deep indigo inner tunic panel
  let c = lerp3(IVORY, VIOLET, smoothstep(0.7, -1.7, y))
  const panel = (1 - smoothstep(0.2, 0.27, Math.abs(x) - (1.5 - y) * 0.13)) * smoothstep(-0.2, 0.2, z) * smoothstep(1.56, 1.46, y)
  c = lerp3(c, INDIGO, panel)
  return c
}
const SKIN_A = [0.045, 0.11, 0.4], SKIN_B = [0.1, 0.22, 0.62]
function skinColor(x, y, z) {
  // blue skin, flushed paler across the dome and darker in the cheek and lips
  let c = lerp3(SKIN_A, SKIN_B, smoothstep(-0.45, 0.55, y))
  const lips = Math.exp(-Math.pow((y + 0.443) / 0.05, 2)) * Math.exp(-x * x / 0.018) * smoothstep(0.4, 0.5, z)
  return lerp3(c, [0.15, 0.11, 0.38], lips * 0.7)
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
  return skinColor((x - HEAD_OFFSET[0]) / s, (qy * cosT + qz * sinT) / s, (-qy * sinT + qz * cosT) / s)
}
const eyeInPivot = (sign) => {
  const ex = EYE.x * s * sign, ey0 = EYE.y * s, ez0 = EYE.z * s
  return [ex + HEAD_OFFSET[0], ey0 * cosT - ez0 * sinT + HEAD_OFFSET[1], ey0 * sinT + ez0 * cosT + HEAD_OFFSET[2]]
}

const quick = process.argv.includes('--quick')
const q = quick ? 2 : 1
const head = polygonize('head', headInPivot, [-0.66, -0.46, -0.72], [0.66, 1.62, 0.86], 0.0105 * q, headColorPivot, 0.09)
const cloth = polygonize('cloth', clothSdf, [-1.7, -2.45, -2.2], [1.7, 2.4, 1.4], 0.027 * q, clothColor, 0.34)
const trim = polygonize('trim', trimSdf, [-1.12, 0.3, -1.1], [1.12, 3.4, 1.05], 0.019 * q, () => [1, 1, 1], 0.08)
const hands = polygonize('hands', handsSdf, [-0.52, 0.32, 0.5], [0.52, 0.76, 1.08], 0.0105 * q, (x, y, z) => skinColor(x, 0, 0), 0.05)
const eye = eyeball(EYE.r * s)

const materials = [
  { name: 'Skin', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.46 } },
  { name: 'Cloth', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.68 } },
  { name: 'Gold', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.98, 0.72, 0.36, 1], metallicFactor: 1, roughnessFactor: 0.3 } },
  { name: 'Eye', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.2 } },
]
const parts = [
  { name: 'Robe', mesh: cloth, material: 1 }, { name: 'Trim', mesh: trim, material: 2 },
  { name: 'Hands', mesh: hands, material: 0 }, { name: 'HeadSkin', mesh: head, material: 0 },
  { name: 'EyeBall', mesh: eye, material: 3 },
]
const nodes = [
  { name: 'Watcher', children: [1, 2, 3, 4] },
  { name: 'Robe', mesh: 0 }, { name: 'Trim', mesh: 1 }, { name: 'Hands', mesh: 2 },
  { name: 'Head', translation: HEAD_PIVOT, children: [5, 6, 7] },
  { name: 'HeadSkin', mesh: 3 },
  { name: 'Eye_L', mesh: 4, translation: eyeInPivot(1) },
  { name: 'Eye_R', mesh: 4, translation: eyeInPivot(-1) },
]
mkdirSync('public/assets/characters', { recursive: true })
writeGlb('public/assets/characters/watcher.glb', parts, nodes, materials)
