import { Vector3 } from 'three'
import { BODIES, SUN, WATCHER, type BodyView } from './planetData'
import { watcherState } from '../watcher/WatcherState'

/** A live entry for anything the camera can visit or the user can pick. */
export interface Target {
  id: string
  name: string
  position: Vector3
  radius: number
  view: BodyView
}

const DEFAULT_VIEW: BodyView = { distance: 3, azimuth: 55, elevation: 10 }

export const sunPosition = new Vector3(...SUN.position)

const targets = new Map<string, Target>()

targets.set(SUN.id, { id: SUN.id, name: SUN.name, position: sunPosition, radius: SUN.radius, view: SUN.view })
for (const body of BODIES) {
  targets.set(body.id, { id: body.id, name: body.name, position: new Vector3(...body.position), radius: body.radius, view: body.view ?? DEFAULT_VIEW })
}
targets.set(WATCHER.id, { id: WATCHER.id, name: WATCHER.name, position: watcherState.focus, radius: 2.6 * WATCHER.scale, view: WATCHER.view })

export const allTargets = [...targets.values()]
export const getTarget = (id: string | null | undefined) => (id ? targets.get(id) : undefined)

const orbiting = BODIES.filter((b) => b.orbit)

/** Moves anything with an orbit. Runs once per frame; positions are mutated in place. */
export function advanceOrbits(time: number) {
  for (const body of orbiting) {
    const o = body.orbit!
    const parent = targets.get(o.around)!.position
    const a = o.phase + time * o.speed
    targets.get(body.id)!.position.set(
      parent.x + Math.cos(a) * o.radius,
      parent.y + Math.sin(a) * o.radius * o.inclination,
      parent.z + Math.sin(a) * o.radius,
    )
  }
}
