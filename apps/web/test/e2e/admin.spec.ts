import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import type { PhotoDeletionResponse } from '@bouvet-team-photobooth/contracts'
import sharp from 'sharp'
import {
  storeGeneratedImage,
  deleteGeneratedImage,
} from '../../server/utils/source-storage'
import { getTestDb } from './test-db'
import { adminTestPassphrase } from './admin-settings'

test.describe.configure({ mode: 'serial' })
test.skip(!process.env.TEST_DATABASE_URL, 'requires isolated TEST_DATABASE_URL')
function assertTestDatabase() {
  const url = process.env.DATABASE_URL
  if (
    !url ||
    url !== process.env.TEST_DATABASE_URL ||
    !new URL(url).pathname.endsWith('_test')
  ) {
    throw new Error('Admin tests require the isolated test database')
  }
}

test.beforeEach(async ({ baseURL }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'global authentication limits run once; phone viewport is covered below',
  )
  assertTestDatabase()
  if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') {
    throw new Error('Admin tests require the local production test server')
  }
  process.env.SOURCE_STORAGE_DRIVER = 'local'
  process.env.SOURCE_STORAGE_DIR = 'test-results/source-storage'
  const buckets = await getTestDb().adminLoginBucket.findMany({
    select: { key: true },
    take: 100,
  })
  await getTestDb().adminLoginBucket.deleteMany({
    where: { key: { in: buckets.map(({ key }) => key) } },
  })
})

const fixtures: {
  generationId: string
  sessionId: string
  publicId: string
  storageKey: string
}[] = []
const sessionHashes: string[] = []
async function photoFixture() {
  const generationId = randomUUID()
  const publicId = randomBytes(32).toString('base64url')
  const storageKey = `admin-test/${generationId}.jpg`
  const image = await sharp({
    create: { width: 400, height: 300, channels: 3, background: 'white' },
  })
    .jpeg()
    .toBuffer()
  const session = await getTestDb().session.create({
    data: {
      themeId: 'samurai',
      capabilityHash: randomUUID(),
      expiresAt: new Date(0),
      sourceImage: {
        create: {
          storageKey: `admin-source/${generationId}.jpg`,
          contentType: 'image/jpeg',
          byteSize: image.byteLength,
          width: 400,
          height: 300,
          status: 'DELETED',
          deleteAfter: new Date(0),
          generation: {
            create: {
              id: generationId,
              idempotencyKey: randomUUID(),
              status: 'SUCCEEDED',
              modelProfileId: 'nano-banana-2-lite-v1',
              providerGenerationId: `deterministic-${generationId}`,
              generatedImage: {
                create: {
                  publicId,
                  storageKey,
                  status: 'ACTIVE',
                  publishedAt: new Date('2099-12-31T12:00:00Z'),
                  deleteAfter: new Date('2100-01-01'),
                  contentType: 'image/jpeg',
                  byteSize: image.byteLength,
                  width: 400,
                  height: 300,
                },
              },
            },
          },
        },
      },
    },
  })
  const fixture = { generationId, sessionId: session.id, publicId, storageKey }
  fixtures.push(fixture)
  await storeGeneratedImage(storageKey, image)
  return fixture
}

test.afterEach(async ({ context }, testInfo) => {
  if (!process.env.TEST_DATABASE_URL || testInfo.project.name !== 'desktop')
    return
  assertTestDatabase()
  const db = getTestDb()
  for (const cookie of await context.cookies()) {
    if (cookie.name === 'photobooth_admin') {
      sessionHashes.push(
        createHash('sha256').update(cookie.value).digest('hex'),
      )
    }
  }
  await db.adminSession.deleteMany({
    where: { capabilityHash: { in: sessionHashes.splice(0) } },
  })
  for (const fixture of fixtures.splice(0)) {
    const deletions = await db.photoDeletion.findMany({
      where: { publicId: fixture.publicId },
      select: { id: true },
    })
    await db.backgroundJob.deleteMany({
      where: {
        kind: 'DELETE_PUBLIC_PHOTO',
        aggregateId: { in: deletions.map(({ id }) => id) },
      },
    })
    await db.photoDeletion.deleteMany({ where: { publicId: fixture.publicId } })
    await db.generatedImage.deleteMany({
      where: { publicId: fixture.publicId },
    })
    await db.imageGeneration.deleteMany({ where: { id: fixture.generationId } })
    await db.sourceImage.deleteMany({ where: { sessionId: fixture.sessionId } })
    await db.session.deleteMany({ where: { id: fixture.sessionId } })
    await deleteGeneratedImage(fixture.storageKey)
  }
})

