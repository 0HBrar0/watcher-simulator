/** The one network call the site makes for this, and only when a visitor presses send. */
const service = (): string | undefined => import.meta.env.VITE_UPLINK_URL
const TIMEOUT_MS = 15000
const CHECK_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MAX_MESSAGE = 500
export const MAX_CONTACT = 254

/** What leaveWord resolves to when the service wants a human check before it will accept. */
export const CHECK_NEEDED = 'check-needed'

export type ContactMethod = 'none' | 'email' | 'other'

export interface Draft {
  message: string
  contactMethod: ContactMethod
  contact: string
  website: string // hidden field that only a bot fills in
}

export const ERRORS = {
  network: 'It did not carry. Your words are still here, so please try again.',
  rateLimit: 'Too many words too soon. Please wait a while, then try again.',
  validation: 'Please check what you wrote and try again.',
  service: 'This cannot reach the creator just now. Your words are still here.',
  spam: 'This could not be accepted.',
}

export function isValid({ message, contactMethod, contact }: Draft) {
  const reply = contact.trim()
  if ([...message.trim()].length > MAX_MESSAGE || [...reply].length > MAX_CONTACT) return false
  if (contactMethod === 'email') return EMAIL.test(reply)
  return contactMethod === 'other' ? reply !== '' : true
}

function errorFor(status: number) {
  if (status === 429) return ERRORS.rateLimit
  if (status === 403) return ERRORS.spam
  if (status >= 500) return ERRORS.service
  return ERRORS.validation
}

interface Turnstile {
  render: (host: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}

declare global {
  interface Window { turnstile?: Turnstile }
}

/** Loaded only once a visitor is over their limit, so nobody else ever contacts Cloudflare. */
export function loadTurnstile(): Promise<Turnstile> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) { resolve(window.turnstile); return }
    const script = document.createElement('script')
    script.src = CHECK_SCRIPT
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    script.onerror = reject
    document.head.append(script)
  })
}

/** Resolves to null once delivered, to CHECK_NEEDED, or to the error to show. */
export async function leaveWord(draft: Draft, checkToken?: string): Promise<string | null> {
  if (!service()) return ERRORS.service
  const body = {
    message: draft.message.trim(),
    contactMethod: draft.contactMethod,
    contact: draft.contactMethod === 'none' ? '' : draft.contact.trim(),
    website: draft.website,
    ...(checkToken && { turnstileToken: checkToken }),
  }
  try {
    const answer = await fetch(`${service()}/api/uplink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (answer.ok) return null
    if (answer.status === 429 && import.meta.env.VITE_TURNSTILE_SITE_KEY) {
      const refused = (await answer.json().catch(() => ({}))) as { challenge?: boolean }
      if (refused.challenge) return CHECK_NEEDED
    }
    return errorFor(answer.status)
  } catch {
    return ERRORS.network
  }
}
