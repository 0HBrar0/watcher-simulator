import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import {
  CustomBlending, Euler, Group, Mesh, OneFactor, OneMinusSrcAlphaFactor, Quaternion, RepeatWrapping, SRGBColorSpace,
  ShaderMaterial, TextureLoader, Vector2, Vector3, type BufferGeometry, type Texture,
} from 'three'
import type { BodyData, ProceduralSurface, TexturedSurface } from './planetData'
import { shaders, sphereVert } from '../rendering/shaders'
import { getTarget, sunPosition } from './PlanetRegistry'
import { PlanetAtmosphere } from './PlanetAtmosphere'
import { PlanetRings } from './PlanetRings'
import { bakeSurface, type BakedSurface } from './proceduralBake'
import { useApp } from '../state/store'
import { QUALITY } from '../state/quality'
import { earthFrame } from '../earth/earthGeometry'

const assetUrl = (path: string) => import.meta.env.BASE_URL + path

interface Maps {
  map: Texture
  emissive: Texture | null
  specular: Texture | null
  clouds: Texture | null
  ring: Texture | null
  alphaIsHeight: boolean
  nightOnly: boolean
}

function useTexturedMaps(surface: TexturedSurface, ringUrl?: string): Maps {
  const gl = useThree((s) => s.gl)
  const urls = useMemo(() => {
    const list = [surface.map, surface.emissiveMap, surface.specularMap, surface.cloudMap, ringUrl]
    return list.filter(Boolean).map((u) => assetUrl(u as string))
  }, [surface, ringUrl])

  const textures = useLoader(TextureLoader, urls)

  return useMemo(() => {
    const queue = [...textures]
    const take = (present: unknown) => (present ? queue.shift()! : null)
    const anisotropy = gl.capabilities.getMaxAnisotropy()
    const prep = (t: Texture | null, srgb: boolean) => {
      if (!t) return t
      t.wrapS = RepeatWrapping
      t.anisotropy = anisotropy
      if (srgb) t.colorSpace = SRGBColorSpace
      t.needsUpdate = true
      return t
    }
    const map = prep(take(surface.map), true)!
    const emissive = prep(take(surface.emissiveMap), true)
    const specular = prep(take(surface.specularMap), false)
    const clouds = prep(take(surface.cloudMap), false)
    const ring = prep(take(ringUrl), true)
    return { map, emissive, specular, clouds, ring, alphaIsHeight: false, nightOnly: true }
  }, [textures, surface, ringUrl, gl])
}

function useProceduralMaps(surface: ProceduralSurface): Maps | null {
  const gl = useThree((s) => s.gl)
  const width = useApp((s) => QUALITY[s.quality].bakeWidth)
  const [baked, setBaked] = useState<BakedSurface | null>(null)
  useEffect(() => {
    const result = bakeSurface(gl, surface, width)
    setBaked(result)
    return () => result.dispose()
  }, [gl, surface, width])
  return useMemo(() => baked && ({
    map: baked.map,
    emissive: surface.glow ? baked.emissive : null,
    specular: null,
    clouds: null,
    ring: null,
    alphaIsHeight: true,
    nightOnly: !surface.cracks,
  }), [baked, surface])
}

const axis = new Vector3(0, 1, 0)
const scratchQuat = new Quaternion()
const hoverColorUp = 0.12

interface BodyProps {
  body: BodyData
  maps: Maps
  geometry: BufferGeometry
}

