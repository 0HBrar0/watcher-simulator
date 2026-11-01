import { useEffect } from 'react'
import { allTargets } from '../planets/PlanetRegistry'
import { setObservationTarget } from '../watcher/ObservationSystem'
import { useApp, WATCHER_ID } from '../state/store'
import { earthCommands } from '../camera/cameraInput'

const TOUR = allTargets.map((t) => t.id)

/** Moves to the next or previous place in the atlas, wherever you are now. */
export function stepWorld(direction: 1 | -1) {
  const { focusId, selectedId, select, requestCamera } = useApp.getState()
  const here = TOUR.indexOf(focusId ?? selectedId ?? '')
  const next = here < 0 ? (direction > 0 ? 0 : TOUR.length - 1) : (here + direction + TOUR.length) % TOUR.length
  select(TOUR[next])
  requestCamera({ kind: 'focus', id: TOUR[next] })
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen?.()
}

function toggleInterface() {
  const { interfaceHidden, setPanel, notify } = useApp.getState()
  setPanel({ interfaceHidden: !interfaceHidden, atlasOpen: false, settingsOpen: false, keysOpen: false })
  if (!interfaceHidden) notify('Interface hidden. Press H to bring it back.')
}

function gazeHere() {
  const { selectedId, notify } = useApp.getState()
  if (!selectedId || selectedId === WATCHER_ID || selectedId === 'sun') { notify('Select a world first'); return }
  setObservationTarget(selectedId)
  notify('His gaze is turning')
}

function openPlanetary() {
  const { focusId, selectedId, select, requestCamera } = useApp.getState()
  const id = [focusId, selectedId, 'earth'].find((c) => c && c !== WATCHER_ID)!
  select(id)
  requestCamera({ kind: 'focus', id })
}

function escape() {
  const { atlasOpen, settingsOpen, keysOpen, interfaceHidden, selectedId, select, setPanel, requestCamera } = useApp.getState()
  if (interfaceHidden) setPanel({ interfaceHidden: false })
  else if (atlasOpen || settingsOpen || keysOpen) setPanel({ atlasOpen: false, settingsOpen: false, keysOpen: false })
  else if (useApp.getState().earthPhase === 'on') earthCommands.leave()
  else if (selectedId) select(null)
  else requestCamera({ kind: 'overview' })
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !useApp.getState().loaded) return
      if (e.key === 'Escape') { escape(); return }
      if (e.target instanceof HTMLInputElement) return
      const app = useApp.getState()
      switch (e.key.toLowerCase()) {
        case '?': app.setPanel({ keysOpen: !app.keysOpen, atlasOpen: false, settingsOpen: false }); break
        case 'm': app.setPanel({ atlasOpen: !app.atlasOpen, settingsOpen: false, keysOpen: false }); break
        case 'o': app.setPanel({ settingsOpen: !app.settingsOpen, atlasOpen: false, keysOpen: false }); break
        case 'h': toggleInterface(); break
        case 'f': toggleFullscreen(); break
        case 'g': gazeHere(); break
        case 'v': app.setPrefs({ voice: !app.prefs.voice }); app.notify(app.prefs.voice ? 'His voice is off' : 'His voice is on'); break
        case 'r': app.requestCamera(app.focusId ? { kind: 'focus', id: app.focusId } : { kind: 'overview' }); break
        case '[': stepWorld(-1); break
        case ']': stepWorld(1); break
        case '1': app.requestCamera({ kind: 'free' }); break
        case '2': app.select(WATCHER_ID); app.requestCamera({ kind: 'watcherPov' }); break
        case '3': openPlanetary(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

const SHEET: [string, string][] = [
  ['Drag', 'Look around'],
  ['Right-drag', 'Pan'],
  ['Scroll', 'Zoom'],
  ['Alt', 'Hold for fine control'],
  ['W A S D Q E', 'Fly'],
  ['Shift', 'Hold to move faster'],
  ['Arrows', 'Orbit'],
  ['+  −', 'Zoom'],
  ['[  ]', 'Previous or next world'],
  ['1  2  3', 'Observer, his eyes, planetary'],
  ['R', 'Recentre'],
  ['G', 'Turn his gaze to the selection'],
  ['M', 'Atlas'],
  ['O', 'Settings'],
  ['V', 'His voice on or off'],
  ['H', 'Hide the interface'],
  ['F', 'Fullscreen'],
  ['Esc', 'Close, or back to the overview'],
]

/** The controls, set directly on the sky. Press ? to show or hide. */
export function KeySheet() {
  const open = useApp((s) => s.keysOpen)
  return (
    <aside className={`keys ${open ? 'keys--open' : ''}`} aria-hidden={!open}>
      <dl>
        {SHEET.map(([key, what]) => (
          <div key={key}><dt>{key}</dt><dd>{what}</dd></div>
        ))}
      </dl>
    </aside>
  )
}
