import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { NoToneMapping, PCFSoftShadowMap } from 'three'
import { UniverseScene } from '../universe/UniverseScene'
import { Interface } from '../interface/HUD'
import { useApp } from '../state/store'
import { QUALITY } from '../state/quality'

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false }
}

export function App() {
  const level = useApp((s) => s.quality)
  const profile = QUALITY[level]
  const [dprScale, setDprScale] = useState(1)

  if (!hasWebGL2()) {
    return (
      <main className="unsupported">
        <h1>The sky is closed</h1>
        <p>This universe needs WebGL 2. Try a current desktop browser with hardware acceleration turned on.</p>
      </main>
    )
  }

  return (
    <>
      <Canvas
        key={level}
        className="universe"
        dpr={Math.min(window.devicePixelRatio, profile.dpr) * dprScale}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false, toneMapping: NoToneMapping }}
        shadows={{ type: PCFSoftShadowMap }}
        camera={{ fov: 38, near: 1, far: 40000, position: [0, 0, 1000] }}
        frameloop="always"
      >
        <PerformanceMonitor
          bounds={() => [45, 75]}
          flipflops={3}
          onDecline={() => setDprScale((s) => Math.max(0.6, s - 0.15))}
          onIncline={() => setDprScale((s) => Math.min(1, s + 0.1))}
        />
        <UniverseScene />
      </Canvas>
      <Interface />
    </>
  )
}
