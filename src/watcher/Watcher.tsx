import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DirectionalLight, Group, Line as ThreeLine, LineBasicMaterial,
  Matrix4, Object3D, PointLight, Quaternion, ShaderMaterial, Vector3,
} from 'three'
import { WATCHER } from '../planets/planetData'
import { sunPosition } from '../planets/PlanetRegistry'
import { useApp } from '../state/store'
import { useWatcherModel } from './WatcherModel'
import { watcherState } from './WatcherState'
import { observationPoint } from './ObservationSystem'

const lookTarget = new Vector3()
const headWorld = new Vector3()
const eyeA = new Vector3()
const eyeB = new Vector3()
const up = new Vector3(0, 1, 0)
const m = new Matrix4()
const bodyGoal = new Quaternion()
const headGoal = new Quaternion()
const parentQuat = new Quaternion()
const rimOffset = new Vector3()
const bodyAim = new Vector3()
const HALO_SPEEDS = [0.018, -0.03, 0.05]

/** Turns an object's +Z toward a world point, limited to a cone around its rest pose. */
function aimLimited(object: Object3D, rest: Quaternion, point: Vector3, limit: number, damping: number) {
  object.getWorldPosition(headWorld)
  object.parent!.getWorldQuaternion(parentQuat)
  m.lookAt(point, headWorld, up) // +Z points at the target
  headGoal.setFromRotationMatrix(m).premultiply(parentQuat.invert())
  const angle = rest.angleTo(headGoal)
  if (angle > limit) headGoal.copy(rest).rotateTowards(headGoal, limit)
  object.quaternion.slerp(headGoal, damping)
}

const auraVert = /* glsl */ `
attribute float aSeed;
varying float vFade;
uniform float uTime;
uniform float uReach;
void main() {
  float life = fract(uTime * 0.018 * (0.4 + aSeed) + aSeed * 7.0);
  vec3 p = position;
  float a = aSeed * 40.0 + life * 2.4;
  p.xz += vec2(cos(a), sin(a)) * life * 0.7;
  p.y += life * 3.2;
  vFade = smoothstep(0.0, 0.14, life) * smoothstep(1.0, 0.4, life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((0.8 + aSeed * 1.4) * uReach / max(-mv.z, 1.0), 1.0, 4.5);
}`

const auraFrag = /* glsl */ `
varying float vFade;
void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  if (r > 1.0) discard;
  gl_FragColor = vec4(vec3(0.5, 0.34, 1.2) * pow(1.0 - r, 2.0) * vFade * 0.6, 1.0);
}`

function HemMotes() {
  const geometry = useMemo(() => {
    const n = 1800
    const pos = new Float32Array(n * 3), seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.4
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = -3.9 + Math.random() * 1.2
      pos[i * 3 + 2] = Math.sin(a) * r - 0.8
      seed[i] = Math.random()
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 1))
    return g
  }, [])
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: auraVert, fragmentShader: auraFrag, blending: AdditiveBlending, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uReach: { value: WATCHER.scale * 70 } },
  }), [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useFrame(({ clock }) => { material.uniforms.uTime.value = clock.elapsedTime })
  return <points geometry={geometry} material={material} frustumCulled={false} />
}

/** A faint line from his eyes to whatever holds his attention. */
function GazeLine() {
  const line = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3))
    const mat = new LineBasicMaterial({ transparent: true, opacity: 0.07, depthWrite: false, blending: AdditiveBlending })
    mat.color.setRGB(1.5, 1.05, 0.5)
    const l = new ThreeLine(g, mat)
    l.frustumCulled = false
    return l
  }, [])
  useEffect(() => () => { line.geometry.dispose(); (line.material as LineBasicMaterial).dispose() }, [line])
  useFrame(() => {
    const { showGaze, mode } = useApp.getState()
    line.visible = showGaze && mode !== 'watcher'
    const p = line.geometry.attributes.position as BufferAttribute
    p.setXYZ(0, watcherState.eyePosition.x, watcherState.eyePosition.y, watcherState.eyePosition.z)
    observationPoint(lookTarget)
    p.setXYZ(1, lookTarget.x, lookTarget.y, lookTarget.z)
    p.needsUpdate = true
  })
  return <primitive object={line} />
}

