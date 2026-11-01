import type { Camera, Scene, Texture, WebGLRenderer } from 'three'
import { useApp } from '../state/store'

const ARC = 2 * Math.PI * 92 // the ring's length in index.html
const LEAVE_MS = 1200

const element = () => document.getElementById('loader')

/** The ring around his silhouette only ever moves forward. */
let shown = 0
export function setLoaderProgress(progress: number) {
  shown = Math.max(shown, Math.min(progress, 1))
  element()?.style.setProperty('--left', `${ARC * (1 - shown)}`)
}

/** Sends every shader and texture to the GPU now, so nothing stalls the first time it comes into view. */
export function warmUp(gl: WebGLRenderer, scene: Scene, camera: Camera) {
  gl.compile(scene, camera)
  const seen = new Set<Texture>()
  scene.traverse((object) => {
    const material = (object as { material?: { uniforms?: Record<string, { value: unknown }> } }).material
    for (const uniform of Object.values(material?.uniforms ?? {})) {
      const texture = uniform.value as Texture | null
      if (texture?.isTexture && !seen.has(texture)) seen.add(texture)
    }
  })
  seen.forEach((texture) => gl.initTexture(texture))
}

export function finishLoading() {
  setLoaderProgress(1)
  document.body.classList.add('ready')
  useApp.getState().setLoaded()
  const loader = element()
  loader?.classList.add('loader--done')
  setTimeout(() => loader?.remove(), LEAVE_MS)
}

export const removeLoader = () => element()?.remove()
