import { expect, test, type Page } from '@playwright/test'

const layer = (page: Page) => page.locator('.real-earth')
const leftLoader = (page: Page) => page.locator('#loader').waitFor({ state: 'detached', timeout: 170_000 })

async function arriveAtEarth(page: Page) {
  await page.goto('./?world=earth')
  await leftLoader(page)
}

test('the loading screen comes first, then leaves', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('#loader svg')).toBeAttached()
  await leftLoader(page)
  await expect(page.locator('body.ready')).toBeAttached()
})

test('the normal site does not download the map', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (r) => asked.push(r.url()))
  await page.goto('./')
  await leftLoader(page)
  expect(asked.filter((url) => /eox\.at|openfreemap\.org/.test(url))).toEqual([])
})

test('the free services being down leaves you on the universe\'s Earth', async ({ page }) => {
  await page.route(/eox\.at|openfreemap\.org/, (route) => route.abort())
  await arriveAtEarth(page)
  await expect(page.getByRole('button', { name: 'Go down to Earth' })).toHaveCount(0)
  await expect(layer(page)).toHaveAttribute('data-phase', 'off')
})

test('goes down to Earth and back to space', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop')
  await arriveAtEarth(page)
  const down = page.getByRole('button', { name: 'Go down to Earth' })
  await down.click({ timeout: 120_000 }) // the flight there is very slow on a software GPU
  await expect(layer(page)).toHaveAttribute('data-phase', 'on', { timeout: 15_000 })
  await expect(page.getByText('Copernicus Sentinel data')).toBeAttached()
  await page.getByRole('button', { name: 'Back to space' }).click()
  await expect(layer(page)).toHaveAttribute('data-phase', 'off')
  await expect(down).toBeVisible({ timeout: 15_000 })
})
