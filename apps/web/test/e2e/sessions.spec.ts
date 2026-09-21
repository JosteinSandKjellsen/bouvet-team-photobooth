import { expect, test } from '@playwright/test'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

test.skip(!hasTestDatabase, 'requires TEST_DATABASE_URL')

test('creates a private session and keeps its capability out of JSON', async ({
  request,
}, testInfo) => {
  const origin = String(testInfo.project.use.baseURL)
  const created = await request.post('/api/sessions', {
    data: { themeId: 'samurai' },
    headers: { origin },
  })

  expect(created.status()).toBe(201)
  expect(created.headers()['set-cookie']).toContain('HttpOnly')
  expect(created.headers()['set-cookie']).toContain('SameSite=Strict')
  expect(await created.json()).toMatchObject({ themeId: 'samurai' })

  const setCookie = created.headers()['set-cookie']
  if (!setCookie) throw new Error('Expected a session cookie')

  const [cookie] = setCookie.split(';', 1)
  if (!cookie) throw new Error('Expected a session cookie value')

  const current = await request.get('/api/sessions/current', {
    headers: { cookie },
  })
  expect(current.status()).toBe(200)
  expect(await current.json()).toMatchObject({ themeId: 'samurai' })
})

test('rejects forged, invalid, and unauthenticated session requests', async ({
  request,
}, testInfo) => {
  const origin = String(testInfo.project.use.baseURL)

  const forged = await request.post('/api/sessions', {
    data: { themeId: 'samurai' },
    headers: { origin: 'https://attacker.example' },
  })
  expect(forged.status()).toBe(403)

  const invalid = await request.post('/api/sessions', {
    data: { themeId: 'unknown' },
    headers: { origin },
  })
  expect(invalid.status()).toBe(400)

  const current = await request.get('/api/sessions/current')
  expect(current.status()).toBe(401)
})
