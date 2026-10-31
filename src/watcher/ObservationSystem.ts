import { Vector3 } from 'three'
import { useApp } from '../state/store'
import { getTarget } from '../planets/PlanetRegistry'
import { watcherState } from './WatcherState'

/** The only way to change what the Watcher looks at. Selecting a planet never calls this. */
export function setObservationTarget(id: string) {
  if (!getTarget(id) || id === 'watcher') return
  watcherState.targetId = id
  useApp.getState().setObservationMirror(id)
}

export function observationPoint(out: Vector3) {
  const target = getTarget(watcherState.targetId)
  return target ? out.copy(target.position) : out.copy(watcherState.position).add(watcherState.viewDirection)
}

useApp.getState().setObservationMirror(watcherState.targetId)