async function unlock(page: Page) {
  await page.getByTestId('admin-toggle').click()
  await page.getByTestId('admin-passphrase').fill(adminTestPassphrase)
  await page.getByTestId('admin-submit').click()
  await expect(page.getByTestId('admin-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
}

async function login(request: APIRequestContext, origin: string) {
  const pageToken = randomBytes(32).toString('base64url')
  const response = await request.post('/api/admin/session', {
    headers: { origin },
    data: { passphrase: adminTestPassphrase, pageToken },
  })
  expect(response.status()).toBe(200)
  expect(Object.keys(await response.json())).toEqual(['expiresAt'])
  expect(response.headers()['cache-control']).toBe('no-store')
  const cookie = response.headers()['set-cookie']?.split(';')[0]
  if (!cookie) throw new Error('Admin cookie missing')
  sessionHashes.push(
    createHash('sha256')
      .update(cookie.slice('photobooth_admin='.length))
      .digest('hex'),
  )
  expect(response.headers()['set-cookie']).toContain('HttpOnly')
  expect(response.headers()['set-cookie']).toContain('Secure')
  expect(response.headers()['set-cookie']).toContain('SameSite=Strict')
  expect(response.headers()['set-cookie']).not.toContain('Max-Age')
  return { cookie, origin, 'x-admin-page-token': pageToken }
}

test('reveals only the non-secret configured admin availability', async ({
  request,
}) => {
  const availability = await request.get('/api/admin/availability')
  expect(availability.status()).toBe(200)
  expect(availability.headers()['cache-control']).toBe('no-store')
  expect(await availability.json()).toEqual({ enabled: true })
})

test('unlocks, confirms deletion, removes stored bytes and records, and returns to normal mode', async ({
  page,
  request,
}, testInfo) => {
  const photo = await photoFixture()
  const countBefore = await (await request.get('/api/photos/count')).json()
  await page.goto('/overview')
  await expect(page.getByTestId('overview-photo').first()).toHaveAttribute(
    'href',
    `/photo/${photo.publicId}`,
  )
  await expect(page.getByTestId('overview-delete-photo')).toHaveCount(0)
  await page.getByTestId('admin-toggle').click()
  await page.getByTestId('admin-passphrase').fill('incorrect phrase')
  await page.getByTestId('admin-submit').click()
  await expect(page.getByTestId('admin-dialog-error')).toBeVisible()
  await page.getByTestId('admin-passphrase').fill(adminTestPassphrase)
  await page.getByTestId('admin-submit').click()
  await expect(page.getByTestId('admin-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByTestId('overview-delete-photo').first().click()
  await page.getByTestId('admin-cancel').click()
  expect(
    (await request.get(`/api/photos/${photo.publicId}/image`)).status(),
  ).toBe(200)
  expect(
    await getTestDb().generatedImage.count({
      where: { publicId: photo.publicId },
    }),
  ).toBe(1)
  await page.screenshot({
    path: testInfo.outputPath('admin-desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByTestId('overview-delete-photo').first().click()
  await expect(page.getByTestId('admin-dialog')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('admin-phone-confirmation.png'),
    fullPage: true,
  })
  await page.getByTestId('admin-submit').click()
  await expect(page.getByTestId('admin-deletion-status')).toHaveAttribute(
    'data-status',
    'completed',
  )
  for (const suffix of ['', '/image', '/download']) {
    expect(
      (await request.get(`/api/photos/${photo.publicId}${suffix}`)).status(),
    ).toBe(404)
  }
  expect(
    await getTestDb().generatedImage.count({
      where: { publicId: photo.publicId },
    }),
  ).toBe(0)
  expect(
    existsSync(resolve('test-results/source-storage', photo.storageKey)),
  ).toBe(false)
  expect(await (await request.get('/api/photos/count')).json()).toEqual(
    countBefore,
  )
  const callback = await request.post('/api/internal/leonardo-completion', {
    headers: { authorization: 'Bearer test-leonardo-webhook-token' },
    data: {
      type: 'image_generation.complete',
      data: {
        object: {
          id: `deterministic-${photo.generationId}`,
          status: 'COMPLETE',
          images: [{ url: 'https://cdn.leonardo.ai/synthetic.jpg' }],
        },
      },
    },
  })
  expect(callback.status()).toBe(204)
  expect(
    (await request.get(`/api/photos/${photo.publicId}/image`)).status(),
  ).toBe(404)
  await page.getByTestId('admin-toggle').click()
  await expect(page.getByTestId('admin-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.getByTestId('overview-delete-photo')).toHaveCount(0)
})

test('requires the correct session, page token and origin and rejects revoked or expired sessions', async ({
  request,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing test origin')
  const photo = await photoFixture()
  const endpoint = `/api/admin/photos/${photo.publicId}`
  expect(
    (await request.delete(endpoint, { headers: { origin: baseURL } })).status(),
  ).toBe(401)
  const headers = await login(request, baseURL)
  expect(
    (
      await request.delete(endpoint, {
        headers: { cookie: headers.cookie, origin: baseURL },
      })
    ).status(),
  ).toBe(401)
  expect(
    (
      await request.delete(endpoint, {
        headers: { ...headers, origin: 'https://attacker.invalid' },
      })
    ).status(),
  ).toBe(403)
  expect(
    (
      await request.delete(endpoint, {
        headers: {
          ...headers,
          'x-admin-page-token': randomBytes(32).toString('base64url'),
        },
      })
    ).status(),
  ).toBe(401)
  expect(
    (await request.post('/api/admin/session/renew', { headers })).status(),
  ).toBe(200)
  expect(
    (await request.delete('/api/admin/session', { headers })).status(),
  ).toBe(204)
  expect((await request.delete(endpoint, { headers })).status()).toBe(401)
  expect(
    (await request.post('/api/admin/session/renew', { headers })).status(),
  ).toBe(401)
  const expiring = await login(request, baseURL)
  const capability = expiring.cookie.slice('photobooth_admin='.length)
  await getTestDb().adminSession.update({
    where: {
      capabilityHash: createHash('sha256').update(capability).digest('hex'),
    },
    data: { expiresAt: new Date(0) },
  })
  expect((await request.delete(endpoint, { headers: expiring })).status()).toBe(
    401,
  )
  expect(
    (
      await request.post('/api/admin/session/renew', { headers: expiring })
    ).status(),
  ).toBe(401)
  expect(
    (await request.get(`/api/photos/${photo.publicId}/image`)).status(),
  ).toBe(200)
})

test('does not share admin mode with another tab or restore it after leaving or reloading', async ({
  page,
}) => {
  await Promise.all(Array.from({ length: 7 }, () => photoFixture()))
  await page.goto('/overview')
  await unlock(page)
  await page.getByTestId('overview-older').click()
  await expect(page).toHaveURL(/\/overview\?before=/)
  await expect(page.getByTestId('admin-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByTestId('overview-newer').click()
  await expect(page).toHaveURL(/\/overview\?after=/)
  await expect(page.getByTestId('admin-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const another = await page.context().newPage()
  await another.goto('/overview')
  await expect(another.getByTestId('admin-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(another.getByTestId('overview-delete-photo')).toHaveCount(0)
  await another.close()
  await page.getByTestId('overview-photo').first().click()
  await expect(page).toHaveURL(/\/photo\/[A-Za-z0-9_-]+$/)
  await page.goBack()
  await expect(page.getByTestId('admin-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await unlock(page)
  await page.reload()
  await expect(page.getByTestId('admin-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.getByTestId('overview-delete-photo')).toHaveCount(0)
  await unlock(page)
  await page.clock.install()
  await page.clock.fastForward(301_000)
  await expect(page.getByTestId('admin-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.getByTestId('overview-delete-photo')).toHaveCount(0)
})

test('converges duplicate deletions on one operation', async ({
  request,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing test origin')
  const photo = await photoFixture()
  const headers = await login(request, baseURL)
  const responses = await Promise.all(
    [1, 2].map(() =>
      request.delete(`/api/admin/photos/${photo.publicId}`, { headers }),
    ),
  )
  const bodies: PhotoDeletionResponse[] = []
  for (const response of responses) {
    expect([200, 202]).toContain(response.status())
    bodies.push(await response.json())
  }
  expect(bodies[0]?.operationId).toBe(bodies[1]?.operationId)
  const status = await request.get(
    `/api/admin/deletions/${bodies[0]?.operationId}`,
    { headers },
  )
  expect(status.status()).toBe(200)
  expect(await status.json()).toMatchObject({ status: 'completed' })
  expect(
    (
      await request.get(`/api/admin/deletions/${bodies[0]?.operationId}`, {
        headers: { cookie: headers.cookie },
      })
    ).status(),
  ).toBe(401)
  expect(
    await getTestDb().photoDeletion.count({
      where: { publicId: photo.publicId },
    }),
  ).toBe(1)
})

test('bounds login bodies and enforces shared throttling despite spoofed forwarding headers', async ({
  request,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing test origin')
  const oversized = await request.post('/api/admin/session', {
    headers: { origin: baseURL },
    data: {
      passphrase: 'a'.repeat(3_000),
      pageToken: randomBytes(32).toString('base64url'),
    },
  })
  expect(oversized.status()).toBe(413)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post('/api/admin/session', {
      headers: {
        origin: baseURL,
        'x-forwarded-for': `192.0.2.${attempt}`,
        'x-nf-client-connection-ip': `192.0.2.${attempt}`,
      },
      data: {
        passphrase: 'wrong phrase',
        pageToken: randomBytes(32).toString('base64url'),
      },
    })
    expect(response.status()).toBe(401)
  }
  const limited = await request.post('/api/admin/session', {
    headers: { origin: baseURL },
    data: {
      passphrase: adminTestPassphrase,
      pageToken: randomBytes(32).toString('base64url'),
    },
  })
  expect(limited.status()).toBe(429)
  expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0)
})
