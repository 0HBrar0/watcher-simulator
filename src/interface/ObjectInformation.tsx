import { useEffect, useState } from 'react'
import { BODIES, SUN, WATCHER } from '../planets/planetData'
import { getTarget } from '../planets/PlanetRegistry'
import { useApp, WATCHER_ID } from '../state/store'
import { setObservationTarget } from '../watcher/ObservationSystem'
import { watcherState } from '../watcher/WatcherState'

function describe(id: string) {
  if (id === WATCHER_ID) return { name: WATCHER.name, category: 'Observer', description: WATCHER.description, context: undefined as string | undefined }
  if (id === SUN.id) return { name: SUN.name, category: SUN.category as string, description: SUN.description, context: undefined as string | undefined }
  const body = BODIES.find((b) => b.id === id)!
  return { name: body.name, category: body.category as string, description: body.description, context: body.context }
}

/** A plain-language read of where he is relative to this world. Refreshes while open. */
function useWatcherRelation(id: string | null) {
  const [line, setLine] = useState('')
  const observed = useApp((s) => s.observationTarget)
  useEffect(() => {
    if (!id || id === WATCHER_ID) { setLine(''); return }
    const update = () => {
      const here = getTarget(id)!, there = getTarget(observed)
      const gap = here.position.distanceTo(watcherState.position)
      const nearby = gap < here.radius * 8 + 120 ? 'He is close by' : gap < 1500 ? 'He is visible from here' : 'He is far from here'
      setLine(observed === id ? 'The Watcher is observing this world.' : `${nearby}, observing ${there?.name}.`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [id, observed])
  return line
}

export function ObjectInformation() {
  const selectedId = useApp((s) => s.selectedId)
  const select = useApp((s) => s.select)
  const focusId = useApp((s) => s.focusId)
  const requestCamera = useApp((s) => s.requestCamera)
  const observed = useApp((s) => s.observationTarget)
  const mode = useApp((s) => s.mode)
  const relation = useWatcherRelation(selectedId)

  if (!selectedId || (mode === 'watcher' && selectedId === WATCHER_ID)) return null
  const info = describe(selectedId)
  const isWatcher = selectedId === WATCHER_ID

  return (
    <section className="info" key={selectedId}>
      <p className="info__category">{info.category}</p>
      <h2 className="info__name">{info.name}</h2>
      <p className="info__text">{info.description}</p>
      {info.context && <p className="info__context">{info.context}</p>}
      {relation && <p className="info__relation">{relation}</p>}
      {isWatcher && <p className="info__relation">Observing {getTarget(observed)?.name}.</p>}
      <div className="info__actions">
        {isWatcher && mode !== 'watcher' && (
          <button className="primary" onClick={() => requestCamera({ kind: 'watcherPov' })}>See through his eyes</button>
        )}
        {isWatcher && focusId !== WATCHER_ID && mode !== 'watcher' && (
          <button className="quiet" onClick={() => requestCamera({ kind: 'focus', id: WATCHER_ID })}>Approach</button>
        )}
        {!isWatcher && selectedId !== observed && selectedId !== 'sun' && (
          <button className="quiet" onClick={() => setObservationTarget(selectedId)}>Turn his gaze here</button>
        )}
        {!isWatcher && (
          <button className="quiet" onClick={() => { select(WATCHER_ID); requestCamera({ kind: 'focus', id: WATCHER_ID }) }}>Find the Watcher</button>
        )}
        <button className="quiet" onClick={() => select(null)}>Dismiss</button>
      </div>
    </section>
  )
}
