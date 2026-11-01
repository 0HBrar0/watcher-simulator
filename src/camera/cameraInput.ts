import type { Vector3 } from 'three'
import type { EarthView } from '../earth/earthGeometry'

/**
 * The bridge between the camera loop and the interface. The camera writes `readout` every frame
 * and the interface reads it without a React render; `cameraCommands` goes the other way.
 */
export const readout = {
  zoom: 0.5, // 0 is furthest out, 1 is closest in
  label: '',
  touched: -100, // seconds, when zoom was last used
  held: false, // the pointer is on the rail
  fine: false, // the precision key is down
}

export const cameraCommands = {
  zoomTo: (_t: number) => {},
  zoomStep: (_direction: number) => {},
  goToSurface: () => {},
  placeOverEarth: (_direction: Vector3, _radii: number) => {},
}

/** Filled in by RealEarth while Earth is in focus. */
export const earthCommands = {
  enter: (_view: EarthView) => {},
  leave: () => {},
}
