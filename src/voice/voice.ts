import { useApp } from '../state/store'
import type { VoiceLine } from './lines'

/** Higher ranks are not interrupted by lower or equal ones. */
export const RANK = { musing: 1, reaction: 2, opening: 3 } as const

const audio = new Audio()
audio.preload = 'auto'

const clipUrl = (line: VoiceLine) => `${import.meta.env.BASE_URL}assets/voice/${line.id}.mp3`

let current: VoiceLine | null = null
let currentRank = 0
let audible = false
let startedAt = 0
let silentEnd = 0
let waiting: VoiceLine | null = null
let nonce = 0
let quietUntil = 0 // another tab is speaking until then

// Only one of him: a line that starts in any tab silences him in the others.
const others = 'BroadcastChannel' in window ? new BroadcastChannel('watcher.voice') : null

const prefs = () => useApp.getState().prefs

function finish() {
  clearTimeout(silentEnd)
  current = null
  currentRank = 0
  audible = false
  useApp.getState().setVoice({ speech: null })
}

export function stopSpeaking() {
  audio.pause()
  if (current) finish()
}

function begin(line: VoiceLine, rank: number) {
  current = line
  currentRank = rank
  audible = prefs().voice
  startedAt = performance.now()
  if (audible) {
    audio.src = clipUrl(line)
    audio.volume = prefs().voiceVolume
    audio.play().then(() => others?.postMessage(line.seconds)).catch((error: Error) => {
      if (current !== line) return
      finish()
      // Browsers hold back sound until the first click or key press. Only the opening waits for it.
      if (error.name === 'NotAllowedError' && rank === RANK.opening) {
        waiting = line
        useApp.getState().setVoice({ voiceBlocked: true })
      }
    })
  } else {
    silentEnd = window.setTimeout(finish, line.seconds * 1000)
  }
  if (prefs().subtitles) useApp.getState().setVoice({ speech: { line, nonce: ++nonce } })
}

export function speak(line: VoiceLine, rank: number) {
  const { voice, subtitles } = prefs()
  if ((!voice && !subtitles) || rank <= currentRank) return false
  if (waiting || (rank === RANK.musing && performance.now() < quietUntil)) return false
  stopSpeaking()
  begin(line, rank)
  return true
}

/** Must run inside a click or key press, or the browser refuses the sound again. */
export function unlockVoice() {
  useApp.getState().setVoice({ voiceBlocked: false })
  const line = waiting
  waiting = null
  if (line) begin(line, RANK.opening)
}

/** How far through the current line he is, in seconds of its clip. */
export function voiceTime() {
  return audible ? audio.currentTime : (performance.now() - startedAt) / 1000
}

export const isSpeaking = () => current !== null

if (others) {
  others.onmessage = ({ data }: MessageEvent<number>) => {
    quietUntil = performance.now() + data * 1000
    stopSpeaking()
  }
}

/** True in the moments he is actually forming words, so the eyes can follow his speech. */
export function isVoiced() {
  if (!current || !audible) return false
  const t = audio.currentTime
  return current.screens.some((screen) => screen.some(([a, b, text]) => t >= a && t <= b && !text.startsWith('(')))
}

audio.addEventListener('ended', finish)
audio.addEventListener('error', () => { if (current && audible) finish() })

// He waits for you if you leave the tab.
document.addEventListener('visibilitychange', () => {
  if (!current || !audible) return
  if (document.hidden) audio.pause()
  else void audio.play().catch(() => stopSpeaking())
})

// A hot reload builds a second player, so the first must not keep talking over it.
import.meta.hot?.dispose(() => { audio.pause(); others?.close() })

useApp.subscribe((state, previous) => {
  if (state.prefs.voiceVolume !== previous.prefs.voiceVolume) audio.volume = state.prefs.voiceVolume
  if (state.prefs.voice !== previous.prefs.voice && !state.prefs.voice) stopSpeaking()
})