export function Watcher({ shadowMapSize }: { shadowMapSize: number }) {
  const rig = useWatcherModel()
  const group = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const key = useRef<DirectionalLight>(null)
  const rim = useRef<PointLight>(null)
  const placed = useRef(false)

  const headRest = useMemo(() => (rig.head ? rig.head.quaternion.clone() : new Quaternion()), [rig])
  const home = useMemo(() => new Vector3(...WATCHER.position), [])

  useEffect(() => {
    const light = key.current
    if (!light) return
    light.target = group.current!
    const s = WATCHER.scale * 5
    const c = light.shadow.camera
    c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = WATCHER.scale; c.far = WATCHER.scale * 30
    light.shadow.bias = -0.0004
    light.shadow.normalBias = WATCHER.scale * 0.01
    c.updateProjectionMatrix()
  }, [])

  useFrame(({ clock }, delta) => {
    if (!group.current || !inner.current) return
    const t = clock.elapsedTime
    const state = watcherState

    // He drifts as if suspended in slow water.
    group.current.position.set(
      home.x + Math.sin(t * 0.07) * WATCHER.scale * 0.04,
      home.y + Math.sin(t * 0.11) * WATCHER.scale * 0.1,
      home.z + Math.cos(t * 0.06) * WATCHER.scale * 0.04,
    )
    inner.current.rotation.z = Math.sin(t * 0.13) * 0.012
    inner.current.rotation.x = Math.sin(t * 0.1 + 1) * 0.012

    // The body slowly turns to what he is observing, staying upright; the head does the rest.
    observationPoint(lookTarget)
    bodyAim.set(lookTarget.x, group.current.position.y, lookTarget.z)
    m.lookAt(bodyAim, group.current.position, up)
    bodyGoal.setFromRotationMatrix(m)
    group.current.quaternion.slerp(bodyGoal, placed.current ? 0.008 : 1)
    placed.current = true

    state.position.copy(group.current.position)
    state.rotation.copy(group.current.quaternion)
    state.focus.copy(group.current.position).setY(group.current.position.y + WATCHER.scale * 2.3)

    if (rig.head) {
      group.current.updateMatrixWorld(true)
      aimLimited(rig.head, headRest, lookTarget, 0.3, 0.02)
      rig.head.updateMatrixWorld(true)
      if (rig.eyeL && rig.eyeR) {
        rig.eyeL.getWorldPosition(eyeA)
        rig.eyeR.getWorldPosition(eyeB)
        state.eyePosition.copy(eyeA).add(eyeB).multiplyScalar(0.5)
        for (const eye of [rig.eyeL, rig.eyeR]) {
          eye.lookAt(lookTarget)
        }
      } else {
        rig.head.getWorldPosition(state.eyePosition)
      }
      rig.head.getWorldDirection(state.viewDirection)
    }
    rig.root.visible = !state.headHidden

    // The astrolabe behind him keeps turning, each ring at its own pace.
    rig.halos.forEach((halo, i) => halo.rotateZ(delta * HALO_SPEEDS[i]))

    if (key.current) {
      key.current.position.copy(group.current.position).add(headWorld.copy(sunPosition).sub(group.current.position).normalize().multiplyScalar(WATCHER.scale * 15))
    }
    if (rim.current) {
      // A cool kicker from behind and to one side, so he separates from the nebula.
      rim.current.position.copy(group.current.position).add(rimOffset.set(-2.8, 3, -3.6).multiplyScalar(WATCHER.scale).applyQuaternion(group.current.quaternion))
    }
  })

  return (
    <>
      <group ref={group} position={WATCHER.position} scale={WATCHER.scale}>
        <group ref={inner}>
          <primitive object={rig.root} />
          <HemMotes />
        </group>
      </group>
      <directionalLight ref={key} color="#ffe2bd" intensity={2.6} castShadow={shadowMapSize > 0} shadow-mapSize={[shadowMapSize || 512, shadowMapSize || 512]} />
      <pointLight ref={rim} color="#7a5bff" intensity={95 * WATCHER.scale * WATCHER.scale} distance={WATCHER.scale * 22} decay={2} />
      <GazeLine />
    </>
  )
}

