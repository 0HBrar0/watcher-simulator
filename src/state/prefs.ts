export interface Prefs {
  lookSpeed: number
  zoomSpeed: number
  idleDrift: boolean
  showFps: boolean
}

export const DEFAULT_PREFS: Prefs = { lookSpeed: 1, zoomSpeed: 1, idleDrift: true, showFps: false }

const KEY = 'watcher.prefs'

export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* storage may be blocked */ }
}
