import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, FrontSide, ShaderMaterial, Vector3, type BufferGeometry } from 'three'
import type { AtmosphereSettings } from './planetData'
import { shaders, sphereVert } from '../rendering/shaders'
import { sunPosition } from './PlanetRegistry'

interface Props {
  centre: Vector3
  radius: number
  settings: AtmosphereSettings
  steps: number
  geometry: BufferGeometry
}

export function PlanetAtmosphere({ centre, radius, settings, steps, geometry }: Props) {
  const shell = radius * (1 + settings.height)

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: sphereVert,
    fragmentShader: shaders.atmosphereFrag,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCentre: { value: centre },
      uSun: { value: sunPosition },
      uScatter: { value: new Vector3(...settings.scatter) },
      uSunset: { value: new Vector3(...(settings.sunset ?? settings.scatter)) },
      uPlanetRadius: { value: radius },
      uShellRadius: { value: shell },
      uDensity: { value: settings.density },
      uSteps: { value: steps },
    },
  }), [centre, radius, shell, settings, steps])

  useEffect(() => () => material.dispose(), [material])

  useFrame(({ camera }) => {
    // From outside, draw the near face so depth occludes it. From inside, flip it.
    const inside = camera.position.distanceTo(centre) < shell * 1.02
    material.side = inside ? BackSide : FrontSide
    material.depthTest = !inside
  })

  return <mesh geometry={geometry} material={material} scale={shell} renderOrder={20} />
}
