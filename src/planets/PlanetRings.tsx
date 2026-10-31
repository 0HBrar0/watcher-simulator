import { useEffect, useMemo } from 'react'
import { CustomBlending, DoubleSide, OneFactor, OneMinusSrcAlphaFactor, RingGeometry, ShaderMaterial, Vector3, type Texture } from 'three'
import type { RingSettings } from './planetData'
import { ringVert, shaders } from '../rendering/shaders'
import { sunPosition } from './PlanetRegistry'

interface Props {
  settings: RingSettings
  radius: number
  centre: Vector3
  normal: Vector3
  map: Texture | null
  seed: number
  hover: { value: number }
}

/** Lies flat in the parent's local XY plane, so the parent decides the orientation. */
export function PlanetRings({ settings, radius, centre, normal, map, seed, hover }: Props) {
  const inner = settings.inner * radius
  const outer = settings.outer * radius

  const geometry = useMemo(() => new RingGeometry(inner, outer, 256, 1), [inner, outer])

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: ringVert,
    fragmentShader: shaders.ringFrag,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    uniforms: {
      uMap: { value: map },
      uHasMap: { value: !!map },
      uTint: { value: new Vector3(...settings.tint) },
      uSun: { value: sunPosition },
      uCentre: { value: centre },
      uRingNormal: { value: normal },
      uPlanetRadius: { value: radius },
      uInner: { value: inner },
      uOuter: { value: outer },
      uOpacity: { value: settings.opacity },
      uHover: hover,
      uSeed: { value: seed },
    },
  }), [map, settings, centre, normal, radius, inner, outer, seed, hover])

  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  return <mesh geometry={geometry} material={material} rotation={[Math.PI / 2, 0, 0]} renderOrder={21} />
}
