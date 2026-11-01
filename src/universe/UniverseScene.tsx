import { Suspense, useMemo, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
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
import { finishLoading, setLoaderProgress, warmUp } from '../app/loader'

const ASSET_LIMIT = 25 // seconds: a lost texture must not hold the door forever
const STEADY_LIMIT = 8 // seconds: a slow machine is told to come in anyway
const STEADY_FRAMES = 24
const STEADY_DELTA = 0.05

export function UniverseScene() {
  const quality = useApp((s) => QUALITY[s.quality])
  const pixelRatio = Math.min(window.devicePixelRatio, quality.dpr)

  const sphere = useMemo(() => new SphereGeometry(1, quality.sphereSegments, Math.round(quality.sphereSegments / 2)), [quality.sphereSegments])
  useEffect(() => () => sphere.dispose(), [sphere])

  // Worlds arrive one per frame, so shader compiles and texture uploads never stall the opening.
  const [revealed, setRevealed] = useState(0)
  const frames = useRef(0)
  const gate = useRef({ warmedAt: -1, steady: 0 })

  useFrame(({ clock, gl, scene, camera }, delta) => {
    const time = clock.elapsedTime
    advanceOrbits(time)
    frames.current++
    if (frames.current % 2 === 0 && revealed < BODIES.length) setRevealed(revealed + 1)

    // The loading screen stays until the worlds are in, on the GPU, and the frame rate has settled.
    if (useApp.getState().loaded) return
    const g = gate.current
    if (g.warmedAt < 0) {
      const { active, loaded, total } = useProgress.getState()
      const worlds = revealed / BODIES.length
      setLoaderProgress(0.9 * (total ? (loaded / total) * worlds : 0))
      if ((worlds < 1 || active || frames.current < 12) && time < ASSET_LIMIT) return
      warmUp(gl, scene, camera)
      g.warmedAt = time
      setLoaderProgress(0.95)
      return
    }
    g.steady = delta < STEADY_DELTA ? g.steady + 1 : 0
    if (g.steady >= STEADY_FRAMES || time - g.warmedAt > STEADY_LIMIT) finishLoading()
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
