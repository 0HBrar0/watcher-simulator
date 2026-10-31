import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { UNIVERSE } from '../planets/planetData'
import { allTargets, getTarget, sunPosition } from '../planets/PlanetRegistry'
import { useApp, WATCHER_ID } from '../state/store'
import { watcherState } from '../watcher/WatcherState'
import { observationPoint } from '../watcher/ObservationSystem'
import { buildPath, easeInOut, easeOut, samplePath, type FlightPath } from './cameraPath'

type Rig = 'orbit' | 'travel' | 'pov'

const BASE_FOV = 38
const v1 = new Vector3()
const v2 = new Vector3()
const v3 = new Vector3()
const m1 = new Matrix4()
const q1 = new Quaternion()
const up = new Vector3(0, 1, 0)
const euler = new Euler(0, 0, 0, 'YXZ')

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
    yawV: 0, pitchV: 0, zoomV: 0, panV: new Vector3(),
    followId: null as string | null,
    minDist: 40, maxDist: 3000,

    path: { p0: new Vector3(), p1: new Vector3(), p2: new Vector3(), p3: new Vector3() } as FlightPath,
    t: 0, duration: 1,
    lookFrom: new Vector3(), lookTo: new Vector3(), lookOffset: new Vector3(),
    fromQuat: new Quaternion(), toQuat: new Quaternion(),
    arriveAs: 'orbit' as 'orbit' | 'pov',
    arriveId: null as string | null,
    isIntro: true,

    povFov: 40, povYaw: 0, povPitch: 0, povYawV: 0, povPitchV: 0,
    keys: new Set<string>(),
    lastInput: -100,
    dragging: 0, // 0 none, 1 orbit, 2 pan
    px: 0, py: 0,
  }).current

  const setOrbitFromCamera = () => {
    v1.copy(camera.position).sub(s.pivot)
    s.dist = v1.length()
    s.yaw = Math.atan2(v1.x, v1.z)
    s.pitch = Math.asin(MathUtils.clamp(v1.y / s.dist, -1, 1))
  }

  const stopFlight = () => {
    // Keep what the user sees: pivot sits ahead of the camera, along its current view.
    camera.getWorldDirection(v2)
    const reach = Math.max(s.pivot.distanceTo(camera.position) * 0.5, 60)
    s.pivot.copy(camera.position).addScaledVector(v2, reach)
    s.followId = null
    s.minDist = 12
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

  const durationFor = (from: Vector3, to: Vector3) => MathUtils.clamp(2.4 + from.distanceTo(to) / 900, 3, 7.5)

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
    s.duration = 13
    s.arriveAs = 'orbit'
    s.arriveId = null
    s.isIntro = true
    s.rig = 'travel'
    // A quality change rebuilds the renderer; that must not replay the opening.
    const replay = useApp.getState().intro
    useApp.getState().setCamera({ travelling: true, intro: replay, mode: 'observer', focusId: null })

    const params = new URLSearchParams(location.search)
    if (params.has('skipIntro') || !replay) s.t = 0.999
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
          if (t) { s.pivot.copy(t.position); s.dist = t.radius * (b as number) }
          else { s.pivot.fromArray(b as number[]); camera.position.fromArray(a as number[]); setOrbitFromCamera() }
          s.lastInput = 1e12
          useApp.getState().setCamera({ travelling: false, intro: false })
        },
        __orbit: (yaw: number, pitch: number) => { s.yaw = yaw; s.pitch = pitch },
      })
    }

    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return
      interrupt()
      s.dragging = e.button === 0 && !e.shiftKey ? 1 : 2
      s.px = e.clientX
      s.py = e.clientY
      dom.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!s.dragging) return
      const dx = e.clientX - s.px, dy = e.clientY - s.py
      s.px = e.clientX
      s.py = e.clientY
      s.lastInput = performance.now() / 1000
      if (s.rig === 'pov') {
        s.povYawV -= dx * 0.0016
        s.povPitchV -= dy * 0.0016
      } else if (s.dragging === 1) {
        s.yawV -= dx * 0.0011
        s.pitchV += dy * 0.0011
      } else if (!s.followId) {
        const k = s.dist * 0.0011
        v1.set(-dx * k, dy * k, 0).applyQuaternion(camera.quaternion)
        s.panV.add(v1)
      }
    }
    const onUp = () => { s.dragging = 0 }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      interrupt()
      if (s.rig === 'pov') {
        camera.fov = MathUtils.clamp(camera.fov + e.deltaY * 0.01, 10, 62)
        camera.updateProjectionMatrix()
      } else {
        s.zoomV += MathUtils.clamp(e.deltaY, -240, 240) * 0.00042
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const key = e.key.toLowerCase()
      if ('wasdqe'.includes(key) && key.length === 1) {
        interrupt()
        // Moving means leaving a body or his eyes; go back to free flight.
        if (s.rig === 'pov' || s.followId) useApp.getState().requestCamera({ kind: 'free' })
        s.keys.add(key)
      }
      if (e.key === 'Escape') useApp.getState().requestCamera({ kind: 'overview' })
    }
    const onKeyUp = (e: KeyboardEvent) => s.keys.delete(e.key.toLowerCase())

    dom.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    dom.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dom.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
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
      viewpoint(request.id, v3)
      beginFlight(v3.clone(), target.position, durationFor(camera.position, v3), 'orbit', request.id)
      app.setCamera({ mode: request.id === WATCHER_ID ? 'observer' : 'planet', focusId: request.id })
    } else if (request.kind === 'watcherPov') {
      observationPoint(v1)
      // A long lens: his subject fills the view, the way close attention does.
      const subject = getTarget(watcherState.targetId)
      const gap = v1.distanceTo(watcherState.eyePosition)
      s.povFov = subject ? MathUtils.clamp(2 * MathUtils.radToDeg(Math.atan((subject.radius * 5) / gap)), 16, 46) : 40
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
        s.minDist = 12
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
    const delta = Math.min(rawDelta, 0.05)
    const now = performance.now() / 1000

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
          s.povYaw = s.povPitch = 0
          s.povYawV = s.povPitchV = 0
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
            s.minDist = 12
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
      if (target) s.pivot.copy(target.position)

      // Damped velocities give everything weight.
      s.yaw += s.yawV
      s.pitch = MathUtils.clamp(s.pitch + s.pitchV, -1.45, 1.45)
      s.dist = MathUtils.clamp(s.dist * Math.exp(s.zoomV), s.minDist, s.maxDist)
      const damp = Math.exp(-delta * 7.5)
      s.yawV *= damp
      s.pitchV *= damp
      s.zoomV *= Math.exp(-delta * 6)

      if (!s.followId) {
        s.pivot.add(s.panV)
        s.panV.multiplyScalar(Math.exp(-delta * 8))
        const speed = Math.max(s.dist * 0.9, 90) * delta
        camera.getWorldDirection(v1)
        v2.crossVectors(v1, up).normalize()
        if (s.keys.has('w')) s.pivot.addScaledVector(v1, speed)
        if (s.keys.has('s')) s.pivot.addScaledVector(v1, -speed)
        if (s.keys.has('a')) s.pivot.addScaledVector(v2, -speed)
        if (s.keys.has('d')) s.pivot.addScaledVector(v2, speed)
        if (s.keys.has('e')) s.pivot.addScaledVector(up, speed)
        if (s.keys.has('q')) s.pivot.addScaledVector(up, -speed)
        // Beyond the boundary the universe gently hands you back.
        const over = s.pivot.length() - UNIVERSE.boundary
        if (over > 0) s.pivot.multiplyScalar(1 - Math.min(over / s.pivot.length(), 1) * 0.05)
      }

      // An idle camera keeps a slow, contemplative drift.
      if (now - s.lastInput > 6 && !s.dragging) s.yaw += delta * 0.0075 * MathUtils.smoothstep(now - s.lastInput, 6, 12)

      const cp = Math.cos(s.pitch)
      camera.position.set(Math.sin(s.yaw) * cp, Math.sin(s.pitch), Math.cos(s.yaw) * cp).multiplyScalar(s.dist).add(s.pivot)

      for (const body of allTargets) {
        if (body.id === WATCHER_ID) continue
        const d = camera.position.distanceTo(body.position), keep = body.radius * 1.06
        if (d < keep) camera.position.sub(body.position).multiplyScalar(keep / d).add(body.position)
      }
      camera.lookAt(s.pivot)
    }

    if (s.rig === 'pov') {
      s.povYaw = MathUtils.clamp(s.povYaw + s.povYawV, -2.2, 2.2)
      s.povPitch = MathUtils.clamp(s.povPitch + s.povPitchV, -1.2, 1.2)
      const damp = Math.exp(-delta * 8)
      s.povYawV *= damp
      s.povPitchV *= damp
      if (now - s.lastInput > 5 && !s.dragging) {
        // Left alone, your gaze relaxes back onto what he is watching.
        s.povYaw *= 1 - delta * 0.4
        s.povPitch *= 1 - delta * 0.4
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
    const near = s.rig === 'pov' ? 0.5 : MathUtils.clamp(nearest * 0.2, 0.3, 40)
    if (Math.abs(near - camera.near) > camera.near * 0.2) {
      camera.near = near
      camera.updateProjectionMatrix()
    }
  })

  return null
}
