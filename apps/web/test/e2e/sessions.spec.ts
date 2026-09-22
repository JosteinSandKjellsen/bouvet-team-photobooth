import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { APIRequestContext } from '@playwright/test'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { getTestDb } from './test-db'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

test.skip(!hasTestDatabase, 'requires TEST_DATABASE_URL')

async function uploadSyntheticSource(
  request: APIRequestContext,
  origin: string,
) {
  const created = await request.post('/api/sessions', {
    data: { themeId: 'samurai' },
    headers: { origin },
  })
  const setCookie = created.headers()['set-cookie']
  if (!setCookie) throw new Error('Expected a session cookie')
  const [cookie] = setCookie.split(';', 1)
  if (!cookie) throw new Error('Expected a session cookie value')

  return uploadSyntheticSourceForSession(request, origin, cookie)
}

async function uploadSyntheticSourceForSession(
  request: APIRequestContext,
  origin: string,
  cookie: string,
) {
  const image = await sharp({
    create: { background: 'white', channels: 3, height: 400, width: 400 },
  })
    .jpeg()
    .toBuffer()
  const uploaded = await request.post('/api/sessions/current/capture', {
    headers: { cookie, origin },
    multipart: {
      image: { buffer: image, mimeType: 'image/jpeg', name: 'synthetic.jpg' },
    },
  })
  expect(uploaded.status()).toBe(200)
  const { sourceId } = (await uploaded.json()) as { sourceId: string }
  return sourceId
}

async function sweepCleanup(request: APIRequestContext) {
  const swept = await request.post('/api/internal/source-cleanup', {
    headers: { authorization: 'Bearer test-cleanup-worker-token' },
  })
  expect(swept.status()).toBe(204)
}

async function submitGeneration(request: APIRequestContext) {
  const submitted = await request.post('/api/internal/generation-submission', {
    headers: { authorization: 'Bearer test-cleanup-worker-token' },
  })
  expect(submitted.status()).toBe(204)
}

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

test('queues one generation only for the current session approved source', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'runs once')

  const origin = String(testInfo.project.use.baseURL)

  const withoutSource = await request.post('/api/sessions/current/generate', {
    headers: { origin },
  })
  expect(withoutSource.status()).toBe(401)

  const created = await request.post('/api/sessions', {
    data: { themeId: 'samurai' },
    headers: { origin },
  })
  const setCookie = created.headers()['set-cookie']
  if (!setCookie) throw new Error('Expected a session cookie')
  const [cookie] = setCookie.split(';', 1)
  if (!cookie) throw new Error('Expected a session cookie value')

  const missingSource = await request.post('/api/sessions/current/generate', {
    headers: { cookie, origin },
  })
  expect(missingSource.status()).toBe(409)

  const sourceId = await uploadSyntheticSourceForSession(
    request,
    origin,
    cookie,
  )
  const queued = await request.post('/api/sessions/current/generate', {
    headers: { cookie, origin },
  })
  expect(queued.status()).toBe(202)
  const generation = (await queued.json()) as { jobId: string; status: string }
  expect(generation.status).toBe('pending')
  expect(generation.jobId).toMatch(/^[0-9a-f-]{36}$/)

  const repeated = await request.post('/api/sessions/current/generate', {
    headers: { cookie, origin },
  })
  expect(repeated.status()).toBe(202)
  expect(await repeated.json()).toEqual(generation)

  const database = getTestDb()
  const stored = await database.imageGeneration.findUniqueOrThrow({
    select: { id: true, status: true },
    where: { sourceImageId: sourceId },
  })
  expect(stored).toEqual({ id: generation.jobId, status: 'PENDING' })
  await expect(
    database.backgroundJob.count({
      where: { aggregateId: generation.jobId, kind: 'GENERATE_IMAGE' },
    }),
  ).resolves.toBe(1)

  await submitGeneration(request)
  await expect(
    database.imageGeneration.findUniqueOrThrow({
      select: { providerGenerationId: true, status: true },
      where: { id: generation.jobId },
    }),
  ).resolves.toEqual({
    providerGenerationId: `deterministic-${generation.jobId}`,
    status: 'SUBMITTED',
  })
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

