import { expect, test } from '@playwright/test'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

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
      { id: 'space-cowboys', image: '/themes/space-cowboys.jpg' },
      { id: 'treehouse', image: '/themes/treehouse.jpg' },
      { id: 'block-world', image: '/themes/block-world.jpg' },
      { id: 'wasteland', image: '/themes/wasteland.jpg' },
      { id: 'life-simulation', image: '/themes/life-simulation.jpg' },
      { id: 'mech-pilots', image: '/themes/mech-pilots.jpg' },
      { id: 'kids-on-bikes', image: '/themes/kids-on-bikes.jpg' },
      { id: 'red-carpet', image: '/themes/red-carpet.jpg' },
      { id: 'samurai', image: '/themes/samurai.jpg' },
    ],
  })
})

test('blocks private capture mutations until explicitly enabled', async ({
  request,
}, testInfo) => {
  test.skip(hasTestDatabase, 'the database suite enables synthetic capture')
  const headers = { origin: String(testInfo.project.use.baseURL) }

  for (const path of [
    '/api/sessions/current/capture',
    '/api/sessions/current/generate',
    '/api/sessions/current/retry',
  ]) {
    const response = await request.post(path, { headers })
    expect(response.status()).toBe(503)
  }
})

test('selects a Norwegian theme and handles an invalid capture route', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const themeButtons = page.getByTestId(/^theme-/)
  await expect(themeButtons).toHaveCount(9)
  const afterTheFall = page.getByTestId('theme-wasteland')
  await expect(afterTheFall.locator('img')).toHaveAttribute(
    'src',
    '/themes/wasteland.jpg',
  )
  const spaceCowboys = page.getByTestId('theme-space-cowboys')
  await expect(spaceCowboys.locator('img')).toHaveAttribute(
    'src',
    '/themes/space-cowboys.jpg',
  )
  const mechPilots = page.getByTestId('theme-mech-pilots')
  await expect(mechPilots.locator('img')).toHaveAttribute(
    'src',
    '/themes/mech-pilots.jpg',
  )
  const productionReady = page.getByTestId('theme-red-carpet')
  await expect(productionReady.locator('img')).toHaveAttribute(
    'src',
    '/themes/red-carpet.jpg',
  )
  await spaceCowboys.click()
  await expect(page).toHaveURL('/capture/space-cowboys')
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
