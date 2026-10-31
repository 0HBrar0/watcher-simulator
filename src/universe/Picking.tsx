import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Vector2, Vector3, Raycaster, type PerspectiveCamera } from 'three'
import { allTargets, type Target } from '../planets/PlanetRegistry'
import { useApp, WATCHER_ID } from '../state/store'
import { WATCHER } from '../planets/planetData'
import { watcherState } from '../watcher/WatcherState'

const ndc = new Vector2()
const ray = new Raycaster()
const oc = new Vector3()
const project = new Vector3()
const FORGIVENESS_PX = 16

function hitSphere(center: Vector3, radius: number) {
  oc.copy(ray.ray.origin).sub(center)
  const b = oc.dot(ray.ray.direction), c = oc.dot(oc) - radius * radius, h = b * b - c
  if (h < 0) return Infinity
  const t = -b - Math.sqrt(h)
  return t > 0 ? t : Infinity
}

// He is a tall figure, not a ball: a stack of spheres follows his silhouette (height, radius).
const FIGURE: [number, number][] = [[3.5, 1.05], [2, 1.35], [0.2, 1.3], [-2, 1.7]]
const spot = new Vector3()

function intersect(target: Target) {
  if (target.id !== WATCHER_ID) return hitSphere(target.position, target.radius)
  let t = Infinity
  for (const [y, r] of FIGURE) {
    spot.copy(watcherState.position).setY(watcherState.position.y + y * WATCHER.scale)
    t = Math.min(t, hitSphere(spot, r * WATCHER.scale))
  }
  return t
}

/**
 * Everything pickable is close to a sphere, so picking is analytic: nearest hit along the ray
 * wins, which stays correct when bodies overlap on screen. If the ray hits nothing, the object
 * whose on-screen disc is closest to the cursor still wins, so tiny far worlds are clickable.
 */
function pick(x: number, y: number, width: number, height: number, camera: PerspectiveCamera): string | null {
  ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  let best: string | null = null, bestT = Infinity
  for (const target of allTargets) {
    if (target.id === WATCHER_ID && watcherState.headHidden) continue
    const t = intersect(target)
    if (t < bestT) { bestT = t; best = target.id }
  }
  if (best) return best

  let bestDist = FORGIVENESS_PX
  const pxPerUnit = height / (2 * Math.tan((camera.fov * Math.PI) / 360))
  for (const target of allTargets) {
    project.copy(target.position).project(camera)
    if (project.z > 1) continue
    const dx = ((project.x + 1) / 2) * width - x
    const dy = ((1 - project.y) / 2) * height - y
    const screenRadius = (target.radius / camera.position.distanceTo(target.position)) * pxPerUnit
    if (target.id === WATCHER_ID && screenRadius > 40) continue // already handled by his silhouette
    const d = Math.sqrt(dx * dx + dy * dy) - screenRadius
    if (d < bestDist) { bestDist = d; best = target.id }
  }
  return best
}

export function Picking() {
  const dom = useThree((s) => s.gl.domElement)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const down = useRef<{ x: number; y: number; time: number } | null>(null)

  useEffect(() => {
    const rect = () => dom.getBoundingClientRect()

    const onMove = (e: PointerEvent) => {
      if (down.current) return
      const r = rect()
      if (!(e.target instanceof HTMLCanvasElement)) { useApp.getState().hover(null); return }
      const id = pick(e.clientX - r.left, e.clientY - r.top, r.width, r.height, camera)
      useApp.getState().hover(id)
      dom.style.cursor = id ? 'pointer' : 'grab'
    }
    const onDown = (e: PointerEvent) => {
      if (e.button === 0 && e.target instanceof HTMLCanvasElement) down.current = { x: e.clientX, y: e.clientY, time: performance.now() }
      if (e.target instanceof HTMLCanvasElement) dom.style.cursor = 'grabbing'
    }
    const onUp = (e: PointerEvent) => {
      const d = down.current
      down.current = null
      dom.style.cursor = 'grab'
      if (!d) return
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
      if (moved > 6 || performance.now() - d.time > 500) return
      const r = rect()
      const app = useApp.getState()
      // Mid-journey the sky is sliding past, so a click on it means nothing.
      if (app.travelling && !app.intro) return
      const id = pick(e.clientX - r.left, e.clientY - r.top, r.width, r.height, camera)
      if (!id) { app.select(null); return }
      app.select(id)
      // The Watcher is a character: selecting him offers choices instead of flying at once.
      if (id !== WATCHER.id) app.requestCamera({ kind: 'focus', id })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dom, camera])

  return null
}
