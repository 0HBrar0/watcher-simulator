import { create } from 'zustand'
import { loadQuality, saveQuality, type QualityLevel } from './quality'
import { loadPrefs, savePrefs, type Prefs } from './prefs'
import type { VoiceLine } from '../voice/lines'

export type CameraMode = 'observer' | 'planet' | 'watcher'
export const WATCHER_ID = 'watcher'

export type CameraRequest =
  | { kind: 'focus'; id: string }
  | { kind: 'watcherPov' }
  | { kind: 'overview' }
  | { kind: 'free' }

interface AppState {
  mode: CameraMode
  focusId: string | null // body the planetary camera is anchored to
  selectedId: string | null // what the information panel shows
  hoveredId: string | null
  travelling: boolean
  intro: boolean
  atlasOpen: boolean
  settingsOpen: boolean
  keysOpen: boolean
  interfaceHidden: boolean
  quality: QualityLevel
  showGaze: boolean
  prefs: Prefs
  toast: { text: string; seconds: number; nonce: number } | null
  speech: { line: VoiceLine; nonce: number } | null
  voiceBlocked: boolean // the browser is holding back sound until a click or key press
  observationTarget: string // mirrored from the Watcher's own state for the UI
  request: (CameraRequest & { nonce: number }) | null

  select: (id: string | null) => void
  hover: (id: string | null) => void
  setCamera: (partial: Partial<Pick<AppState, 'mode' | 'focusId' | 'travelling' | 'intro'>>) => void
  requestCamera: (request: CameraRequest) => void
  setPanel: (partial: Partial<Pick<AppState, 'atlasOpen' | 'settingsOpen' | 'keysOpen' | 'interfaceHidden'>>) => void
  setQuality: (level: QualityLevel) => void
  setShowGaze: (show: boolean) => void
  setPrefs: (partial: Partial<Prefs>) => void
  setVoice: (partial: Partial<Pick<AppState, 'speech' | 'voiceBlocked'>>) => void
  notify: (text: string, seconds?: number) => void
  setObservationMirror: (id: string) => void
}

let nonce = 0

export const useApp = create<AppState>((set) => ({
  mode: 'observer',
  focusId: null,
  selectedId: null,
  hoveredId: null,
  travelling: false,
  intro: true,
  atlasOpen: false,
  settingsOpen: false,
  keysOpen: false,
  interfaceHidden: false,
  quality: loadQuality(),
  showGaze: true,
  prefs: loadPrefs(),
  toast: null,
  speech: null,
  voiceBlocked: false,
  observationTarget: '',
  request: null,

  select: (selectedId) => set({ selectedId }),
  hover: (hoveredId) => set((s) => (s.hoveredId === hoveredId ? s : { hoveredId })),
  setCamera: (partial) => set(partial),
  requestCamera: (request) => set({ request: { ...request, nonce: ++nonce } }),
  setPanel: (partial) => set(partial),
  setQuality: (quality) => { saveQuality(quality); set({ quality }) },
  setShowGaze: (showGaze) => set({ showGaze }),
  setPrefs: (partial) => set((s) => {
    const prefs = { ...s.prefs, ...partial }
    savePrefs(prefs)
    return { prefs }
  }),
  setVoice: (partial) => set(partial),
  notify: (text, seconds = 2.6) => set({ toast: { text, seconds, nonce: ++nonce } }),
  setObservationMirror: (observationTarget) => set({ observationTarget }),
}))
