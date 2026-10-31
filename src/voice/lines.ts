/** Seconds into the clip, and what is heard. Text in parentheses is a sound, not a word. */
export type Beat = [start: number, end: number, text: string]

export interface VoiceLine {
  id: string
  seconds: number
  /** Tags in square brackets shaped the performance when the clip was generated. */
  spoken: string
  /** Each screen is one caption. Beats were measured from the audio, not guessed. */
  screens: Beat[][]
}

const line = (id: string, seconds: number, spoken: string, ...screens: Beat[][]): VoiceLine => ({ id, seconds, spoken, screens })

export const OPENING = line('opening', 16.56,
  '[slowly] Before your world had a name, I was already here. [pause] I have watched every star in this sky catch fire... [softly] and I will see the last of them go dark. [pause] Stay a while. There is so much to show you.',
  [[0.1, 2.16, 'Before your world had a name,'], [3.1, 4.32, 'I was already here.']],
  [[5.78, 9.38, 'I have watched every star in this sky catch fire...'], [10.12, 12.3, 'and I will see the last of them go dark.']],
  [[13.3, 14.04, 'Stay a while.'], [14.76, 16.32, 'There is so much to show you.']],
)

export const APPROACH = [
  line('approach-1', 4.16, '[softly] You noticed me. [pause] Almost no one ever looks up.',
    [[0.26, 1.04, 'You noticed me.'], [2.06, 3.96, 'Almost no one ever looks up.']]),
  line('approach-2', 6.08, '[chuckles] Closer, then. It has been a very long time since anyone stood here.',
    [[0.24, 0.8, '(a low chuckle)'], [1.14, 1.9, 'Closer, then.'], [2.66, 5.86, 'It has been a very long time since anyone stood here.']]),
  line('approach-3', 6.16, '[slowly] I do not interfere. I only remember. [pause] Someone must.',
    [[0.16, 1.9, 'I do not interfere.'], [2.9, 4.08, 'I only remember.'], [4.92, 5.92, 'Someone must.']]),
]

export const THROUGH_HIS_EYES = [
  line('eyes-1', 6.16, '[softly] Through my eyes, then. [pause] Look as long as you like. I have never once looked away.',
    [[0.22, 1.28, 'Through my eyes, then.']],
    [[2.36, 3.54, 'Look as long as you like.'], [4.12, 5.92, 'I have never once looked away.']]),
  line('eyes-2', 5.28, '[whispers] There. Do you see it now? Everything, happening all at once.',
    [[0.26, 0.64, 'There.'], [1.2, 2, 'Do you see it now?']],
    [[2.66, 3.16, 'Everything,'], [3.72, 5.08, 'happening all at once.']]),
]

export const WORLDS: Record<string, VoiceLine> = {
  earth: line('world-earth', 7.28, '[warmly] Earth. So small... and so stubborn. [pause] I have a fondness for stubborn things.',
    [[0.16, 0.54, 'Earth.'], [1.16, 2.16, 'So small...'], [2.74, 4.02, 'and so stubborn.']],
    [[4.96, 7.08, 'I have a fondness for stubborn things.']]),
  titan: line('world-titan', 5.84, '[sighs] Titan. I watched this world choose its own ending.',
    [[0.1, 0.44, '(a sigh)'], [1.04, 1.56, 'Titan.'], [2.6, 5.58, 'I watched this world choose its own ending.']]),
  vormir: line('world-vormir', 5.92, '[softly] Vormir. Some truths ask a price. [pause] Here, it was paid.',
    [[0.24, 0.82, 'Vormir.'], [1.66, 3.52, 'Some truths ask a price.']],
    [[4.22, 4.58, 'Here,'], [5.04, 5.72, 'it was paid.']]),
}

/** The things he says to no one, while you explore. */
export const MUSINGS = [
  line('muse-1', 7.6, '[exhales] Hmm. [pause] Another sun, just born. I have never tired of that.',
    [[0.1, 1.2, '(a slow breath)'], [1.3, 1.54, 'Hmm.']],
    [[2.78, 3.68, 'Another sun,'], [4.2, 5.02, 'just born.'], [5.72, 7.38, 'I have never tired of that.']]),
  line('muse-2', 9.6, '[slowly] I have seen empires rise and fall in a single breath. [pause] Every one of them was certain it would last.',
    [[0.16, 4.9, 'I have seen empires rise and fall in a single breath.']],
    [[6.3, 9.36, 'Every one of them was certain it would last.']]),
  line('muse-3', 5.6, '[chuckles] Everything I know, I learned from small things that refused to give up.',
    [[0.06, 0.32, '(a low chuckle)'], [1.06, 2.14, 'Everything I know,'], [2.44, 5.42, 'I learned from small things that refused to give up.']]),
  line('muse-4', 4.48, "[softly] Every ending I have ever witnessed was someone else's beginning.",
    [[0.22, 2.54, 'Every ending I have ever witnessed'], [2.84, 4.24, "was someone else's beginning."]]),
  line('muse-5', 7.68, '[sighs] So many worlds... so many goodbyes. [pause] I would not trade a single one.',
    [[0.1, 0.42, '(a sigh)'], [0.72, 1.98, 'So many worlds...'], [2.94, 4.2, 'so many goodbyes.']],
    [[5.18, 7.34, 'I would not trade a single one.']]),
  line('muse-6', 4.8, '[warmly] What a journey this has been. [pause] And I have never moved at all.',
    [[0.28, 2.06, 'What a journey this has been.'], [2.92, 4.62, 'And I have never moved at all.']]),
  line('muse-7', 6.32, '[exhales slowly] Mmm. [long pause] Still here. Still watching.',
    [[0.2, 0.72, '(a long breath)'], [1.46, 1.98, 'Mmm.']],
    [[3.46, 4.28, 'Still here.'], [5.08, 5.96, 'Still watching.']]),
  line('muse-8', 4.32, '[softly] Billions of years... and love still surprises me.',
    [[0.26, 1.46, 'Billions of years...'], [2.46, 4.18, 'and love still surprises me.']]),
]
