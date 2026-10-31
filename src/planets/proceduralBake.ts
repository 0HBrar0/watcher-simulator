import {
  HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RepeatWrapping,
  Scene, ShaderMaterial, UnsignedByteType, Vector3, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three'
import type { ProceduralSurface } from './planetData'
import { screenVert, shaders } from '../rendering/shaders'

export interface BakedSurface {
  map: Texture
  emissive: Texture
  dispose: () => void
}

/** Renders a planet's expensive noise once. At runtime it costs the same as a photo texture. */
export function bakeSurface(gl: WebGLRenderer, s: ProceduralSurface, width: number): BakedSurface {
  const anisotropy = gl.capabilities.getMaxAnisotropy()
  const makeTarget = (w: number, h: number, half: boolean) => {
    const t = new WebGLRenderTarget(w, h, {
      type: half ? HalfFloatType : UnsignedByteType,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    })
    t.texture.wrapS = RepeatWrapping
    t.texture.anisotropy = anisotropy
    return t
  }
  const albedo = makeTarget(width, width / 2, true)
  const emissive = makeTarget(width / 2, width / 4, true)

  const material = new ShaderMaterial({
    vertexShader: screenVert,
    fragmentShader: shaders.proceduralFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uPass: { value: 0 }, uSeed: { value: s.seed }, uFreq: { value: s.frequency }, uWarp: { value: s.warp },
      uSea: { value: s.sea ?? 0 }, uIce: { value: s.ice ?? 0 }, uCracks: { value: s.cracks ?? 0 },
      uCities: { value: s.cities ?? 0 }, uStorms: { value: s.storms ?? 0 },
      uDeep: { value: new Vector3(...s.deep) }, uShallow: { value: new Vector3(...s.shallow) },
      uLow: { value: new Vector3(...s.low) }, uHigh: { value: new Vector3(...s.high) },
      uPeak: { value: new Vector3(...s.peak) }, uGlow: { value: new Vector3(...(s.glow ?? [0, 0, 0])) },
    },
  })
  const geometry = new PlaneGeometry(2, 2)
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  const scene = new Scene()
  scene.add(mesh)
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const previous = gl.getRenderTarget()
  gl.setRenderTarget(albedo)
  gl.render(scene, camera)
  material.uniforms.uPass.value = 1
  gl.setRenderTarget(emissive)
  gl.render(scene, camera)
  gl.setRenderTarget(previous)

  material.dispose()
  geometry.dispose()

  return {
    map: albedo.texture,
    emissive: emissive.texture,
    dispose: () => { albedo.dispose(); emissive.dispose() },
  }
}
