import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CustomBlending, Data3DTexture, HalfFloatType, LinearFilter, Matrix4, Mesh, OneFactor, OneMinusSrcAlphaFactor,
  OrthographicCamera, PlaneGeometry, RGFormat, RepeatWrapping, Scene, ShaderMaterial, Vector2, Vector3, Vector4,
  WebGLRenderTarget, UnsignedByteType, AddEquation,
} from 'three'
import { NEBULAE, WATCHER } from '../planets/planetData'
import { watcherState } from '../watcher/WatcherState'
import { allTargets, sunPosition } from '../planets/PlanetRegistry'
import { screenVert, shaders } from '../rendering/shaders'

const SIZE = 64

// Must match MAX_VOLUMES and MAX_OCCLUDERS in nebula.frag.glsl.
const vec4s = (n: number) => Array.from({ length: n }, () => new Vector4())

/** A small tiling cloud-noise volume. Sampling it replaces fbm in the per-pixel ray march. */
function buildNoiseVolume() {
  const rand = new Float32Array(SIZE * SIZE * SIZE)
  let seed = 1337
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < rand.length; i++) rand[i] = next()

  const sample = (x: number, y: number, z: number, period: number) => {
    const scale = SIZE / period
    const fx = x / scale, fy = y / scale, fz = z / scale
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz)
    const tx = fx - ix, ty = fy - iy, tz = fz - iz
    const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty), w = tz * tz * (3 - 2 * tz)
    const at = (a: number, b: number, c: number) => {
      const i = ((ix + a) % period) * 7 + ((iy + b) % period) * 131 + ((iz + c) % period) * 1009 + period * 53
      return rand[i % rand.length]
    }
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    return lerp(
      lerp(lerp(at(0, 0, 0), at(1, 0, 0), u), lerp(at(0, 1, 0), at(1, 1, 0), u), v),
      lerp(lerp(at(0, 0, 1), at(1, 0, 1), u), lerp(at(0, 1, 1), at(1, 1, 1), u), v),
      w,
    )
  }

  const data = new Uint8Array(SIZE * SIZE * SIZE * 2)
  let i = 0
  for (let z = 0; z < SIZE; z++) for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let a = 0.5, f = 0, soft = 0, norm = 0
    for (const period of [4, 8, 16, 32]) {
      const n = sample(x, y, z, period)
      f += a * n
      soft += a * (1 - Math.abs(2 * n - 1))
      norm += a
      a *= 0.5
    }
    data[i++] = Math.min(255, (((f / norm - 0.5) * 1.7 + 0.5) * 255)) | 0
    data[i++] = Math.min(255, (soft / norm) * 255) | 0
  }
  const texture = new Data3DTexture(data, SIZE, SIZE, SIZE)
  texture.format = RGFormat
  texture.type = UnsignedByteType
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping
  texture.minFilter = texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

const invViewProj = new Matrix4()
const order = NEBULAE.map((_, i) => i)
const occluders = allTargets.filter((t) => t.id !== WATCHER.id)
const scratch = new Vector3()

/** Half-resolution volumetric fog, composited over the opaque scene each frame. */
export function Nebula({ steps, scale }: { steps: number; scale: number }) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const noise = useMemo(buildNoiseVolume, [])

  const target = useMemo(() => new WebGLRenderTarget(4, 4, {
    type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false,
  }), [])

  useEffect(() => {
    target.setSize(Math.max(2, Math.round(size.width * dpr * scale)), Math.max(2, Math.round(size.height * dpr * scale)))
  }, [target, size, dpr, scale])

  const pass = useMemo(() => {
    const material = new ShaderMaterial({
      vertexShader: screenVert,
      fragmentShader: shaders.nebulaFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInvViewProj: { value: new Matrix4() },
        uCam: { value: new Vector3() },
        uSun: { value: sunPosition },
        uTime: { value: 0 },
        uNoise: { value: noise },
        uSteps: { value: steps },
        uVolumeCount: { value: NEBULAE.length },
        uVolumes: { value: vec4s(6) },
        uInner: { value: vec4s(6) },
        uOuter: { value: vec4s(6) },
        uOccluderCount: { value: occluders.length },
        uOccluders: { value: vec4s(24) },
      },
    })
    const scene = new Scene()
    const geometry = new PlaneGeometry(2, 2)
    const mesh = new Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    return { scene, material, geometry, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1) }
  }, [noise, steps])

  useEffect(() => () => { pass.material.dispose(); pass.geometry.dispose() }, [pass])
  useEffect(() => () => { target.dispose(); noise.dispose() }, [target, noise])

  const composite = useMemo(() => new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uDepth;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, uDepth, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform vec2 uTexel;
      // A small tent filter hides the ray-march dither when the fog runs at low resolution.
      void main() {
        vec2 d = uTexel * 1.6;
        gl_FragColor = texture2D(uTex, vUv) * 0.32
          + (texture2D(uTex, vUv + vec2(d.x, d.y)) + texture2D(uTex, vUv + vec2(-d.x, d.y))
          + texture2D(uTex, vUv + vec2(d.x, -d.y)) + texture2D(uTex, vUv + vec2(-d.x, -d.y))) * 0.17;
      }`,
    uniforms: { uTex: { value: target.texture }, uDepth: { value: 1 }, uTexel: { value: new Vector2(0.01, 0.01) } },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  }), [target])
  useEffect(() => () => composite.dispose(), [composite])

  useFrame(({ gl, camera, clock }) => {
    const u = pass.material.uniforms
    u.uTime.value = clock.elapsedTime
    u.uCam.value.copy(camera.position)
    composite.uniforms.uTexel.value.set(1 / target.width, 1 / target.height)
    invViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert()
    u.uInvViewProj.value.copy(invViewProj)

    order.sort((a, b) =>
      scratch.fromArray(NEBULAE[a].position).distanceToSquared(camera.position) -
      scratch.fromArray(NEBULAE[b].position).distanceToSquared(camera.position))
    order.forEach((index, slot) => {
      const n = NEBULAE[index]
      u.uVolumes.value[slot].set(n.position[0], n.position[1], n.position[2], n.radius)
      u.uInner.value[slot].set(n.inner[0], n.inner[1], n.inner[2], n.density)
      u.uOuter.value[slot].set(n.outer[0], n.outer[1], n.outer[2], n.scale)
    })
    occluders.forEach((t, i) => u.uOccluders.value[i].set(t.position.x, t.position.y, t.position.z, t.radius))

    // The Watcher isn't a sphere, so he is kept in front of the fog with depth instead: the
    // composite sits just behind him, and any fragment nearer than that plane is left clear.
    // His own material adds back the fog between him and the camera.
    scratch.copy(watcherState.focus).applyMatrix4(camera.matrixWorldInverse)
    const viewZ = Math.min(scratch.z - WATCHER.scale * 3, -camera.near * 1.01)
    const clipW = -viewZ
    const clipZ = camera.projectionMatrix.elements[10] * viewZ + camera.projectionMatrix.elements[14]
    composite.uniforms.uDepth.value = scratch.z < 0 ? clipZ / clipW : 1


    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(pass.scene, pass.camera)
    gl.setRenderTarget(previous)
  })

  return (
    <mesh frustumCulled={false} renderOrder={500} material={composite}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
