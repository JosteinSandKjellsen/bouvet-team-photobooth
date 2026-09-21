import { expect, test } from '@playwright/test'

test('serves the real health contract', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/json')
  expect(await response.json()).toEqual({ status: 'ok' })
})

test('serves the nine public theme descriptors', async ({ request }) => {
  const response = await request.get('/api/themes')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({
    themes: [
      { id: 'wasteland', image: '/themes/wasteland.svg' },
      { id: 'treehouse', image: '/themes/treehouse.svg' },
      { id: 'block-world', image: '/themes/block-world.svg' },
      { id: 'space-cowboys', image: '/themes/space-cowboys.svg' },
      { id: 'life-simulation', image: '/themes/life-simulation.svg' },
      { id: 'mech-pilots', image: '/themes/mech-pilots.svg' },
      { id: 'kids-on-bikes', image: '/themes/kids-on-bikes.svg' },
      { id: 'red-carpet', image: '/themes/red-carpet.svg' },
      { id: 'samurai', image: '/themes/samurai.svg' },
    ],
  })
})

test('selects a Norwegian theme and handles an invalid capture route', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const themeButtons = page.getByTestId(/^theme-/)
  await expect(themeButtons).toHaveCount(9)
  await page.getByTestId('theme-wasteland').click()
  await expect(page).toHaveURL('/capture/wasteland')
  await expect(page.getByTestId('capture-activate-camera')).toBeVisible()
  await page.goto('/capture/unknown')
  await expect(page.getByTestId('capture-invalid-theme')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('themes.png'),
    fullPage: true,
  })
})

test('captures and approves a local image without uploading it', async ({
  page,
}) => {
  const mutationRequests: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET') {
      mutationRequests.push(`${request.method()} ${request.url()}`)
    }
  })

  await page.goto('/capture/samurai')
  await page.getByTestId('capture-activate-camera').click()
  await expect(page.getByTestId('capture-video')).toBeVisible()
  await expect(page.getByTestId('capture-take-photo')).toBeEnabled()
  await page.getByTestId('capture-take-photo').click()
  await expect(page.getByTestId('capture-retake')).toBeVisible({
    timeout: 5_000,
  })
  await page.getByTestId('capture-use-picture').click()
  await expect(page.getByTestId('capture-approved')).toBeVisible()
  expect(mutationRequests).toEqual([])
})
