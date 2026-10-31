import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Color, Mesh, MeshPhysicalMaterial, ShaderMaterial, Vector3, type Material, type MeshStandardMaterial, type Object3D } from 'three'
import { WATCHER } from '../planets/planetData'

export interface WatcherRig {
  root: Object3D
  head: Object3D | null
  eyeL: Object3D | null
  eyeR: Object3D | null
}

// A replacement GLB only needs a node named "Head"; Eye_L / Eye_R are optional.
const url = import.meta.env.BASE_URL + WATCHER.modelUrl

const eyeVert = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vN = normalize(position);
  vP = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const eyeFrag = /* glsl */ `
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vNormalW;
uniform vec3 uSun;
void main() {
  float r = length(vN.xy);
  float front = step(0.0, vN.z);
  float iris = (1.0 - smoothstep(0.56, 0.64, r)) * front;
  float pupil = (1.0 - smoothstep(0.1, 0.14, r)) * front;
  float a = atan(vN.y, vN.x);
  float fibres = 0.72 + 0.28 * sin(a * 37.0 + sin(a * 9.0) * 3.0) * smoothstep(0.2, 0.46, r);
  vec3 irisCol = mix(vec3(3.6, 2.5, 1.0), vec3(0.8, 0.5, 2.2), smoothstep(0.16, 0.6, r)) * fibres;
  vec3 sclera = vec3(0.03, 0.035, 0.12);
  vec3 c = mix(sclera, irisCol, iris);
  c = mix(c, vec3(0.002, 0.001, 0.01), pupil);
  vec3 N = normalize(vNormalW), V = normalize(cameraPosition - vWorld), L = normalize(uSun - vWorld);
  float s = pow(max(dot(N, normalize(L + V)), 0.0), 260.0);
  gl_FragColor = vec4(c + vec3(6.0) * s, 1.0);
}`

function upgrade(mesh: Mesh, sun: Vector3) {
  const source = mesh.material as MeshStandardMaterial
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (source.name === 'Skin') {
    return new MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.44, metalness: 0,
      clearcoat: 0.24, clearcoatRoughness: 0.5,
      sheen: 0.6, sheenRoughness: 0.5, sheenColor: new Color(0.2, 0.36, 1),
      emissive: new Color(0.004, 0.012, 0.05),
    })
  }
  if (source.name === 'Cloth') {
    const m = new MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.62, metalness: 0, side: source.side,
      sheen: 0.35, sheenRoughness: 0.42, sheenColor: new Color(0.5, 0.42, 1),
    })
    // The hem doesn't end; it comes apart into light.
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
}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float robeN = 0.6 * robeNoise(vRobe * vec3(5.0, 2.2, 5.0)) + 0.4 * robeNoise(vRobe * vec3(17.0, 7.0, 17.0));
float robeCut = smoothstep(-0.95, -2.05, vRobe.y) * 1.04;
if (robeN < robeCut) discard;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float robeEdge = smoothstep(0.1, 0.0, robeN - robeCut) * step(0.02, robeCut);
totalEmissiveRadiance += vec3(0.46, 0.24, 1.5) * robeEdge * 2.0;`)
    }
    return m
  }
  if (source.name === 'Gold') {
    return new MeshPhysicalMaterial({
      color: source.color, roughness: 0.28, metalness: 1, side: source.side,
      clearcoat: 0.4, clearcoatRoughness: 0.25,
    })
  }
  if (source.name === 'Eye') {
    mesh.castShadow = false
    return new ShaderMaterial({ vertexShader: eyeVert, fragmentShader: eyeFrag, uniforms: { uSun: { value: sun } } })
  }
  return source
}

/** Loads the character and prepares its materials. Swapping the GLB swaps the character. */
export function useWatcherModel(sun: Vector3): WatcherRig {
  const { scene } = useGLTF(url)

  const rig = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const mesh = o as Mesh
        mesh.material = upgrade(mesh, sun) as Material
        mesh.frustumCulled = false
      }
    })
    return {
      root,
      head: root.getObjectByName('Head') ?? null,
      eyeL: root.getObjectByName('Eye_L') ?? null,
      eyeR: root.getObjectByName('Eye_R') ?? null,
    }
  }, [scene, sun])

  useEffect(() => () => {
    rig.root.traverse((o) => {
      const m = (o as Mesh).material as Material | undefined
      m?.dispose?.()
    })
  }, [rig])

  return rig
}

useGLTF.preload(url)
