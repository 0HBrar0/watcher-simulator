import { expect, test } from '@playwright/test'

test('dragging during a flight does not stop it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse flow')
  await page.goto('./')
  await page.getByRole('button', { name: 'Skip intro' }).dispatchEvent('click')
  const eyes = page.getByRole('button', { name: 'His eyes' })
  await eyes.click()
  await page.mouse.move(200, 300)
  await page.mouse.down()
  await page.mouse.move(420, 360, { steps: 8 })
  await page.mouse.move(180, 240, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.pov--on')).toHaveCount(1, { timeout: 45_000 })
})
