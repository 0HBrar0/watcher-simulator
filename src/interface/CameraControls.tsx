import { useApp, WATCHER_ID } from '../state/store'
import { getTarget } from '../planets/PlanetRegistry'
import { stepWorld } from './Shortcuts'

export function CameraControls() {
  const mode = useApp((s) => s.mode)
  const focusId = useApp((s) => s.focusId)
  const selectedId = useApp((s) => s.selectedId)
  const requestCamera = useApp((s) => s.requestCamera)
  const select = useApp((s) => s.select)

  const body = getTarget(focusId && focusId !== WATCHER_ID ? focusId : selectedId && selectedId !== WATCHER_ID ? selectedId : 'earth')

  const options = [
    { id: 'observer', label: 'Observer', on: () => requestCamera({ kind: 'free' }) },
    { id: 'watcher', label: 'His eyes', on: () => { select(WATCHER_ID); requestCamera({ kind: 'watcherPov' }) } },
    { id: 'planet', label: mode === 'planet' ? body?.name ?? 'Planet' : 'Planetary', on: () => { if (body) { select(body.id); requestCamera({ kind: 'focus', id: body.id }) } } },
  ]

  return (
    <div className="modes" role="group" aria-label="Camera perspective">
      <button className="modes__step" aria-label="Previous world" title="Previous world ([)" onClick={() => stepWorld(-1)}>‹</button>
      {options.map((o) => (
        <button key={o.id} className={mode === o.id ? 'is-current' : ''} aria-pressed={mode === o.id} onClick={o.on}>{o.label}</button>
      ))}
      <button className="modes__step" aria-label="Next world" title="Next world (])" onClick={() => stepWorld(1)}>›</button>
    </div>
  )
}
