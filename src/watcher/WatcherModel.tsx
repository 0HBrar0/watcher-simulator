import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Color, Mesh, MeshPhysicalMaterial, ShaderMaterial, type Material, type MeshStandardMaterial, type Object3D, type WebGLProgramParametersWithUniforms } from 'three'
import { WATCHER } from '../planets/planetData'

export interface WatcherRig {
  root: Object3D
  head: Object3D | null
  eyeL: Object3D | null
  eyeR: Object3D | null
  halos: Object3D[]
}

// A replacement GLB only needs a node named "Head"; Eye_L / Eye_R / Halo_* are optional.
const url = import.meta.env.BASE_URL + WATCHER.modelUrl

const eyeVert = /* glsl */ `
varying vec3 vN;
void main() {
  vN = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

// Nothing but light behind the slits.
const eyeFrag = /* glsl */ `
varying vec3 vN;
void main() {
  float core = smoothstep(1.0, 0.25, length(vN.xy));
  gl_FragColor = vec4(mix(vec3(3.2, 1.7, 0.5), vec3(9.0, 6.5, 3.0), core), 1.0);
}`

/**
 * He is big enough for the space in front of him to matter: the further away he stands, the
 * more of the violet between you shows over him. This is most of what sells his size.
 */
function aerialHaze(shader: WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.13, 0.07, 0.34), 1.0 - exp(-length(vViewPosition) / ${(WATCHER.scale * 40).toFixed(1)}));`)
}

/**
 * The bake stores vertex colours gamma-encoded, to keep 8-bit shadows from banding. The floor
 * matters: MSAA can extrapolate a colour just below zero, pow() then returns NaN on some GPUs,
 * and bloom spreads that one pixel into a solid block over the screen.
 */
function decodeVertexColor(shader: WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(1e-4)), vec3(2.2));`)
}

function upgrade(mesh: Mesh) {
  const source = mesh.material as MeshStandardMaterial
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (source.name === 'Mask') {
    const m = new MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.32, metalness: 0,
      clearcoat: 0.6, clearcoatRoughness: 0.28,
      emissive: new Color(0.012, 0.008, 0.016),
    })
    // The mask holds a little light of its own, so it floats in the dark of the hood.
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vec3(0.3, 0.26, 0.24);`)
      decodeVertexColor(shader)
      aerialHaze(shader)
    }
    return m
  }
  if (source.name === 'Cloth') {
    const m = new MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.62, metalness: 0, side: source.side, envMapIntensity: 0.4,
      sheen: 0.28, sheenRoughness: 0.3, sheenColor: new Color(0.42, 0.32, 1),
    })
    // A cloak cut from the night: stars in the weave, and a hem that comes apart into light.
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRobe;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRobe = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vRobe;
float robeHash(vec3 p) { p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float robeNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(robeHash(i), robeHash(i + vec3(1, 0, 0)), f.x), mix(robeHash(i + vec3(0, 1, 0)), robeHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(robeHash(i + vec3(0, 0, 1)), robeHash(i + vec3(1, 0, 1)), f.x), mix(robeHash(i + vec3(0, 1, 1)), robeHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float robeStars(vec3 p, float rarity) {
  vec3 id = floor(p), f = fract(p) - 0.5;
  float h = robeHash(id);
  if (h < rarity) return 0.0;
  vec3 offset = (vec3(robeHash(id + 1.7), robeHash(id + 3.1), robeHash(id + 5.3)) - 0.5) * 0.6;
  return smoothstep(0.16, 0.02, length(f + offset)) * (0.4 + 0.6 * robeHash(id + 7.9));
}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float robeN = 0.42 * robeNoise(vRobe * vec3(4.0, 1.7, 4.0)) + 0.58 * robeNoise(vRobe * vec3(26.0, 12.0, 26.0));
float robeCut = smoothstep(-2.0, -3.6, vRobe.y) * 1.06;
if (robeN < robeCut) discard;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float robeEdge = smoothstep(0.05, 0.0, robeN - robeCut) * step(0.02, robeCut);
totalEmissiveRadiance += vec3(0.46, 0.24, 1.5) * robeEdge * 1.1;
float robeSky = smoothstep(2.4, 0.2, vRobe.y);
float robeCloud = robeNoise(vRobe * vec3(1.6, 0.9, 1.6) + 4.0);
totalEmissiveRadiance += vec3(0.1, 0.035, 0.3) * robeSky * smoothstep(0.42, 0.8, robeCloud) * 0.5;
float robeLight = robeStars(vRobe * 11.0, 0.93) + robeStars(vRobe * 27.0, 0.9) * 0.6;
totalEmissiveRadiance += mix(vec3(1.0, 0.82, 0.62), vec3(0.62, 0.72, 1.0), robeHash(floor(vRobe * 11.0))) * robeLight * robeSky * 7.0;`)
      decodeVertexColor(shader)
      aerialHaze(shader)
    }
    return m
  }
  if (source.name === 'Gold') {
    const halo = mesh.name.startsWith('Halo')
    if (halo) mesh.castShadow = false
    const m = new MeshPhysicalMaterial({
      color: source.color, roughness: 0.28, metalness: 1, side: source.side,
      clearcoat: 0.4, clearcoatRoughness: 0.25,
      // The halo keeps a low heat of its own, so it still reads against the dark of the hood.
      emissive: new Color(1, 0.6, 0.22), emissiveIntensity: halo ? 0.55 : 0.03,
    })
    m.onBeforeCompile = aerialHaze
    return m
  }
  if (source.name === 'Eye') {
    mesh.castShadow = false
    return new ShaderMaterial({ vertexShader: eyeVert, fragmentShader: eyeFrag })
  }
  return source
}

/** Loads the character and prepares its materials. Swapping the GLB swaps the character. */
export function useWatcherModel(): WatcherRig {
  const { scene } = useGLTF(url)

  const rig = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const mesh = o as Mesh
        mesh.material = upgrade(mesh) as Material
        mesh.frustumCulled = false
      }
    })
    return {
      root,
      head: root.getObjectByName('Head') ?? null,
      eyeL: root.getObjectByName('Eye_L') ?? null,
      eyeR: root.getObjectByName('Eye_R') ?? null,
      halos: ['Halo_A', 'Halo_B', 'Halo_C'].flatMap((n) => root.getObjectByName(n) ?? []),
    }
  }, [scene])

  useEffect(() => () => {
    rig.root.traverse((o) => {
      const m = (o as Mesh).material as Material | undefined
      m?.dispose?.()
    })
  }, [rig])

  return rig
}

useGLTF.preload(url)
