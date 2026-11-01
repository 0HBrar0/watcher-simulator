import { useEffect, useState } from 'react'
import { useApp, WATCHER_ID } from '../state/store'
import { trackers } from './ScreenTracker'
import { PlanetaryIndex } from './PlanetaryIndex'
import { ObjectInformation } from './ObjectInformation'
import { CameraControls } from './CameraControls'
import { GraphicsSettings } from './GraphicsSettings'
import { ZoomRail } from './ZoomRail'
import { KeySheet, toggleFullscreen, useShortcuts } from './Shortcuts'
import { Subtitles } from './Subtitles'
import { LeaveAWord } from './LeaveAWord'
import { useVoiceDirector } from '../voice/useVoiceDirector'
import { getTarget } from '../planets/PlanetRegistry'
import { earthCommands } from '../camera/cameraInput'

function Title() {
  const intro = useApp((s) => s.intro)
  const blocked = useApp((s) => s.voiceBlocked)
  return (
    <div className={`title ${intro ? 'title--intro' : ''}`} aria-hidden={!intro}>
      <h1>The Watcher</h1>
      <p>He sees everything. Now, so can you.</p>
      {/* Any click starts him; this just says so. */}
      {blocked && <button className="quiet title__hear">Hear him speak</button>}
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
  return <button className="quiet" onClick={toggleFullscreen}>{on ? 'Windowed' : 'Fullscreen'}</button>
}

/** One quiet line at the top of the sky, gone on its own a moment later. */
function Toast() {
  const toast = useApp((s) => s.toast)
  if (!toast) return null
  return <p className="toast" key={toast.nonce} role="status" style={{ animationDuration: `${toast.seconds}s` }}>{toast.text}</p>
}

const HINTED = 'watcher.hinted'

/** Shown once, the first time someone has control of the camera. */
function useFirstHint() {
  const intro = useApp((s) => s.intro)
  const notify = useApp((s) => s.notify)
  useEffect(() => {
    if (intro) return
    try {
      if (localStorage.getItem(HINTED)) return
      localStorage.setItem(HINTED, '1')
    } catch { /* storage may be blocked */ }
    notify('Drag to look. Scroll to zoom. Hold Alt for fine control. Press ? for all the keys.', 8)
  }, [intro, notify])
}

export function Interface() {
  const mode = useApp((s) => s.mode)
  const focusId = useApp((s) => s.focusId)
  const requestCamera = useApp((s) => s.requestCamera)
  const atlasOpen = useApp((s) => s.atlasOpen)
  const setPanel = useApp((s) => s.setPanel)
  const settingsOpen = useApp((s) => s.settingsOpen)
  const intro = useApp((s) => s.intro)
  const keysOpen = useApp((s) => s.keysOpen)
  const hidden = useApp((s) => s.interfaceHidden)
  const onEarth = useApp((s) => s.earthPhase === 'on')
  const away = mode !== 'observer' || !!focusId
  useShortcuts()
  useFirstHint()
  useVoiceDirector()

  return (
    <div className={`hud ${intro ? 'hud--intro' : ''} ${hidden ? 'hud--hidden' : ''} ${onEarth ? 'hud--earth' : ''}`}>
      <div className="label" ref={(el) => { trackers.label = el }} />
      <Title />
      <PovCaption />
      <Subtitles />
      <Locator />
      <Toast />
      {intro && <button className="quiet skip" onClick={() => requestCamera({ kind: 'overview' })}>Skip intro</button>}

      <nav className="corner corner--left">
        <button className="wordmark" onClick={() => requestCamera({ kind: 'overview' })} title="Return to the overview">
          The Watcher
        </button>
        <button className="quiet" onClick={() => setPanel({ atlasOpen: !atlasOpen, settingsOpen: false, keysOpen: false })} aria-expanded={atlasOpen}>Atlas</button>
        {away && <button className="quiet" onClick={() => requestCamera({ kind: 'overview' })}>Overview</button>}
        {onEarth && <button className="quiet back-to-space" onClick={() => earthCommands.leave()}>Back to space</button>}
      </nav>

      <nav className="corner corner--right">
        <LeaveAWord />
        <button className="quiet" onClick={() => setPanel({ settingsOpen: !settingsOpen, atlasOpen: false, keysOpen: false })} aria-expanded={settingsOpen}>Settings</button>
        <button className="quiet" onClick={() => setPanel({ keysOpen: !keysOpen, atlasOpen: false, settingsOpen: false })} aria-expanded={keysOpen}>Keys</button>
        <Fullscreen />
      </nav>

      <PlanetaryIndex />
      <GraphicsSettings />
      <ObjectInformation />
      <CameraControls />
      <ZoomRail />
      <KeySheet />
      <p className="fps" ref={(el) => { trackers.fps = el }} />

      <footer className="disclaimer">Unofficial, non-commercial fan project. Not affiliated with Marvel or Disney.</footer>
    </div>
  )
}
