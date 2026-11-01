import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { UNIVERSE, WATCHER } from '../planets/planetData'
import { allTargets, getTarget, sunPosition } from '../planets/PlanetRegistry'
import { useApp, WATCHER_ID } from '../state/store'
import { watcherState } from '../watcher/WatcherState'
import { observationPoint } from '../watcher/ObservationSystem'
import { buildPath, easeInOut, easeOut, samplePath, type FlightPath } from './cameraPath'
import { cameraCommands, readout } from './cameraInput'

type Rig = 'orbit' | 'travel' | 'pov'

const BASE_FOV = 38
const POV_FOV_MIN = 6
const POV_FOV_MAX = 62
const FREE_MIN_DIST = 60

// Input moves a goal and the camera eases onto it at a rate set in seconds, so a pixel of drag
// means the same thing at 20 fps as at 144.
const RESPONSE = 13
const LOOK_RATE = 0.0021 // radians per pixel at the default field of view
const WHEEL_RATE = 0.00055 // a standard wheel notch of 100 moves about 5.5%
const PINCH_BOOST = 6 // trackpad pinches report much smaller deltas than a wheel
const FINE = 0.25 // holding Alt

const v1 = new Vector3()
const v2 = new Vector3()
const v3 = new Vector3()
const m1 = new Matrix4()
const q1 = new Quaternion()
const up = new Vector3(0, 1, 0)
const euler = new Euler(0, 0, 0, 'YXZ')

/** Keys that report differently with Shift held still have to release cleanly. */
const normalKey = (key: string) => {
  const k = key.toLowerCase()
  return k === '+' ? '=' : k === '_' ? '-' : k
}
const MOTION_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e'])
const NUDGE_KEYS = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', '=', '-'])

/**
 * The one camera. It is always in one of three rigs: orbiting a pivot (free observer and
 * planetary perspective differ only in the pivot and limits), flying along a path, or locked
 * to the Watcher's eyes. Any user input during a flight drops back into orbit where it stands.
 */
