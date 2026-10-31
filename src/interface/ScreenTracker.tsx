import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { getTarget } from '../planets/PlanetRegistry'
import { useApp } from '../state/store'
import { readout } from '../camera/cameraInput'

const p = new Vector3()
const RAIL_LINGER = 1.8 // seconds the zoom rail stays after the last zoom
let fpsFrames = 0
let fpsSince = 0

/** DOM nodes the 3D loop writes to directly, so labels never trigger a React render. */
export const trackers = {
  label: null as HTMLElement | null,
  locator: null as HTMLElement | null,
  locatorArrow: null as HTMLElement | null,
  rail: null as HTMLElement | null,
  railTrack: null as HTMLElement | null,
  railThumb: null as HTMLElement | null,
  railLabel: null as HTMLElement | null,
  fps: null as HTMLElement | null,
}

export function ScreenTracker() {
  const size = useThree((s) => s.size)

  useFrame(({ camera }) => {
    const { hoveredId, mode, travelling, prefs } = useApp.getState()

    if (trackers.rail && trackers.railThumb && trackers.railLabel) {
      const now = performance.now() / 1000
      const awake = (readout.held || now - readout.touched < RAIL_LINGER) && !travelling
      trackers.rail.classList.toggle('rail--on', awake)
      if (awake) {
        const zoom = Math.min(Math.max(readout.zoom, 0), 1)
        trackers.railThumb.style.top = `${(1 - zoom) * 100}%`
        trackers.railLabel.textContent = readout.fine ? `${readout.label} · fine` : readout.label
        trackers.railTrack?.setAttribute('aria-valuenow', String(Math.round(zoom * 100)))
      }
    }

    if (trackers.fps) {
      fpsFrames++
      const now = performance.now()
      if (now - fpsSince > 500) {
        trackers.fps.textContent = prefs.showFps ? `${Math.round((fpsFrames * 1000) / (now - fpsSince))} fps` : ''
        fpsFrames = 0
        fpsSince = now
      }
    }

    if (trackers.label) {
      const target = getTarget(hoveredId)
      if (target) {
        p.copy(target.position).project(camera)
        const x = ((p.x + 1) / 2) * size.width
        const y = ((1 - p.y) / 2) * size.height
        const pxRadius = (target.radius / camera.position.distanceTo(target.position)) * size.height / (2 * Math.tan(0.33))
        trackers.label.style.opacity = '1'
        trackers.label.style.transform = `translate(${x}px, ${Math.max(y - pxRadius - 26, 40)}px) translateX(-50%)`
        trackers.label.textContent = target.name
      } else {
        trackers.label.style.opacity = '0'
      }
    }

    if (trackers.locator) {
      // When he is off-screen, a small mark on the edge shows where he is.
      const watcher = getTarget('watcher')!
      p.copy(watcher.position).project(camera)
      const behind = p.z > 1
      if (behind) p.multiplyScalar(-1)
      const onScreen = !behind && Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.92
      const show = !onScreen && mode !== 'watcher' && !travelling
      trackers.locator.style.opacity = show ? '1' : '0'
      trackers.locator.style.pointerEvents = show ? 'auto' : 'none'
      if (show) {
        const a = Math.atan2(p.y, p.x)
        const k = 0.82 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)))
        const x = ((Math.cos(a) * k + 1) / 2) * size.width
        const y = ((1 - Math.sin(a) * k) / 2) * size.height
        trackers.locator.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
        if (trackers.locatorArrow) trackers.locatorArrow.style.transform = `rotate(${-a}rad)`
      }
    }
  })

  return null
}