function Body({ body, maps, geometry }: BodyProps) {
  const quality = useApp((s) => QUALITY[s.quality])
  const group = useRef<Group>(null)
  const spinner = useRef<Mesh>(null)
  const cloudMesh = useRef<Mesh>(null)

  const target = getTarget(body.id)!
  const centre = target.position
  const r = body.radius

  // Tilt is fixed; rings live in the tilted frame so their normal never changes.
  const tilt = useMemo(() => new Quaternion().setFromEuler(new Euler(0, 0, (body.tilt * Math.PI) / 180)), [body.tilt])
  const ringQuat = useMemo(() => {
    const t = body.rings?.tilt
    return t ? new Quaternion().setFromEuler(new Euler(t[0], t[1], t[2])) : new Quaternion()
  }, [body.rings])
  const ringNormal = useMemo(() => new Vector3(0, 1, 0).applyQuaternion(ringQuat).applyQuaternion(tilt).normalize(), [ringQuat, tilt])

  const hover = useMemo(() => ({ value: 0 }), [])

  const surfaceBump = body.surface.bump ?? 0
  const ringMap = maps.ring

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: shaders.planetVert,
    fragmentShader: shaders.planetFrag,
    uniforms: {
      uMap: { value: maps.map },
      uEmissive: { value: maps.emissive },
      uSpecular: { value: maps.specular },
      uClouds: { value: maps.clouds },
      uRingMap: { value: ringMap },
      uHasEmissive: { value: !!maps.emissive },
      uHasSpecular: { value: !!maps.specular },
      uHasClouds: { value: !!maps.clouds },
      uNightOnly: { value: maps.nightOnly },
      uAlphaIsHeight: { value: maps.alphaIsHeight },
      uDetail: { value: quality.surfaceDetail },
      uSun: { value: sunPosition },
      uCentre: { value: centre },
      uAtmosphere: { value: new Vector3(...(body.atmosphere?.scatter ?? [0, 0, 0])).multiplyScalar(body.atmosphere ? 0.32 * Math.min(1, body.atmosphere.density) : 0) },
      uRingNormal: { value: ringNormal },
      uRing: { value: body.rings ? new Vector2(body.rings.inner * r, body.rings.outer * r) : new Vector2() },
      uHasRingMap: { value: !!ringMap },
      uRadius: { value: r },
      uBump: { value: surfaceBump },
      uFlow: { value: body.effects?.flow ?? 0 },
      uFlat: { value: body.effects?.flat ?? 0 },
      uGlint: { value: body.effects?.glint ?? 0 },
      uDisplace: { value: body.effects?.displace ?? 0 },
      uSeed: { value: body.surface.kind === 'procedural' ? body.surface.seed : 0 },
      uCloudTurn: { value: 0 },
      uTime: { value: 0 },
      uHover: hover,
    },
  }), [maps, ringMap, quality.surfaceDetail, centre, body, ringNormal, r, surfaceBump, hover])

  const cloudMaterial = useMemo(() => maps.clouds
    ? new ShaderMaterial({
      vertexShader: sphereVert,
      fragmentShader: shaders.cloudsFrag,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      uniforms: { uClouds: { value: maps.clouds }, uSun: { value: sunPosition } },
    })
    : null, [maps])

  useEffect(() => () => { material.dispose(); cloudMaterial?.dispose() }, [material, cloudMaterial])

  const spinAngle = useRef(0)

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    material.uniforms.uTime.value = t
    spinAngle.current += body.spin * delta
    scratchQuat.setFromAxisAngle(axis, spinAngle.current)
    spinner.current?.quaternion.copy(scratchQuat)
    if (body.id === 'earth') earthFrame.copy(tilt).multiply(scratchQuat)
    if (cloudMesh.current) {
      const turn = t * 0.0016
      cloudMesh.current.rotation.y = spinAngle.current + turn
      material.uniforms.uCloudTurn.value = -turn / (Math.PI * 2)
    }
    group.current?.position.copy(centre)
    const { hoveredId, selectedId } = useApp.getState()
    const wanted = hoveredId === body.id ? 1 : selectedId === body.id ? 0.42 : 0
    hover.value += (wanted - hover.value) * hoverColorUp
  })

  return (
    <group ref={group} position={body.position}>
      <group quaternion={tilt}>
        <mesh ref={spinner} geometry={geometry} material={material} scale={r} />
        {cloudMaterial && <mesh ref={cloudMesh} geometry={geometry} material={cloudMaterial} scale={r * 1.008} renderOrder={15} />}
        {body.rings && (
          <group quaternion={ringQuat}>
            <PlanetRings settings={body.rings} radius={r} centre={centre} normal={ringNormal} map={ringMap} seed={body.surface.kind === 'procedural' ? body.surface.seed : 1} hover={hover} />
          </group>
        )}
      </group>
      {body.atmosphere && <PlanetAtmosphere centre={centre} radius={r} settings={body.atmosphere} steps={quality.atmosphereSteps} geometry={geometry} />}
    </group>
  )
}

function TexturedBody({ body, surface, geometry }: { body: BodyData; surface: TexturedSurface; geometry: BufferGeometry }) {
  const maps = useTexturedMaps(surface, body.rings?.texture)
  return <Body body={body} maps={maps} geometry={geometry} />
}

function ProceduralBody({ body, surface, geometry }: { body: BodyData; surface: ProceduralSurface; geometry: BufferGeometry }) {
  const maps = useProceduralMaps(surface)
  return maps && <Body body={body} maps={maps} geometry={geometry} />
}

export function Planet({ body, geometry }: { body: BodyData; geometry: BufferGeometry }) {
  return body.surface.kind === 'textured'
    ? <TexturedBody body={body} surface={body.surface} geometry={geometry} />
    : <ProceduralBody body={body} surface={body.surface} geometry={geometry} />
}
