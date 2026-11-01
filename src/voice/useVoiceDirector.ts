import { useEffect } from 'react'
import { useApp, WATCHER_ID } from '../state/store'
import { APPROACH, MUSINGS, OPENING, THROUGH_HIS_EYES, WORLDS, type VoiceLine } from './lines'
import { isSpeaking, RANK, speak, unlockVoice } from './voice'

const OPENING_DELAY = 1.4
const REACTION_GAP = 10 // seconds before he reacts to you again
const FIRST_MUSING = 40
const MUSING_GAP = [50, 85] // seconds of quiet between musings
const INPUT_QUIET = 4 // he waits for a pause in what you are doing

const now = () => performance.now() / 1000

function shuffled<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Decides when he speaks. What he says lives in lines.ts, and how it plays in voice.ts. */
export function useVoiceDirector() {
  useEffect(() => {
    let lastReaction = -REACTION_GAP
    let lastInput = 0
    let nextMusing = now() + FIRST_MUSING
    let approach = 0
    let eyes = 0
    let musings = shuffled(MUSINGS)
    const heard = new Set<string>()

    const react = (line: VoiceLine) => {
      if (now() - lastReaction < REACTION_GAP || !speak(line, RANK.reaction)) return false
      lastReaction = now()
      nextMusing = Math.max(nextMusing, now() + line.seconds + 20)
      return true
    }

    // He speaks once the door opens, not while the loading screen is up.
    let opening = 0
    const greet = () => {
      opening = window.setTimeout(() => {
        if (speak(OPENING, RANK.opening)) nextMusing = now() + OPENING.seconds + FIRST_MUSING
      }, OPENING_DELAY * 1000)
    }
    if (useApp.getState().loaded) greet()

    let approachTimer = 0
    const stop = useApp.subscribe((state, previous) => {
      if (state.loaded && !previous.loaded) greet()

      // Selecting him is also the first step into his eyes, so let the camera declare itself first.
      if (state.selectedId === WATCHER_ID && previous.selectedId !== WATCHER_ID) {
        clearTimeout(approachTimer)
        approachTimer = window.setTimeout(() => {
          const app = useApp.getState()
          if (app.selectedId !== WATCHER_ID || app.mode === 'watcher') return
          if (app.request?.kind === 'watcherPov' && app.travelling) return
          if (react(APPROACH[approach % APPROACH.length])) approach++
        }, 350)
      }

      const inEyes = state.mode === 'watcher' && !state.travelling
      if (inEyes && !(previous.mode === 'watcher' && !previous.travelling)) {
        if (react(THROUGH_HIS_EYES[eyes % THROUGH_HIS_EYES.length])) eyes++
      }

      const arrived = state.focusId && !state.travelling && (previous.travelling || previous.focusId !== state.focusId)
      const world = arrived ? WORLDS[state.focusId!] : undefined
      if (world && !heard.has(world.id) && react(world)) heard.add(world.id)
    })

    const musing = setInterval(() => {
      const app = useApp.getState()
      // Never start a thought on the way somewhere: he will have something to say on arrival.
      if (!app.loaded || app.intro || app.travelling || app.voiceBlocked || document.hidden || isSpeaking()) return
      if (now() < nextMusing || now() - lastInput < INPUT_QUIET) return
      if (musings.length === 0) musings = shuffled(MUSINGS)
      const line = musings.pop()!
      speak(line, RANK.musing)
      nextMusing = now() + line.seconds + MUSING_GAP[0] + Math.random() * (MUSING_GAP[1] - MUSING_GAP[0])
    }, 1000)

    const onWheel = () => { lastInput = now() }
    const onInput = () => {
      lastInput = now()
      if (useApp.getState().voiceBlocked) unlockVoice()
    }
    window.addEventListener('pointerdown', onInput, true)
    window.addEventListener('keydown', onInput, true)
    window.addEventListener('wheel', onWheel, { passive: true, capture: true })

    return () => {
      clearTimeout(opening)
      clearTimeout(approachTimer)
      clearInterval(musing)
      stop()
      window.removeEventListener('pointerdown', onInput, true)
      window.removeEventListener('keydown', onInput, true)
      window.removeEventListener('wheel', onWheel, true)
    }
  }, [])
}
