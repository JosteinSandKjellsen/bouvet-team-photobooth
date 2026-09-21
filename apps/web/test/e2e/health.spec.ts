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
  await expect(
    page.getByRole('heading', {
      name: 'Hvilket univers passer teamet deres?',
    }),
  ).toBeVisible()
  const continueButton = page.getByRole('button', { name: 'Fortsett' })
  await expect(continueButton).toBeDisabled()
  await expect(page.getByRole('radio')).toHaveCount(9)
  await page
    .getByRole('radio', { name: /Ødemark etter katastrofen/ })
    .check({ force: true })
  await expect(continueButton).toBeEnabled()
  await continueButton.click()
  await expect(page).toHaveURL('/capture/wasteland')
  await expect(
    page.getByRole('heading', { name: 'Gjør dere klare til bildet' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Aktiver kamera' }),
  ).toBeVisible()
  await page.goto('/capture/unknown')
  await expect(
    page.getByRole('heading', { name: 'Dette universet finnes ikke.' }),
  ).toBeVisible()
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
  await page.getByRole('button', { name: 'Aktiver kamera' }).click()
  await expect(page.locator('video')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ta bilde' })).toBeEnabled()
  await page.getByRole('button', { name: 'Ta bilde' }).click()
  await expect(
    page.getByRole('button', { name: 'Ta bildet igjen' }),
  ).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: 'Bruk bildet' }).click()

  await expect(
    page.getByText(
      'Bildet er godkjent. Det blir ikke lastet opp før neste del av løsningen er klar.',
    ),
  ).toBeVisible()
  expect(mutationRequests).toEqual([])
})
