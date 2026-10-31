import { useApp } from '../state/store'
import { QUALITY, type QualityLevel } from '../state/quality'

const LEVELS = Object.keys(QUALITY) as QualityLevel[]

export function GraphicsSettings() {
  const open = useApp((s) => s.settingsOpen)
  const quality = useApp((s) => s.quality)
  const setQuality = useApp((s) => s.setQuality)
  const showGaze = useApp((s) => s.showGaze)
  const setShowGaze = useApp((s) => s.setShowGaze)

  return (
    <aside className={`settings ${open ? 'settings--open' : ''}`} aria-hidden={!open}>
      <div className="settings__row" role="group" aria-label="Rendering quality">
        {LEVELS.map((level) => (
          <button key={level} tabIndex={open ? 0 : -1} className={level === quality ? 'is-current' : ''} aria-pressed={level === quality} onClick={() => setQuality(level)}>
            {QUALITY[level].label}
          </button>
        ))}
      </div>
      <label className="settings__toggle">
        <input type="checkbox" tabIndex={open ? 0 : -1} checked={showGaze} onChange={(e) => setShowGaze(e.target.checked)} />
        Show his line of sight
      </label>
    </aside>
  )
}
