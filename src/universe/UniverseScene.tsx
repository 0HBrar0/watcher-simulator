import { Suspense, useMemo, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { SphereGeometry } from 'three'
import { BODIES, GALAXIES } from '../planets/planetData'
import { advanceOrbits } from '../planets/PlanetRegistry'
import { Planet } from '../planets/Planet'
import { useApp } from '../state/store'
import { QUALITY } from '../state/quality'
import { Sky } from './Sky'
import { Nebula } from './Nebula'
import { CosmicDust, Starfield } from './Starfield'
import { Galaxy } from './Galaxy'
import { Star } from './Star'
import { Picking } from './Picking'
import { Watcher } from '../watcher/Watcher'
import { CameraManager } from '../camera/CameraManager'
import { ScreenTracker } from '../interface/ScreenTracker'
import { PostProcessing } from '../rendering/PostProcessing'

export function UniverseScene() {
  const quality = useApp((s) => QUALITY[s.quality])
  const pixelRatio = Math.min(window.devicePixelRatio, quality.dpr)

  const sphere = useMemo(() => new SphereGeometry(1, quality.sphereSegments, Math.round(quality.sphereSegments / 2)), [quality.sphereSegments])
  useEffect(() => () => sphere.dispose(), [sphere])

  // Worlds arrive one per frame, so shader compiles and texture uploads never stall the opening.
  const [revealed, setRevealed] = useState(0)
  const frames = useRef(0)

  useFrame(({ clock }) => {
    advanceOrbits(clock.elapsedTime)
    if (frames.current++ === 0) document.body.classList.add('ready')
    if (frames.current % 2 === 0 && revealed < BODIES.length) setRevealed(revealed + 1)
  })

  return (
    <>
      <Sky size={quality.skySize} />
      <Starfield count={quality.stars} pixelRatio={pixelRatio} />
      {GALAXIES.map((g, i) => <Galaxy key={i} data={g} points={quality.galaxyPoints} pixelRatio={pixelRatio} />)}
      <Star />

      {/* Worlds stream in independently: nothing blocks the first frame. */}
      {BODIES.slice(0, revealed).map((body) => (
        <Suspense key={body.id} fallback={null}>
          <Planet body={body} geometry={sphere} />
        </Suspense>
      ))}

      <Suspense fallback={null}>
        <Watcher shadowMapSize={quality.shadowMapSize} />
      </Suspense>

      <Nebula steps={quality.nebulaSteps} scale={quality.nebulaScale} />
      <CosmicDust count={quality.dust} pixelRatio={pixelRatio} />

      <CameraManager />
      <Picking />
      <ScreenTracker />
      <PostProcessing quality={quality} />
    </>
  )
}
