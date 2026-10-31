import { Vector3 } from 'three'
import { allTargets } from '../planets/PlanetRegistry'

const a = new Vector3()
const b = new Vector3()
const c = new Vector3()
const closest = new Vector3()

/** A cubic Bézier that bows around anything standing between its ends. */
export interface FlightPath {
  p0: Vector3
  p1: Vector3
  p2: Vector3
  p3: Vector3
}

export function samplePath(path: FlightPath, t: number, out: Vector3) {
  const u = 1 - t
  return out.set(0, 0, 0)
    .addScaledVector(path.p0, u * u * u)
    .addScaledVector(path.p1, 3 * u * u * t)
    .addScaledVector(path.p2, 3 * u * t * t)
    .addScaledVector(path.p3, t * t * t)
}

export function buildPath(path: FlightPath, from: Vector3, to: Vector3, heading: Vector3, ignoreId?: string) {
  const span = from.distanceTo(to)
  path.p0.copy(from)
  path.p3.copy(to)
  // Leave along the current view for a moment, then swing in.
  path.p1.copy(from).addScaledVector(heading, span * 0.26)
  path.p2.copy(to).lerp(from, 0.3)

  a.copy(to).sub(from).normalize()
  b.set(0, 1, 0).cross(a).normalize()
  path.p1.addScaledVector(b, span * 0.04).addScaledVector(c.set(0, 1, 0), span * 0.03)
  path.p2.addScaledVector(b, span * 0.08).addScaledVector(c.set(0, 1, 0), span * 0.05)

  // Three passes: push the control points away from any body the curve would hit.
  for (let pass = 0; pass < 3; pass++) {
    for (const body of allTargets) {
      if (body.id === ignoreId || body.id === 'watcher') continue
      const keepOut = body.radius * 1.9
      for (let i = 1; i < 12; i++) {
        samplePath(path, i / 12, closest)
        const d = closest.distanceTo(body.position)
        if (d < keepOut) {
          const push = (keepOut - d) * 2.2
          c.copy(closest).sub(body.position).normalize()
          path.p1.addScaledVector(c, push)
          path.p2.addScaledVector(c, push)
          break
        }
      }
    }
  }
}

export const ease = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2)
export const easeInOut = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
export const easeOut = (t: number) => 1 - (1 - t) ** 3
