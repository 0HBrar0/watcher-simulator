import { BODIES, SUN, WATCHER } from '../planets/planetData'
import { useApp, WATCHER_ID } from '../state/store'

const known = BODIES.filter((b) => !b.fictional)
const beyond = BODIES.filter((b) => b.fictional)

/** Names set straight onto the sky. There is deliberately no panel behind them. */
export function PlanetaryIndex() {
  const open = useApp((s) => s.atlasOpen)
  const selectedId = useApp((s) => s.selectedId)
  const select = useApp((s) => s.select)
  const requestCamera = useApp((s) => s.requestCamera)
  const setPanel = useApp((s) => s.setPanel)

  const go = (id: string) => {
    select(id)
    requestCamera({ kind: 'focus', id })
    setPanel({ atlasOpen: false })
  }
  const item = (id: string, name: string) => (
    <li key={id}>
      <button className={selectedId === id ? 'is-current' : ''} onClick={() => go(id)} tabIndex={open ? 0 : -1}>{name}</button>
    </li>
  )

  return (
    <aside className={`atlas ${open ? 'atlas--open' : ''}`} aria-hidden={!open}>
      <ul className="atlas__lead">{item(WATCHER_ID, WATCHER.name)}</ul>
      <h2>Known worlds</h2>
      <ul>
        {item(SUN.id, SUN.name)}
        {known.map((b) => item(b.id, b.name))}
      </ul>
      <h2>Beyond the map</h2>
      <ul>{beyond.map((b) => item(b.id, b.name))}</ul>
    </aside>
  )
}
