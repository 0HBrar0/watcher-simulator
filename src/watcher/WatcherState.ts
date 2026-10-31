import { Quaternion, Vector3 } from 'three'
import { WATCHER } from '../planets/planetData'

export type WatcherAnimation = 'idle' | 'observing'

/**
 * The Watcher as an independent entity. Nothing here depends on what the user has selected
 * or where the user's camera is. The model writes it; everything else only reads.
 */
export const watcherState = {
  position: new Vector3(...WATCHER.position), // world position of the root
  rotation: new Quaternion(), // world rotation of the root
  focus: new Vector3(...WATCHER.position), // chest height, for framing and picking
  targetId: WATCHER.initialTarget, // observation target
  animation: 'observing' as WatcherAnimation,
  eyePosition: new Vector3(...WATCHER.position), // character camera position
  viewDirection: new Vector3(0, 0, 1), // current viewing direction
  headHidden: false, // true while the viewer is inside his head
}
