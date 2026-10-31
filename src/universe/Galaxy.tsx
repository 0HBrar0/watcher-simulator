import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Quaternion, ShaderMaterial, Vector3 } from 'three'
import type { GalaxyData } from '../planets/planetData'

const vert = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
varying vec3 vColor;
uniform float uPixel;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixel;
}`

const frag = /* glsl */ `
varying vec3 vColor;
void main() {
  float r2 = dot(gl_PointCoord * 2.0 - 1.0, gl_PointCoord * 2.0 - 1.0);
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-r2 * 3.0), 1.0);
}`

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5

/** A distant spiral, drawn as actual stars so it shifts subtly when you fly. */
export function Galaxy({ data, points, pixelRatio }: { data: GalaxyData; points: number; pixelRatio: number }) {
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...data.normal).normalize()),
    [data],
  )

  const geometry = useMemo(() => {
    const n = Math.floor(points * data.share)
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const core = new Color(...data.core), arm = new Color(...data.arm), c = new Color()
    for (let i = 0; i < n; i++) {
      const inBulge = Math.random() < 0.22
      let x, y, z, t
      if (inBulge) {
        t = Math.pow(Math.random(), 2) * 0.24
        const a = Math.random() * Math.PI * 2
        x = Math.cos(a) * t
        z = Math.sin(a) * t
        y = gauss() * 0.09 * (1 - t * 3)
      } else {
        t = 0.08 + Math.pow(Math.random(), 0.7) * 0.92
        const armIndex = Math.floor(Math.random() * data.arms)
        const spread = 0.34 + 0.95 * (1.1 - t)
        const a = t * data.twist * Math.PI + (armIndex / data.arms) * Math.PI * 2 + gauss() * spread
        x = Math.cos(a) * t
        z = Math.sin(a) * t
        y = gauss() * 0.05
      }
      pos[i * 3] = x * data.radius
      pos[i * 3 + 1] = y * data.radius
      pos[i * 3 + 2] = z * data.radius
      c.copy(core).lerp(arm, Math.min(1, t * 1.8))
      const fade = (1 - t * 0.74) * (0.1 + Math.random() * 0.3)
      col[i * 3] = c.r * fade
      col[i * 3 + 1] = c.g * fade
      col[i * 3 + 2] = c.b * fade
      size[i] = 1.2 + Math.random() * (inBulge ? 4 : 2.4)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aColor', new BufferAttribute(col, 3))
    g.setAttribute('aSize', new BufferAttribute(size, 1))
    return g
  }, [data, points])

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: { uPixel: { value: pixelRatio } },
  }), [pixelRatio])

  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  return (
    <points
      geometry={geometry}
      material={material}
      position={data.position}
      quaternion={quaternion}
      frustumCulled={false}
      renderOrder={-800}
    />
  )
}