export function CameraManager() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const dom = useThree((s) => s.gl.domElement)

  const s = useRef({
    rig: 'travel' as Rig,
    pivot: new Vector3(...UNIVERSE.overview.pivot),
    yaw: 0, pitch: 0, dist: 500,
    goalPivot: new Vector3(...UNIVERSE.overview.pivot),
    goalYaw: 0, goalPitch: 0, goalDist: 500,
    followId: null as string | null,
    minDist: 40, maxDist: 3000,

    path: { p0: new Vector3(), p1: new Vector3(), p2: new Vector3(), p3: new Vector3() } as FlightPath,
    t: 0, duration: 1,
    lookFrom: new Vector3(), lookTo: new Vector3(), lookOffset: new Vector3(),
    fromQuat: new Quaternion(), toQuat: new Quaternion(),
    arriveAs: 'orbit' as 'orbit' | 'pov',
    arriveId: null as string | null,
    isIntro: true,

    povFov: 40, povGoalFov: 40,
    povYaw: 0, povPitch: 0, povGoalYaw: 0, povGoalPitch: 0,
    keys: new Set<string>(),
    lastInput: -100,
    dragging: 0, // 0 none, 1 orbit, 2 pan
    px: 0, py: 0,
  }).current

  const setOrbitFromCamera = () => {
    v1.copy(camera.position).sub(s.pivot)
    s.dist = s.goalDist = v1.length()
    s.yaw = s.goalYaw = Math.atan2(v1.x, v1.z)
    s.pitch = s.goalPitch = Math.asin(MathUtils.clamp(v1.y / s.dist, -1, 1))
    s.goalPivot.copy(s.pivot)
  }

  const stopFlight = () => {
    // Keep what the user sees: pivot sits ahead of the camera, along its current view.
    camera.getWorldDirection(v2)
    const reach = Math.max(s.pivot.distanceTo(camera.position) * 0.5, 140)
    s.pivot.copy(camera.position).addScaledVector(v2, reach)
    s.followId = null
    s.minDist = FREE_MIN_DIST
    s.maxDist = UNIVERSE.boundary
    s.rig = 'orbit'
    setOrbitFromCamera()
    useApp.getState().setCamera({ travelling: false, intro: false, mode: 'observer', focusId: null })
  }

  const interrupt = () => {
    s.lastInput = performance.now() / 1000
    if (s.rig === 'travel') stopFlight()
  }

  const beginFlight = (to: Vector3, look: Vector3, seconds: number, arriveAs: 'orbit' | 'pov', arriveId: string | null) => {
    camera.getWorldDirection(v2)
    buildPath(s.path, camera.position, to, v2, arriveId ?? undefined)
    s.t = 0
    s.duration = seconds
    s.arriveAs = arriveAs
    s.arriveId = arriveId
    s.fromQuat.copy(camera.quaternion)
    s.lookTo.copy(look)
    s.rig = 'travel'
    s.isIntro = false
    watcherState.headHidden = false
    useApp.getState().setCamera({ travelling: true, intro: false })
  }

  const viewpoint = (id: string, out: Vector3) => {
    const target = getTarget(id)!
    const view = target.view
    // Framing is relative to the sun, so arrivals always find the lit, sculpted side.
    v1.copy(sunPosition).sub(target.position).normalize()
    const base = Math.atan2(v1.x, v1.z) + MathUtils.degToRad(view.azimuth)
    const el = MathUtils.degToRad(view.elevation)
    const d = target.radius * view.distance
    return out.set(Math.sin(base) * Math.cos(el), Math.sin(el), Math.cos(base) * Math.cos(el)).multiplyScalar(d).add(target.position)
  }

  const durationFor = (from: Vector3, to: Vector3) => MathUtils.clamp(2.4 + from.distanceTo(to) / 1500, 3, 8.5)

  /** Near a surface, the same drag should sweep less of it. */
  const closeness = () => {
    const target = getTarget(s.followId)
    return target ? MathUtils.clamp((s.dist - target.radius) / (target.radius * 1.6), 0.22, 1) : 1
  }

  const applyZoom = (factor: number) => {
    readout.touched = performance.now() / 1000
    if (s.rig === 'pov') {
      s.povGoalFov = MathUtils.clamp(s.povGoalFov * factor, POV_FOV_MIN, POV_FOV_MAX)
    } else if (s.rig === 'orbit') {
      const next = s.goalDist * factor
      if (!s.followId && next < s.minDist) {
        // In open space there is nothing to stop at, so zooming in becomes flying forward.
        camera.getWorldDirection(v2)
        s.goalPivot.addScaledVector(v2, s.minDist - next)
      }
      s.goalDist = MathUtils.clamp(next, s.minDist, s.maxDist)
    }
  }

  useEffect(() => {
    // The opening shot starts wide and slowly settles on the hero composition.
    camera.position.fromArray(UNIVERSE.introStart.position)
    camera.lookAt(...UNIVERSE.introStart.pivot)
    camera.fov = BASE_FOV
    camera.near = 1
    camera.far = 40000
    camera.updateProjectionMatrix()
    buildPath(s.path, camera.position, v1.fromArray(UNIVERSE.overview.position), v2.set(0, 0, -1).applyQuaternion(camera.quaternion))
    s.fromQuat.copy(camera.quaternion)
    s.lookTo.fromArray(UNIVERSE.overview.pivot)
    s.t = 0
    s.duration = 15
    s.arriveAs = 'orbit'
    s.arriveId = null
    s.isIntro = true
    s.rig = 'travel'
    // A quality change rebuilds the renderer; that must not replay the opening.
    const replay = useApp.getState().intro
    useApp.getState().setCamera({ travelling: true, intro: replay, mode: 'observer', focusId: null })

    const params = new URLSearchParams(location.search)
    if (params.has('skipIntro') || !replay) s.t = 0.999
    // A shared link opens straight on its world.
    const linked = replay ? params.get('world') : null
    const linkTimer = linked && getTarget(linked) ? setTimeout(() => {
      s.t = 0.999
      useApp.getState().select(linked)
      useApp.getState().requestCamera({ kind: 'focus', id: linked })
    }, 0) : undefined
    if (import.meta.env.DEV) {
      // Lets a test harness frame exact shots: __shot([x,y,z],[x,y,z]) or __shot('earth', 3).
      Object.assign(window, {
        __camera: camera,
        __shot: (a: [number, number, number] | string, b: [number, number, number] | number) => {
          const t = typeof a === 'string' ? getTarget(a)! : null
          s.rig = 'orbit'
          s.followId = t ? t.id : null
          s.minDist = 1
          s.maxDist = 1e5
          if (t) { s.pivot.copy(t.position); s.goalPivot.copy(t.position); s.dist = s.goalDist = t.radius * (b as number) }
          else { s.pivot.fromArray(b as number[]); camera.position.fromArray(a as number[]); setOrbitFromCamera() }
          s.lastInput = 1e12
          useApp.getState().setCamera({ travelling: false, intro: false })
        },
        __orbit: (yaw: number, pitch: number) => { s.yaw = s.goalYaw = yaw; s.pitch = s.goalPitch = pitch },
      })
    }

    cameraCommands.zoomTo = (t) => {
      readout.touched = performance.now() / 1000
      if (s.rig === 'pov') s.povGoalFov = POV_FOV_MAX * (POV_FOV_MIN / POV_FOV_MAX) ** t
      else if (s.rig === 'orbit') s.goalDist = s.maxDist * (s.minDist / s.maxDist) ** t
    }
    cameraCommands.zoomStep = (direction) => applyZoom(Math.exp(-direction * 0.22))

    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return
      s.lastInput = performance.now() / 1000
      s.dragging = e.button === 0 && !e.shiftKey ? 1 : 2
      s.px = e.clientX
      s.py = e.clientY
      dom.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!s.dragging) return
      // A flight is never stopped by the mouse. Keep tracking it so the look doesn't jump on arrival.
      if (s.rig === 'travel') {
        s.px = e.clientX
        s.py = e.clientY
        return
      }
      const dx = e.clientX - s.px, dy = e.clientY - s.py
      s.px = e.clientX
      s.py = e.clientY
      s.lastInput = performance.now() / 1000
      const fine = e.altKey ? FINE : 1
      const look = LOOK_RATE * useApp.getState().prefs.lookSpeed * fine * (camera.fov / BASE_FOV)
      if (s.rig === 'pov') {
        s.povGoalYaw = MathUtils.clamp(s.povGoalYaw - dx * look, -2.2, 2.2)
        s.povGoalPitch = MathUtils.clamp(s.povGoalPitch - dy * look, -1.2, 1.2)
      } else if (s.dragging === 1) {
        s.goalYaw -= dx * look * closeness()
        s.goalPitch = MathUtils.clamp(s.goalPitch + dy * look * closeness(), -1.45, 1.45)
      } else if (!s.followId) {
        // One to one: the point under the cursor stays under the cursor.
        const k = (2 * s.dist * Math.tan(MathUtils.degToRad(camera.fov / 2)) / dom.clientHeight) * fine
        v1.set(-dx * k, dy * k, 0).applyQuaternion(camera.quaternion)
        s.goalPivot.add(v1)
      }
    }
    const onUp = () => { s.dragging = 0 }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      interrupt()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1
      const pinch = e.ctrlKey ? PINCH_BOOST : 1
      const amount = MathUtils.clamp(e.deltaY * unit * pinch, -200, 200)
      applyZoom(Math.exp(amount * WHEEL_RATE * useApp.getState().prefs.zoomSpeed * (e.altKey ? FINE : 1)))
    }
    // A right-drag pans, so it must not end in the browser's menu.
    const onContextMenu = (e: Event) => e.preventDefault()
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey) return
      const key = normalKey(e.key)
      if (key === 'alt') { e.preventDefault(); readout.fine = true; s.keys.add(key) }
      if (key === 'shift') s.keys.add(key)
      if (MOTION_KEYS.has(key)) {
        interrupt()
        // Moving means leaving a body or his eyes; go back to free flight.
        if (s.rig === 'pov' || s.followId) useApp.getState().requestCamera({ kind: 'free' })
        s.keys.add(key)
      }
      if (NUDGE_KEYS.has(key)) {
        e.preventDefault()
        interrupt()
        s.keys.add(key)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const key = normalKey(e.key)
      s.keys.delete(key)
      if (key === 'alt') readout.fine = false
    }
    // Keys released while the window is in the background would otherwise stay held.
    const onBlur = () => { s.keys.clear(); s.dragging = 0; readout.fine = false }

    dom.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    dom.addEventListener('wheel', onWheel, { passive: false })
    dom.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      clearTimeout(linkTimer)
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dom.removeEventListener('wheel', onWheel)
      dom.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, dom])

  // Requests from the interface and from picking.
  const request = useApp((a) => a.request)
  useEffect(() => {
    if (!request) return
    const app = useApp.getState()
    if (request.kind === 'focus') {
      const target = getTarget(request.id)
      if (!target) return
      // Asking again for where you are already going must not restart the journey.
      if (s.rig === 'travel' && s.arriveAs === 'orbit' && s.arriveId === request.id) return
      viewpoint(request.id, v3)
      beginFlight(v3.clone(), target.position, durationFor(camera.position, v3), 'orbit', request.id)
      app.setCamera({ mode: request.id === WATCHER_ID ? 'observer' : 'planet', focusId: request.id })
    } else if (request.kind === 'watcherPov') {
      if (s.rig === 'pov' || (s.rig === 'travel' && s.arriveAs === 'pov')) return
      observationPoint(v1)
      // A long lens: his subject fills the view, the way close attention does.
      const subject = getTarget(watcherState.targetId)
      const gap = v1.distanceTo(watcherState.eyePosition)
      s.povFov = subject ? MathUtils.clamp(2 * MathUtils.radToDeg(Math.atan((subject.radius * 3.4) / gap)), 8, 46) : 40
      beginFlight(watcherState.eyePosition.clone(), v1.clone(), durationFor(camera.position, watcherState.eyePosition) + 1, 'pov', WATCHER_ID)
      app.setCamera({ mode: 'watcher', focusId: null })
    } else if (request.kind === 'overview') {
      watcherState.headHidden = false
      s.followId = null
      s.pivot.fromArray(UNIVERSE.overview.pivot)
      v3.fromArray(UNIVERSE.overview.position)
      beginFlight(v3.clone(), s.pivot, durationFor(camera.position, v3), 'orbit', null)
      app.setCamera({ mode: 'observer', focusId: null })
      app.select(null)
    } else if (request.kind === 'free') {
      watcherState.headHidden = false
      if (s.rig === 'travel') stopFlight()
      else if (s.rig === 'pov') {
        // Stepping out of his eyes means pulling back to see him.
        viewpoint(WATCHER_ID, v3)
        beginFlight(v3.clone(), watcherState.focus, durationFor(camera.position, v3), 'orbit', WATCHER_ID)
        app.setCamera({ mode: 'observer', focusId: null })
      } else {
        camera.getWorldDirection(v2)
        s.pivot.copy(camera.position).addScaledVector(v2, Math.max(s.dist * 0.5, 80))
        s.followId = null
        s.minDist = FREE_MIN_DIST
        s.maxDist = UNIVERSE.boundary
        s.rig = 'orbit'
        setOrbitFromCamera()
        camera.fov = BASE_FOV
        camera.updateProjectionMatrix()
        app.setCamera({ mode: 'observer', focusId: null })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    const now = performance.now() / 1000
    const ease = 1 - Math.exp(-delta * RESPONSE)
    const { prefs } = useApp.getState()
    const pace = (s.keys.has('alt') ? FINE : 1) * (s.keys.has('shift') ? 3 : 1)

    if (s.rig === 'travel') {
      s.t = Math.min(1, s.t + delta / s.duration)
      const p = s.isIntro ? easeOut(s.t) : easeInOut(s.t)

      // A moving destination (the Watcher, an orbiting moon) stays reachable.
      if (s.arriveAs === 'pov') { s.path.p3.copy(watcherState.eyePosition); observationPoint(s.lookTo) }
      else if (s.arriveId) s.lookTo.copy(getTarget(s.arriveId)!.position)

      samplePath(s.path, p, camera.position)
      m1.lookAt(camera.position, s.lookTo, up)
      s.toQuat.setFromRotationMatrix(m1)
      camera.quaternion.copy(s.fromQuat).slerp(s.toQuat, MathUtils.smootherstep(p, 0, 0.72))

      const breathe = Math.sin(Math.PI * p) * (s.isIntro ? 0 : 7)
      camera.fov = BASE_FOV + breathe + (s.arriveAs === 'pov' ? (s.povFov - BASE_FOV) * p : 0)
      camera.updateProjectionMatrix()

      if (s.arriveAs === 'pov' && p > 0.93) watcherState.headHidden = true

      if (s.t >= 1) {
        const app = useApp.getState()
        if (s.arriveAs === 'pov') {
          s.rig = 'pov'
          s.povYaw = s.povPitch = s.povGoalYaw = s.povGoalPitch = 0
          s.povGoalFov = s.povFov
        } else {
          s.rig = 'orbit'
          s.followId = s.arriveId
          const target = getTarget(s.arriveId)
          if (target) {
            s.pivot.copy(target.position)
            s.minDist = target.radius * (target.id === WATCHER_ID ? 1.0 : 1.14)
            s.maxDist = target.radius * 16
          } else {
            s.pivot.copy(s.lookTo)
            s.minDist = FREE_MIN_DIST
            s.maxDist = UNIVERSE.boundary
          }
          setOrbitFromCamera()
        }
        s.lastInput = now
        app.setCamera({ travelling: false, intro: false })
      }
    }

    if (s.rig === 'orbit') {
      const target = getTarget(s.followId)

      const nudge = delta * 0.75 * prefs.lookSpeed * pace * closeness()
      if (s.keys.has('arrowleft')) s.goalYaw -= nudge
      if (s.keys.has('arrowright')) s.goalYaw += nudge
      if (s.keys.has('arrowup')) s.goalPitch = Math.min(s.goalPitch + nudge, 1.45)
      if (s.keys.has('arrowdown')) s.goalPitch = Math.max(s.goalPitch - nudge, -1.45)
      if (s.keys.has('=')) applyZoom(Math.exp(-delta * 0.9 * prefs.zoomSpeed * pace))
      if (s.keys.has('-')) applyZoom(Math.exp(delta * 0.9 * prefs.zoomSpeed * pace))

      if (target) {
        s.pivot.copy(target.position)
        s.goalPivot.copy(target.position)
      } else {
        const speed = Math.max(s.dist * 0.5, 170) * delta * pace
        camera.getWorldDirection(v1)
        v2.crossVectors(v1, up).normalize()
        if (s.keys.has('w')) s.goalPivot.addScaledVector(v1, speed)
        if (s.keys.has('s')) s.goalPivot.addScaledVector(v1, -speed)
        if (s.keys.has('a')) s.goalPivot.addScaledVector(v2, -speed)
        if (s.keys.has('d')) s.goalPivot.addScaledVector(v2, speed)
        if (s.keys.has('e')) s.goalPivot.addScaledVector(up, speed)
        if (s.keys.has('q')) s.goalPivot.addScaledVector(up, -speed)
        // Beyond the boundary the universe gently hands you back.
        const over = s.goalPivot.length() - UNIVERSE.boundary
        if (over > 0) s.goalPivot.multiplyScalar(1 - Math.min(over / s.goalPivot.length(), 1) * 0.05)
        s.pivot.lerp(s.goalPivot, ease)
      }

      s.yaw += (s.goalYaw - s.yaw) * ease
      s.pitch += (s.goalPitch - s.pitch) * ease
      // Distance eases on a log scale, so a zoom feels the same near and far.
      s.dist = Math.exp(MathUtils.lerp(Math.log(s.dist), Math.log(s.goalDist), ease))

      // An idle camera keeps a slow, contemplative drift.
      if (prefs.idleDrift && now - s.lastInput > 6 && !s.dragging) {
        const drift = delta * 0.0075 * MathUtils.smoothstep(now - s.lastInput, 6, 12)
        s.yaw += drift
        s.goalYaw += drift
      }

      const cp = Math.cos(s.pitch)
      camera.position.set(Math.sin(s.yaw) * cp, Math.sin(s.pitch), Math.cos(s.yaw) * cp).multiplyScalar(s.dist).add(s.pivot)

      for (const body of allTargets) {
        if (body.id === WATCHER_ID) continue
        const d = camera.position.distanceTo(body.position), keep = body.radius * 1.06
        if (d < keep) camera.position.sub(body.position).multiplyScalar(keep / d).add(body.position)
      }
      // He is a column of cloth, so the camera keeps clear of a line running down through him.
      v3.copy(watcherState.position)
      v3.y = MathUtils.clamp(camera.position.y, v3.y - WATCHER.scale * 3.2, v3.y + WATCHER.scale * 4.4)
      const clearance = camera.position.distanceTo(v3), keepOut = WATCHER.scale * 1.75
      if (clearance < keepOut) camera.position.sub(v3).multiplyScalar(keepOut / clearance).add(v3)
      camera.lookAt(s.pivot)
    }

    if (s.rig === 'pov') {
      const nudge = delta * 0.5 * prefs.lookSpeed * pace * (camera.fov / BASE_FOV)
      if (s.keys.has('arrowleft')) s.povGoalYaw = Math.min(s.povGoalYaw + nudge, 2.2)
      if (s.keys.has('arrowright')) s.povGoalYaw = Math.max(s.povGoalYaw - nudge, -2.2)
      if (s.keys.has('arrowup')) s.povGoalPitch = Math.min(s.povGoalPitch + nudge, 1.2)
      if (s.keys.has('arrowdown')) s.povGoalPitch = Math.max(s.povGoalPitch - nudge, -1.2)
      if (s.keys.has('=')) applyZoom(Math.exp(-delta * 0.9 * prefs.zoomSpeed * pace))
      if (s.keys.has('-')) applyZoom(Math.exp(delta * 0.9 * prefs.zoomSpeed * pace))

      if (now - s.lastInput > 5 && !s.dragging) {
        // Left alone, your gaze relaxes back onto what he is watching.
        s.povGoalYaw *= 1 - delta * 0.4
        s.povGoalPitch *= 1 - delta * 0.4
      }
      s.povYaw += (s.povGoalYaw - s.povYaw) * ease
      s.povPitch += (s.povGoalPitch - s.povPitch) * ease
      if (Math.abs(s.povGoalFov - camera.fov) > 0.002) {
        camera.fov = Math.exp(MathUtils.lerp(Math.log(camera.fov), Math.log(s.povGoalFov), ease))
        camera.updateProjectionMatrix()
      }
      camera.position.copy(watcherState.eyePosition)
      observationPoint(v1)
      m1.lookAt(camera.position, v1, up)
      camera.quaternion.setFromRotationMatrix(m1)
      euler.set(s.povPitch, s.povYaw, 0)
      q1.setFromEuler(euler)
      camera.quaternion.multiply(q1)
    }

    // Depth range follows the nearest surface, so close-ups don't clip and far views don't z-fight.
    let nearest = Infinity
    for (const body of allTargets) {
      nearest = Math.min(nearest, camera.position.distanceTo(body.position) - body.radius)
    }
    const near = s.rig === 'pov' ? WATCHER.scale * 0.1 : MathUtils.clamp(nearest * 0.2, 0.3, 90)
    if (Math.abs(near - camera.near) > camera.near * 0.2) {
      camera.near = near
      camera.updateProjectionMatrix()
    }

    if (s.rig === 'pov') {
      readout.zoom = Math.log(POV_FOV_MAX / s.povGoalFov) / Math.log(POV_FOV_MAX / POV_FOV_MIN)
      readout.label = `${(BASE_FOV / camera.fov).toFixed(1)}× lens`
    } else if (s.rig === 'orbit') {
      const target = getTarget(s.followId)
      readout.zoom = Math.log(s.maxDist / s.goalDist) / Math.log(s.maxDist / s.minDist)
      readout.label = target && target.id !== WATCHER_ID
        ? `${(s.dist / target.radius).toFixed(1)} radii`
        : `${Math.round(s.dist).toLocaleString()} units`
    }
  })

  return null
}
