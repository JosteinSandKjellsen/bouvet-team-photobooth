import { expect, test } from '@playwright/test'

test('serves the real health contract', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/json')
  expect(await response.json()).toEqual({ status: 'ok' })
})

test('connects to the API without overflow or runtime errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Service status' }),
  ).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Connected')
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByRole('status')).toHaveText('Connected')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('status.png'),
    fullPage: true,
  })
})

test('recovers from an API failure with keyboard retry', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Unavailable' }),
    }),
  )
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Service unavailable')
  await page.unroute('**/api/health')
  const retry = page.getByRole('button', { name: 'Retry connection' })
  await retry.focus()
  await expect(retry).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('Connected')
})
