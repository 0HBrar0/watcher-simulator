import { MathUtils, Quaternion, Vector3 } from 'three'

/** How close to Earth's centre, in radii, the camera goes before the real Earth takes over. */
export const ENTER_RADII = 2
/** Where the camera lands on the way back, a little further out so it doesn't hand over again. */
export const LEAVE_RADII = 2.2
/** Past this zoom the real Earth fills the screen, so the universe behind it can rest. */
export const COVER_ZOOM = 6

/** Earth's rotation, from its own frame into the universe. Kept current by Planet. */
export const earthFrame = new Quaternion()

const inverse = new Quaternion()
const scratch = new Vector3()

export interface EarthView {
  lat: number
  lon: number
  bearing: number
  radii: number
}

/** Prime meridian on +x and north on +y, the way a sphere wraps an equirectangular map. */
export function surfaceOf(local: Vector3) {
  return {
    lat: MathUtils.radToDeg(Math.asin(MathUtils.clamp(local.y, -1, 1))),
    lon: MathUtils.radToDeg(Math.atan2(-local.z, local.x)),
  }
}

export function directionOf(lat: number, lon: number, out: Vector3) {
  const a = MathUtils.degToRad(lat), o = MathUtils.degToRad(lon)
  return out.set(Math.cos(a) * Math.cos(o), Math.sin(a), -Math.cos(a) * Math.sin(o))
}

/** What the camera is over right now, given where it sits and which way is up on screen. */
export function viewFrom(direction: Vector3, cameraUp: Vector3, radii: number, frame: Quaternion): EarthView {
  inverse.copy(frame).invert()
  const local = scratch.copy(direction).applyQuaternion(inverse).normalize()
  const { lat, lon } = surfaceOf(local)
  const up = cameraUp.clone().applyQuaternion(inverse)
  const north = new Vector3(0, 1, 0).addScaledVector(local, -local.y).normalize()
  const east = new Vector3().crossVectors(north, local).normalize()
  return { lat, lon, bearing: MathUtils.radToDeg(Math.atan2(up.dot(east), up.dot(north))), radii }
}

/** The world direction above a place, for the way back to space. */
export function worldDirectionOf(lat: number, lon: number, frame: Quaternion) {
  return directionOf(lat, lon, new Vector3()).applyQuaternion(frame)
}

// MapLibre draws the globe worldSize / (2π cos lat) pixels wide in radius, and its camera sits
// half a screen / tan(fov / 2) above the surface. Matching that height in radii matches the view.
const cameraHeight = (height: number, fov: number) => (0.5 * height) / Math.tan(MathUtils.degToRad(fov / 2))
const latitudeScale = (lat: number) => Math.cos(MathUtils.degToRad(lat)) * 2 * Math.PI

export function zoomFor(radii: number, lat: number, height: number, fov: number) {
  const radiusPx = cameraHeight(height, fov) / (radii - 1)
  return Math.log2((radiusPx * latitudeScale(lat)) / 512)
}

export function radiiFor(zoom: number, lat: number, height: number, fov: number) {
  const radiusPx = (512 * 2 ** zoom) / latitudeScale(lat)
  return cameraHeight(height, fov) / radiusPx + 1
}