// The BackgroundJob queue is global and unscoped by session, so these cases
// run once (not once per device project) to avoid racing a concurrent sweep
// from the other project for the same claimable rows.
test.describe.serial('scheduled source cleanup', () => {
  test('runs scheduled source cleanup only with its worker token', async ({
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs once')

    const unauthorized = await request.post('/api/internal/source-cleanup')
    expect(unauthorized.status()).toBe(401)

    const authorized = await request.post('/api/internal/source-cleanup', {
      headers: { authorization: 'Bearer test-cleanup-worker-token' },
    })
    expect(authorized.status()).toBe(204)
  })

  test('deletes an expired source and its stored bytes after two sweeps', async ({
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs once')

    const origin = String(testInfo.project.use.baseURL)
    const sourceId = await uploadSyntheticSource(request, origin)

    const db = getTestDb()
    const past = new Date(Date.now() - 1_000)
    await db.sourceImage.update({
      data: { deleteAfter: past },
      where: { id: sourceId },
    })

    // First sweep only enqueues the deletion job for the next sweep to claim.
    await sweepCleanup(request)
    const enqueued = await db.sourceImage.findUniqueOrThrow({
      select: { status: true, storageKey: true },
      where: { id: sourceId },
    })
    expect(enqueued.status).toBe('DELETE_PENDING')
    const storagePath = resolve(
      'test-results/source-storage',
      enqueued.storageKey,
    )
    expect(existsSync(storagePath)).toBe(true)

    const job = await db.backgroundJob.findFirstOrThrow({
      select: { id: true },
      where: { aggregateId: sourceId, kind: 'DELETE_SOURCE_IMAGE' },
    })
    await db.backgroundJob.update({
      data: { nextAttemptAt: past },
      where: { id: job.id },
    })

    await sweepCleanup(request)
    const deleted = await db.sourceImage.findUniqueOrThrow({
      select: { deletedAt: true, status: true },
      where: { id: sourceId },
    })
    expect(deleted.status).toBe('DELETED')
    expect(deleted.deletedAt).not.toBeNull()
    expect(existsSync(storagePath)).toBe(false)
  })

  test('recovers a stale cleanup lease and completes deletion on retry', async ({
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs once')

    const origin = String(testInfo.project.use.baseURL)
    const sourceId = await uploadSyntheticSource(request, origin)

    const db = getTestDb()
    const past = new Date(Date.now() - 1_000)
    await db.sourceImage.update({
      data: { deleteAfter: past, status: 'DELETE_PENDING' },
      where: { id: sourceId },
    })
    const staleJob = await db.backgroundJob.create({
      data: {
        aggregateId: sourceId,
        attempt: 1,
        idempotencyKey: `delete-source-image:${sourceId}`,
        kind: 'DELETE_SOURCE_IMAGE',
        leaseExpiresAt: past,
        leaseOwner: 'crashed-worker',
        status: 'RUNNING',
      },
    })

    // A worker that crashed mid-delete leaves a running job with an expired
    // lease; the next sweep must reclaim it rather than leaving it stuck.
    await sweepCleanup(request)
    const recovered = await db.backgroundJob.findUniqueOrThrow({
      select: { attempt: true, leaseOwner: true, status: true },
      where: { id: staleJob.id },
    })
    expect(recovered.status).toBe('QUEUED')
    expect(recovered.leaseOwner).toBeNull()
    expect(recovered.attempt).toBe(1)

    await db.backgroundJob.update({
      data: { nextAttemptAt: past },
      where: { id: staleJob.id },
    })

    await sweepCleanup(request)
    const completed = await db.backgroundJob.findUniqueOrThrow({
      select: { attempt: true, status: true },
      where: { id: staleJob.id },
    })
    expect(completed.status).toBe('SUCCEEDED')
    expect(completed.attempt).toBe(2)

    const source = await db.sourceImage.findUniqueOrThrow({
      select: { status: true },
      where: { id: sourceId },
    })
    expect(source.status).toBe('DELETED')
  })
})
