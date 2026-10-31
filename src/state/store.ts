import { create } from 'zustand'
import { loadQuality, saveQuality, type QualityLevel } from './quality'

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
  quality: QualityLevel
  showGaze: boolean
  observationTarget: string // mirrored from the Watcher's own state for the UI
  request: (CameraRequest & { nonce: number }) | null

  select: (id: string | null) => void
  hover: (id: string | null) => void
  setCamera: (partial: Partial<Pick<AppState, 'mode' | 'focusId' | 'travelling' | 'intro'>>) => void
  requestCamera: (request: CameraRequest) => void
  setPanel: (partial: Partial<Pick<AppState, 'atlasOpen' | 'settingsOpen'>>) => void
  setQuality: (level: QualityLevel) => void
  setShowGaze: (show: boolean) => void
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
  quality: loadQuality(),
  showGaze: true,
  observationTarget: '',
  request: null,

  select: (selectedId) => set({ selectedId }),
  hover: (hoveredId) => set((s) => (s.hoveredId === hoveredId ? s : { hoveredId })),
  setCamera: (partial) => set(partial),
  requestCamera: (request) => set({ request: { ...request, nonce: ++nonce } }),
  setPanel: (partial) => set(partial),
  setQuality: (quality) => { saveQuality(quality); set({ quality }) },
  setShowGaze: (showGaze) => set({ showGaze }),
  setObservationMirror: (observationTarget) => set({ observationTarget }),
}))
