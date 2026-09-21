import { expect, test } from '@playwright/test'
import sharp from 'sharp'

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

test('runs scheduled source cleanup only with its worker token', async ({
  request,
}) => {
  const unauthorized = await request.post('/api/internal/source-cleanup')
  expect(unauthorized.status()).toBe(401)

  const authorized = await request.post('/api/internal/source-cleanup', {
    headers: { authorization: 'Bearer test-cleanup-worker-token' },
  })
  expect(authorized.status()).toBe(204)
})

test('stores one normalized source privately for the current session', async ({
  request,
}, testInfo) => {
  const origin = String(testInfo.project.use.baseURL)
  const created = await request.post('/api/sessions', {
    data: { themeId: 'samurai' },
    headers: { origin },
  })
  const setCookie = created.headers()['set-cookie']
  if (!setCookie) throw new Error('Expected a session cookie')

  const [cookie] = setCookie.split(';', 1)
  if (!cookie) throw new Error('Expected a session cookie value')

  const image = await sharp({
    create: {
      background: { b: 30, g: 90, r: 180 },
      channels: 3,
      height: 900,
      width: 1200,
    },
  })
    .png()
    .toBuffer()
  const uploaded = await request.post('/api/sessions/current/capture', {
    headers: { cookie, origin },
    multipart: {
      image: {
        buffer: image,
        mimeType: 'image/png',
        name: 'synthetic.png',
      },
    },
  })

  expect(uploaded.status()).toBe(200)
  const source = await uploaded.json()
  expect(source).toMatchObject({
    height: 900,
    mimeType: 'image/jpeg',
    width: 1200,
  })
  expect(source).not.toHaveProperty('storageKey')
  expect(source).not.toHaveProperty('providerSourceId')

  const repeated = await request.post('/api/sessions/current/capture', {
    headers: { cookie, origin },
    multipart: {
      image: {
        buffer: image,
        mimeType: 'image/png',
        name: 'synthetic.png',
      },
    },
  })
  expect(repeated.status()).toBe(200)
  expect(await repeated.json()).toEqual(source)
})

test('rejects source uploads without a private same-origin session', async ({
  request,
}, testInfo) => {
  const image = await sharp({
    create: { background: 'white', channels: 3, height: 800, width: 800 },
  })
    .jpeg()
    .toBuffer()
  const multipart = {
    image: {
      buffer: image,
      mimeType: 'image/jpeg',
      name: 'synthetic.jpg',
    },
  }

  const unauthenticated = await request.post('/api/sessions/current/capture', {
    headers: { origin: String(testInfo.project.use.baseURL) },
    multipart,
  })
  expect(unauthenticated.status()).toBe(401)

  const forged = await request.post('/api/sessions/current/capture', {
    headers: { origin: 'https://attacker.example' },
    multipart,
  })
  expect(forged.status()).toBe(403)
})

test('rejects corrupt and oversized source bytes', async ({
  request,
}, testInfo) => {
  const origin = String(testInfo.project.use.baseURL)
  const created = await request.post('/api/sessions', {
    data: { themeId: 'samurai' },
    headers: { origin },
  })
  const setCookie = created.headers()['set-cookie']
  if (!setCookie) throw new Error('Expected a session cookie')

  const [cookie] = setCookie.split(';', 1)
  if (!cookie) throw new Error('Expected a session cookie value')

  const corrupt = await request.post('/api/sessions/current/capture', {
    headers: { cookie, origin },
    multipart: {
      image: {
        buffer: Buffer.from('not an image'),
        mimeType: 'image/jpeg',
        name: 'spoofed.jpg',
      },
    },
  })
  expect(corrupt.status()).toBe(400)

  const createdSecondSession = await request.post('/api/sessions', {
    data: { themeId: 'samurai' },
    headers: { origin },
  })
  const secondSetCookie = createdSecondSession.headers()['set-cookie']
  if (!secondSetCookie) throw new Error('Expected a session cookie')

  const [secondCookie] = secondSetCookie.split(';', 1)
  if (!secondCookie) throw new Error('Expected a session cookie value')

  const oversized = await request.post('/api/sessions/current/capture', {
    headers: { cookie: secondCookie, origin },
    multipart: {
      image: {
        buffer: Buffer.alloc(4_000_001),
        mimeType: 'image/jpeg',
        name: 'oversized.jpg',
      },
    },
  })
  expect(oversized.status()).toBe(400)
})
