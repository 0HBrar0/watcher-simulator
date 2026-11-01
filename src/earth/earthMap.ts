import { Map as MapLibre, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from '../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { earthStyle } from './earthStyle'

export const MAP_FOV = 38 // the same lens as the universe, so the two line up at the handover

setWorkerUrl(workerUrl)

/** Only ever imported on demand: everyone who stays in space never downloads this. */
export function createMap(container: HTMLElement) {
  const map = new MapLibre({
    container,
    style: earthStyle,
    center: [0, 20],
    zoom: 3,
    maxZoom: 18,
    maxPitch: 0,
    pitchWithRotate: false,
    attributionControl: { compact: false },
    fadeDuration: 180,
  })
  map.touchZoomRotate.disableRotation()
  map.setVerticalFieldOfView(MAP_FOV)
  return map
}

export type EarthMap = ReturnType<typeof createMap>
