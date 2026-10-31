import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'

const vert = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
varying vec3 vColor;
varying float vTwinkle;
uniform float uTime;
uniform float uPixel;
void main() {
  vColor = aColor;
  vTwinkle = 0.78 + 0.22 * sin(uTime * (0.6 + aPhase) + aPhase * 40.0);
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixel;
}`

const frag = /* glsl */ `
varying vec3 vColor;
varying float vTwinkle;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 9.0);
  float halo = (1.0 - r2) * 0.14;
  gl_FragColor = vec4(vColor * (core + halo) * vTwinkle, 1.0);
}`

const PALETTE: [number, number, number][] = [
  [1, 0.92, 0.84], [0.8, 0.84, 1], [0.72, 0.62, 1], [1, 0.78, 0.86], [0.66, 0.92, 1], [1, 0.84, 0.56],
]

/** Real points at real depths: the nearest stars slide against the far sky as you move. */
export function Starfield({ count, pixelRatio }: { count: number; pixelRatio: number }) {
  const geometry = useMemo(() => {
    const position = new Float32Array(count * 3)
    const color = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const phase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u)
      const r = 2600 + Math.pow(Math.random(), 0.6) * 9000
      position[i * 3] = s * Math.cos(a) * r
      position[i * 3 + 1] = u * r
      position[i * 3 + 2] = s * Math.sin(a) * r
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)]
      const magnitude = Math.pow(Math.random(), 7)
      const bright = 0.34 + magnitude * 4.5
      color[i * 3] = c[0] * bright
      color[i * 3 + 1] = c[1] * bright
      color[i * 3 + 2] = c[2] * bright
      size[i] = 1.1 + magnitude * 4.5
      phase[i] = Math.random()
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(position, 3))
    g.setAttribute('aColor', new BufferAttribute(color, 3))
    g.setAttribute('aSize', new BufferAttribute(size, 1))
    g.setAttribute('aPhase', new BufferAttribute(phase, 1))
    return g
  }, [count])

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPixel: { value: pixelRatio } },
  }), [pixelRatio])

  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  useFrame(({ clock }) => { material.uniforms.uTime.value = clock.elapsedTime })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-900} />
}

const dustVert = /* glsl */ `
attribute float aSeed;
varying float vFade;
varying float vTint;
uniform float uTime;
uniform float uPixel;
uniform vec3 uCam;
uniform float uBox;
void main() {
  // Motes wrap around the camera, so there is always something drifting past it.
  vec3 p = position + vec3(sin(uTime * 0.05 + aSeed * 6.0), cos(uTime * 0.04 + aSeed * 9.0), sin(uTime * 0.03 + aSeed * 3.0)) * 6.0;
  vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
  float d = length(rel) / (uBox * 0.5);
  vFade = smoothstep(1.0, 0.55, d) * smoothstep(0.015, 0.1, d);
  vTint = aSeed;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((2.0 + aSeed * 3.0) * uPixel * 90.0 / max(-mv.z, 1.0), 1.0, 11.0 * uPixel);
}`

const dustFrag = /* glsl */ `
varying float vFade;
varying float vTint;
void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  if (r > 1.0) discard;
  vec3 c = mix(vec3(0.62, 0.42, 1.0), vec3(0.96, 0.66, 0.9), vTint);
  gl_FragColor = vec4(c * pow(1.0 - r, 2.0) * vFade * 0.26, 1.0);
}`

/** Foreground motes, for speed and scale. */
export function CosmicDust({ count, pixelRatio }: { count: number; pixelRatio: number }) {
  const box = 420
  const geometry = useMemo(() => {
    const position = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count * 3; i++) position[i] = Math.random() * box
    for (let i = 0; i < count; i++) seed[i] = Math.random()
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(position, 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 1))
    return g
  }, [count])

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: dustVert,
    fragmentShader: dustFrag,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPixel: { value: pixelRatio }, uCam: { value: null }, uBox: { value: box } },
  }), [pixelRatio])

  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  useFrame(({ clock, camera }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uCam.value = camera.position
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={600} />
}
