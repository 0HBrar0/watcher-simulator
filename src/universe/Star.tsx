import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Mesh, ShaderMaterial, SphereGeometry } from 'three'
import { SUN } from '../planets/planetData'
import { shaders, sphereVert } from '../rendering/shaders'
import { useApp } from '../state/store'

const haloScale = 6.4

/** The single key light of the universe, and a selectable place in its own right. */
export function Star() {
  const haloRef = useRef<Mesh>(null)

  const geometry = useMemo(() => new SphereGeometry(1, 96, 48), [])

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: sphereVert,
    fragmentShader: shaders.sunFrag,
    uniforms: { uTime: { value: 0 }, uHover: { value: 0 } },
  }), [])

  const halo = useMemo(() => new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: shaders.coronaFrag,
    uniforms: { uTime: { value: 0 }, uDiscRadius: { value: 0.98 / haloScale } },
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }), [])

  useEffect(() => () => { geometry.dispose(); material.dispose(); halo.dispose() }, [geometry, material, halo])

  useFrame(({ clock, camera }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    halo.uniforms.uTime.value = clock.elapsedTime
    const { hoveredId, selectedId } = useApp.getState()
    const target = hoveredId === SUN.id || selectedId === SUN.id ? 1 : 0
    material.uniforms.uHover.value += (target - material.uniforms.uHover.value) * 0.1
    haloRef.current?.quaternion.copy(camera.quaternion)
  })

  return (
    <group position={SUN.position}>
      <mesh geometry={geometry} material={material} scale={SUN.radius} />
      <mesh ref={haloRef} material={halo} scale={SUN.radius * haloScale * 2} renderOrder={10}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  )
}
