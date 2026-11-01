import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LeaveAWord } from '../src/interface/LeaveAWord'

const answer = (status: number, body: object) => new Response(JSON.stringify(body), { status })

function openPanel() {
  render(<LeaveAWord />)
  fireEvent.click(screen.getByRole('button', { name: 'Leave a word' }))
}

beforeEach(() => { vi.stubEnv('VITE_UPLINK_URL', 'https://service.test') })

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  delete window.turnstile
})

describe('keys', () => {
  it('keeps every key from the camera and shortcuts, and Escape closes', () => {
    const outside = vi.fn()
    window.addEventListener('keydown', outside)
    openPanel()
    fireEvent.keyDown(screen.getByLabelText('Your words'), { key: 'w' })
    expect(outside).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByLabelText('Your words'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(outside).not.toHaveBeenCalled()
    window.removeEventListener('keydown', outside)
  })
})

describe('human check', () => {
  const refused = { success: false, error: 'RATE_LIMITED', retryAfter: 50, challenge: true }

  it('runs after a refusal and resends by itself with the token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key')
    const renderCheck = vi.fn((_host: HTMLElement, options: Record<string, unknown>) => {
      queueMicrotask(() => (options.callback as (token: string) => void)('tok'))
      return 'widget'
    })
    window.turnstile = { render: renderCheck, remove: vi.fn() }
    const post = vi.fn<typeof fetch>().mockResolvedValueOnce(answer(429, refused)).mockResolvedValueOnce(answer(200, { success: true }))
    vi.stubGlobal('fetch', post)
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Leave it' }))
    await screen.findByText('It has been heard.')
    expect(renderCheck.mock.calls[0][1].sitekey).toBe('site-key')
    expect(JSON.parse(post.mock.calls[0][1]?.body as string).turnstileToken).toBeUndefined()
    expect(JSON.parse(post.mock.calls[1][1]?.body as string).turnstileToken).toBe('tok')
  })

  it('falls back to the wait message without a site key', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(answer(429, refused)))
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Leave it' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many words'))
  })

  it('falls back to the wait message when the check cannot load', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key')
    window.turnstile = {
      render: (_host, options) => {
        queueMicrotask(() => (options['error-callback'] as () => void)())
        return 'widget'
      },
      remove: vi.fn(),
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(answer(429, refused)))
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Leave it' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many words'))
  })
})

describe('without a service', () => {
  it('keeps the words and says it cannot reach the creator', async () => {
    vi.stubEnv('VITE_UPLINK_URL', '')
    const post = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', post)
    openPanel()
    fireEvent.change(screen.getByLabelText('Your words'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Leave it' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('cannot reach'))
    expect(screen.getByLabelText('Your words')).toHaveValue('Hello')
    expect(post).not.toHaveBeenCalled()
  })
})
