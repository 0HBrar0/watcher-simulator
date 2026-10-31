import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { voiceTime } from '../voice/voice'
import type { Beat, VoiceLine } from '../voice/lines'

const LEAD = 0.2 // a caption settles just before he speaks it
const DISSOLVE = 1.4 // seconds, and must match .subs--out in app.css

/** Words arrive in step with his voice, spread through each beat by how long they are to say. */
function words([start, end, text]: Beat) {
  const parts = text.split(' ')
  const total = parts.reduce((sum, word) => sum + word.length + 1, 0)
  let spent = 0
  return parts.map((word) => {
    const at = start + (spent / total) * (end - start)
    spent += word.length + 1
    return { word, at }
  })
}

function Caption({ line, leaving }: { line: VoiceLine; leaving: boolean }) {
  const root = useRef<HTMLDivElement>(null)

  const screens = useMemo(() => line.screens.map((beats, i) => ({
    beats,
    from: beats[0][0] - LEAD,
    until: i + 1 < line.screens.length ? line.screens[i + 1][0][0] - LEAD * 2 : Infinity,
  })), [line])

  useEffect(() => {
    const el = root.current
    if (!el) return
    const parts = [...el.querySelectorAll<HTMLElement>('.subs__screen')]
    const spoken = [...el.querySelectorAll<HTMLElement>('[data-at]')]
    let frame = 0
    const tick = () => {
      const t = voiceTime()
      parts.forEach((part, i) => {
        part.classList.toggle('is-on', t >= screens[i].from && t < screens[i].until)
        part.classList.toggle('is-past', t >= screens[i].until)
      })
      spoken.forEach((word) => word.classList.toggle('is-said', t >= Number(word.dataset.at)))
      frame = requestAnimationFrame(tick)
    }
    if (!leaving) tick()
    return () => cancelAnimationFrame(frame)
  }, [screens, leaving])

  return (
    <div className={`subs ${leaving ? 'subs--out' : ''}`} ref={root} role="status" aria-label={line.screens.flat().map((b) => b[2]).join(' ')}>
      <i className="subs__rule" aria-hidden="true" />
      {screens.map(({ beats }, i) => (
        <p className="subs__screen" key={i} aria-hidden="true">
          {beats.map((beat, b) => beat[2].startsWith('(')
            ? <span className="subs__sound" key={b} data-at={beat[0]}>{beat[2].slice(1, -1)}</span>
            : (
              <span className="subs__beat" key={b}>
                {words(beat).map(({ word, at }, w) => <span className="subs__word" key={w} data-at={at}>{word} </span>)}
              </span>
            ))}
        </p>
      ))}
    </div>
  )
}

/** His words, set directly on the sky. When he finishes they come apart, like the hem of his cloak. */
export function Subtitles() {
  const speech = useApp((s) => s.speech)
  const [shown, setShown] = useState(speech)

  useEffect(() => {
    if (speech) { setShown(speech); return }
    const timer = setTimeout(() => setShown(null), DISSOLVE * 1000)
    return () => clearTimeout(timer)
  }, [speech])

  const live = speech ?? shown
  if (!live) return null
  return <Caption key={live.nonce} line={live.line} leaving={!speech} />
}
