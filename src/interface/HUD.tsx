import { useCallback, useEffect, useState } from 'react'
import { useApp, WATCHER_ID } from '../state/store'
import { trackers } from './ScreenTracker'
import { PlanetaryIndex } from './PlanetaryIndex'
import { ObjectInformation } from './ObjectInformation'
import { CameraControls } from './CameraControls'
import { GraphicsSettings } from './GraphicsSettings'
import { getTarget } from '../planets/PlanetRegistry'

function Title() {
  const intro = useApp((s) => s.intro)
  return (
    <div className={`title ${intro ? 'title--intro' : ''}`} aria-hidden={!intro}>
      <h1>The Watcher</h1>
      <p>He sees everything. Now, so can you.</p>
    </div>
  )
}

function PovCaption() {
  const inPov = useApp((s) => s.mode === 'watcher' && !s.travelling)
  const targetId = useApp((s) => s.observationTarget)
  const name = getTarget(targetId)?.name
  return (
    <div className={`pov ${inPov ? 'pov--on' : ''}`} aria-hidden={!inPov}>
      <i className="pov__bar pov__bar--top" />
      <i className="pov__bar pov__bar--bottom" />
      <p className="pov__caption">You are seeing through his eyes. <em>He is watching {name}.</em></p>
    </div>
  )
}

function Locator() {
  const requestCamera = useApp((s) => s.requestCamera)
  const select = useApp((s) => s.select)
  return (
    <button
      className="locator"
      ref={(el) => { trackers.locator = el }}
      onClick={() => { select(WATCHER_ID); requestCamera({ kind: 'focus', id: WATCHER_ID }) }}
      title="Find the Watcher"
    >
      <span className="locator__dot" ref={(el) => { trackers.locatorArrow = el }}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3l11 5-11 5 3-5z" fill="currentColor" /></svg>
      </span>
      <span className="locator__name">The Watcher</span>
    </button>
  )
}

function Fullscreen() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const update = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.()
  }, [])
  return <button className="quiet" onClick={toggle}>{on ? 'Windowed' : 'Fullscreen'}</button>
}

export function Interface() {
  const mode = useApp((s) => s.mode)
  const focusId = useApp((s) => s.focusId)
  const requestCamera = useApp((s) => s.requestCamera)
  const atlasOpen = useApp((s) => s.atlasOpen)
  const setPanel = useApp((s) => s.setPanel)
  const settingsOpen = useApp((s) => s.settingsOpen)
  const intro = useApp((s) => s.intro)
  const away = mode !== 'observer' || !!focusId

  return (
    <div className={`hud ${intro ? 'hud--intro' : ''}`}>
      <div className="label" ref={(el) => { trackers.label = el }} />
      <Title />
      <PovCaption />
      <Locator />

      <nav className="corner corner--left">
        <button className="wordmark" onClick={() => requestCamera({ kind: 'overview' })} title="Return to the overview">
          The Watcher
        </button>
        <button className="quiet" onClick={() => setPanel({ atlasOpen: !atlasOpen })} aria-expanded={atlasOpen}>Atlas</button>
        {away && <button className="quiet" onClick={() => requestCamera({ kind: 'overview' })}>Overview</button>}
      </nav>

      <nav className="corner corner--right">
        <button className="quiet" onClick={() => setPanel({ settingsOpen: !settingsOpen })} aria-expanded={settingsOpen}>Graphics</button>
        <Fullscreen />
      </nav>

      <PlanetaryIndex />
      <GraphicsSettings />
      <ObjectInformation />
      <CameraControls />

      <footer className="disclaimer">Unofficial, non-commercial fan project. Not affiliated with Marvel or Disney.</footer>
    </div>
  )
}
