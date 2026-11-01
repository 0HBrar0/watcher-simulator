import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useApp } from '../state/store'
import { CHECK_NEEDED, ERRORS, MAX_CONTACT, MAX_MESSAGE, isValid, leaveWord, loadTurnstile, type ContactMethod } from './word'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input:not([tabindex="-1"])'
const METHODS: { id: Exclude<ContactMethod, 'none'>; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'other', label: 'Something else' },
]

/** Keeps Tab inside, closes on Escape, and hands focus back. No key reaches the camera or the shortcuts. */
function useDialogKeys(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const previous = document.activeElement as HTMLElement | null
    root.querySelector<HTMLElement>('textarea')?.focus()

    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    root.addEventListener('keydown', onKey)
    return () => {
      root.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [ref, onClose])
}

/** The human check. Usually invisible, and it sends the note by itself once it passes. */
function HumanCheck({ onPass, onFail }: { onPass: (token: string) => void; onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const handlers = useRef({ onPass, onFail })
  handlers.current = { onPass, onFail }

  useEffect(() => {
    let gone = false
    let remove = () => {}
    loadTurnstile()
      .then((turnstile) => {
        if (gone || !host.current) return
        const id = turnstile.render(host.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
          theme: 'dark',
          appearance: 'interaction-only',
          callback: (token: string) => handlers.current.onPass(token),
          'error-callback': () => handlers.current.onFail(),
        })
        remove = () => turnstile.remove(id)
      })
      .catch(() => handlers.current.onFail())
    return () => { gone = true; remove() }
  }, [])

  return (
    <div className="word__check">
      <p>That is a lot of words. One quick check, then yours will go through.</p>
      <div ref={host} />
    </div>
  )
}

/** The one way to leave a mark here. Words stay in memory, and survive closing, until they are delivered. */
export function LeaveAWord() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [method, setMethod] = useState<ContactMethod>('none')
  const [contact, setContact] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const setPanel = useApp((s) => s.setPanel)

  const close = useCallback(() => {
    setOpen(false)
    setSent(false)
    setError('')
    setChecking(false)
  }, [])

  const send = async (website: string, checkToken?: string) => {
    const draft = { message, contactMethod: method, contact, website }
    setError('')
    if (!isValid(draft)) { setError(ERRORS.validation); return }
    setSending(true)
    setChecking(false)
    const failure = await leaveWord(draft, checkToken)
    setSending(false)
    if (failure === CHECK_NEEDED) { setChecking(true); return }
    if (failure) { setError(failure); return }
    setMessage('')
    setMethod('none')
    setContact('')
    setSent(true)
  }

  return (
    <>
      <button
        ref={button}
        className="quiet word-button"
        aria-label="Leave a word"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) { close(); return }
          setPanel({ atlasOpen: false, settingsOpen: false, keysOpen: false })
          setOpen(true)
        }}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="0.9" />
          <circle className="word-button__iris" cx="8" cy="8" r="1.9" fill="currentColor" />
        </svg>
        <span aria-hidden="true">Leave a word</span>
      </button>
      {open && (
        <WordPanel
          trigger={button}
          onClose={close}
          onSend={send}
          onCheckFailed={() => { setChecking(false); setError(ERRORS.rateLimit) }}
          {...{ message, setMessage, method, setMethod, contact, setContact, sending, sent, error, checking }}
        />
      )}
    </>
  )
}

interface PanelProps {
  trigger: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onSend: (website: string, checkToken?: string) => void
  onCheckFailed: () => void
  message: string
  setMessage: (value: string) => void
  method: ContactMethod
  setMethod: (value: ContactMethod) => void
  contact: string
  setContact: (value: string) => void
  sending: boolean
  sent: boolean
  error: string
  checking: boolean
}

function WordPanel({ trigger, onClose, onSend, onCheckFailed, message, setMessage, method, setMethod, contact, setContact, sending, sent, error, checking }: PanelProps) {
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const trap = useRef<HTMLInputElement>(null)
  useDialogKeys(panel, onClose)

  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [onClose, trigger])

  // The send button leaves with the form, so focus needs somewhere to land.
  useEffect(() => { if (sent) closeButton.current?.focus() }, [sent])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!sending && !checking) onSend(trap.current?.value ?? '')
  }

  return (
    <div ref={panel} className="word" role="dialog" aria-modal="true" aria-labelledby="word-title">
      <div className="word__head">
        <h2 id="word-title">Leave a word</h2>
        <button ref={closeButton} type="button" className="quiet" onClick={onClose}>Close</button>
      </div>
      <div role="status" className="word__sent">
        {sent && (
          <>
            <strong>It has been heard.</strong>
            <p>Your word has reached the one who made all this.</p>
          </>
        )}
      </div>
      {!sent && (
        <form onSubmit={submit} noValidate>
          <p className="word__lead">He only watches. The one who made him will read this.</p>
          <label htmlFor="word-message">Your words</label>
          <textarea id="word-message" rows={3} maxLength={MAX_MESSAGE} aria-describedby="word-limit" value={message} onChange={(e) => setMessage(e.target.value)} />
          <small id="word-limit">Up to 500 characters. You may leave it blank and simply say you were here.</small>

          <div className="word__methods" role="group" aria-label="How to reach you">
            <span>Want a reply?</span>
            {METHODS.map(({ id, label }) => (
              <button key={id} type="button" aria-pressed={method === id} onClick={() => setMethod(method === id ? 'none' : id)}>{label}</button>
            ))}
          </div>
          {method !== 'none' && (
            <input
              type="text"
              aria-label={method === 'email' ? 'Your email' : 'How to reach you'}
              autoComplete={method === 'email' ? 'email' : 'off'}
              inputMode={method === 'email' ? 'email' : 'text'}
              maxLength={MAX_CONTACT}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          )}

          <div className="word__trap">
            <input ref={trap} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" aria-hidden="true" />
          </div>

          {checking && <HumanCheck onPass={(token) => onSend(trap.current?.value ?? '', token)} onFail={onCheckFailed} />}
          <button type="submit" className="primary" disabled={sending || checking}>{sending ? 'Sending' : 'Leave it'}</button>
          <p role="alert" className="word__error">{error}</p>
          <small>Sent to the creator as a phone notification through ntfy. A contact is optional, and used only to reply.</small>
        </form>
      )}
    </div>
  )
}
