import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const ok = { status: 200, contentType: 'application/json', body: '{"success":true,"message":"RECEIVED"}' }

/** Records every call to the service, answering with `reply`. */
async function serve(page: Page, reply: (body: Record<string, string>) => Parameters<Route['fulfill']>[0] | 'drop' = () => ok) {
  const calls: Array<Record<string, string>> = []
  await page.route('**/api/uplink', async (route) => {
    const body = route.request().postDataJSON()
    calls.push(body)
    const answer = reply(body)
    await (answer === 'drop' ? route.abort() : route.fulfill(answer))
  })
  return calls
}

const opener = (page: Page) => page.getByRole('button', { name: 'Leave a word' })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Leave a word' })
const send = (page: Page) => page.getByRole('button', { name: 'Leave it' })

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('#loader')).toHaveCount(0, { timeout: 170000 })
  await expect(opener(page)).toHaveCount(1)
})

test('no request until send', async ({ page }) => {
  const calls = await serve(page)
  await opener(page).click()
  await page.getByLabel('Your words').fill('typing is not sending')
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(panel(page)).toHaveCount(0)
  expect(calls).toEqual([])
})

test('a blank note is delivered and confirmed', async ({ page }) => {
  const calls = await serve(page)
  await opener(page).click()
  await send(page).click()
  await expect(page.getByRole('status').filter({ hasText: 'heard' })).toBeVisible()
  expect(calls).toEqual([{ message: '', contactMethod: 'none', contact: '', website: '' }])
})

test('a bad email stays local, and a failure keeps the words for a retry', async ({ page }) => {
  let down = true
  const calls = await serve(page, () => (down ? 'drop' : ok))
  await opener(page).click()
  await page.getByLabel('Your words').fill('Hello')
  await page.getByRole('button', { name: 'Email' }).click()
  const contact = page.getByLabel('Your email')
  await contact.fill('nope')
  await send(page).click()
  await expect(page.getByRole('alert')).toContainText('check what you wrote')
  expect(calls).toEqual([])

  await contact.fill('visitor@example.com')
  await send(page).click()
  await expect(page.getByRole('alert')).toContainText('did not carry')
  await expect(page.getByLabel('Your words')).toHaveValue('Hello')
  await expect(contact).toHaveValue('visitor@example.com')

  down = false
  await send(page).click()
  await expect(page.getByRole('status').filter({ hasText: 'heard' })).toBeVisible()
  expect(calls.at(-1)).toEqual({ message: 'Hello', contactMethod: 'email', contact: 'visitor@example.com', website: '' })
})

test('service answers become clear messages', async ({ page }) => {
  const answers: Array<[number, string]> = [[429, 'Too many words'], [403, 'could not be accepted'], [502, 'cannot reach']]
  let turn = 0
  await serve(page, () => ({ status: answers[turn][0], contentType: 'application/json', body: '{"success":false,"error":"X","retryAfter":60}' }))
  await opener(page).click()
  for (; turn < answers.length; turn += 1) {
    await send(page).click()
    await expect(page.getByRole('alert')).toContainText(answers[turn][1])
  }
})

test('works by keyboard, keeps focus inside, and leaves the camera alone', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow')
  await opener(page).focus()
  await page.keyboard.press('Enter')
  await expect(panel(page)).toBeVisible()
  await expect(page.getByLabel('Your words')).toBeFocused()
  await page.keyboard.type('hm wasd ?')
  await expect(page.getByLabel('Your words')).toHaveValue('hm wasd ?')
  await expect(page.locator('.hud--hidden')).toHaveCount(0)
  await expect(page.locator('.keys--open')).toHaveCount(0)
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('.word') && (document.activeElement as HTMLInputElement).name !== 'website')).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(opener(page)).toBeFocused()
})

test('clicking outside closes it and keeps the draft', async ({ page }) => {
  await opener(page).click()
  await page.getByLabel('Your words').fill('Draft')
  await page.mouse.click(5, 300)
  await expect(panel(page)).toHaveCount(0)
  await opener(page).click()
  await expect(page.getByLabel('Your words')).toHaveValue('Draft')
})

test('fits the screen and passes accessibility checks', async ({ page }) => {
  await opener(page).click()
  await expect(panel(page)).toBeVisible()
  await page.waitForTimeout(800)
  const size = page.viewportSize()!
  const box = (await panel(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(size.width)
  expect(box.y + box.height).toBeLessThanOrEqual(size.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const { violations } = await new AxeBuilder({ page }).include('.word').analyze()
  expect(violations).toEqual([])
})

test('reduced motion stills it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await opener(page).click()
  const duration = await panel(page).evaluate((el) => parseFloat(getComputedStyle(el).animationDuration))
  expect(duration).toBeLessThan(0.01)
})
