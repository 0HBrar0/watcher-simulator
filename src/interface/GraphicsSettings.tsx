import { useApp } from '../state/store'
import { QUALITY, type QualityLevel } from '../state/quality'
import { DEFAULT_PREFS } from '../state/prefs'

const LEVELS = Object.keys(QUALITY) as QualityLevel[]

function Slider({ label, value, min = 0.3, max = 2, tabIndex, onChange }: { label: string; value: number; min?: number; max?: number; tabIndex: number; onChange: (v: number) => void }) {
  return (
    <label className="settings__speed">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={0.05} value={value} tabIndex={tabIndex} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{value.toFixed(2)}</output>
    </label>
  )
}

export function GraphicsSettings() {
  const open = useApp((s) => s.settingsOpen)
  const quality = useApp((s) => s.quality)
  const setQuality = useApp((s) => s.setQuality)
  const showGaze = useApp((s) => s.showGaze)
  const setShowGaze = useApp((s) => s.setShowGaze)
  const prefs = useApp((s) => s.prefs)
  const setPrefs = useApp((s) => s.setPrefs)
  const tabIndex = open ? 0 : -1

  return (
    <aside className={`settings ${open ? 'settings--open' : ''}`} aria-hidden={!open}>
      <div className="settings__row" role="group" aria-label="Rendering quality">
        {LEVELS.map((level) => (
          <button key={level} tabIndex={tabIndex} className={level === quality ? 'is-current' : ''} aria-pressed={level === quality} onClick={() => setQuality(level)}>
            {QUALITY[level].label}
          </button>
        ))}
      </div>
      <Slider label="Drag speed" value={prefs.lookSpeed} tabIndex={tabIndex} onChange={(lookSpeed) => setPrefs({ lookSpeed })} />
      <Slider label="Zoom speed" value={prefs.zoomSpeed} tabIndex={tabIndex} onChange={(zoomSpeed) => setPrefs({ zoomSpeed })} />
      <Slider label="Voice volume" value={prefs.voiceVolume} min={0} max={1} tabIndex={tabIndex} onChange={(voiceVolume) => setPrefs({ voiceVolume })} />
      <label className="settings__toggle">
        <input type="checkbox" tabIndex={tabIndex} checked={prefs.voice} onChange={(e) => setPrefs({ voice: e.target.checked })} />
        His voice
      </label>
      <label className="settings__toggle">
        <input type="checkbox" tabIndex={tabIndex} checked={prefs.subtitles} onChange={(e) => setPrefs({ subtitles: e.target.checked })} />
        Subtitles
      </label>
      <label className="settings__toggle">
        <input type="checkbox" tabIndex={tabIndex} checked={showGaze} onChange={(e) => setShowGaze(e.target.checked)} />
        Show his line of sight
      </label>
      <label className="settings__toggle">
        <input type="checkbox" tabIndex={tabIndex} checked={prefs.idleDrift} onChange={(e) => setPrefs({ idleDrift: e.target.checked })} />
        Drift slowly when idle
      </label>
      <label className="settings__toggle">
        <input type="checkbox" tabIndex={tabIndex} checked={prefs.showFps} onChange={(e) => setPrefs({ showFps: e.target.checked })} />
        Show frame rate
      </label>
      <button className="quiet settings__reset" tabIndex={tabIndex} onClick={() => setPrefs(DEFAULT_PREFS)}>Reset controls</button>
    </aside>
  )
}
