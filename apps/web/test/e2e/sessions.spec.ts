import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { APIRequestContext } from '@playwright/test'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { reserveGenerationCredits } from '../../server/utils/generation-budget'
import {
  deleteGeneratedImage,
  storeGeneratedImage,
} from '../../server/utils/source-storage'
import { getTestDb } from './test-db'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)
process.env.SOURCE_STORAGE_DIR = 'test-results/source-storage'

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

async function createPublishedGalleryPhoto(publishedAt: Date) {
  const database = getTestDb()
  const generationId = randomUUID()
  const publicId = randomBytes(32).toString('base64url')
  const storageKey = `m6-gallery/${generationId}.jpg`
  const image = await sharp({
    create: { background: 'white', channels: 3, height: 768, width: 1_024 },
  })
    .jpeg()
    .toBuffer()
  const session = await database.session.create({
    data: {
      capabilityHash: randomUUID(),
      expiresAt: new Date('2100-01-01T00:00:00.000Z'),
      themeId: 'samurai',
      sourceImage: {
        create: {
          byteSize: image.byteLength,
          contentType: 'image/jpeg',
          deleteAfter: new Date('2100-01-01T00:00:00.000Z'),
          generation: {
            create: {
              id: generationId,
              idempotencyKey: randomUUID(),
              status: 'SUCCEEDED',
              generatedImage: {
                create: {
                  byteSize: image.byteLength,
                  contentType: 'image/jpeg',
                  deleteAfter: new Date('2100-01-01T00:00:00.000Z'),
                  height: 768,
                  publicId,
                  publishedAt,
                  status: 'ACTIVE',
                  storageKey,
                  width: 1_024,
                },
              },
            },
          },
          height: 768,
          storageKey: `m6-gallery-source/${generationId}.jpg`,
          width: 1_024,
        },
      },
    },
    select: { id: true },
  })
  await storeGeneratedImage(storageKey, image)
  return { generationId, publicId, sessionId: session.id, storageKey }
}

async function removePublishedGalleryFixtures() {
  const database = getTestDb()
  const sources = await database.sourceImage.findMany({
    select: { sessionId: true },
    where: { storageKey: { startsWith: 'm6-gallery-source/' } },
  })
  const images = await database.generatedImage.findMany({
    select: { storageKey: true },
    where: { storageKey: { startsWith: 'm6-gallery/' } },
  })
  await Promise.all(
    images.map((image) => deleteGeneratedImage(image.storageKey)),
  )
  await database.generatedImage.deleteMany({
    where: { storageKey: { startsWith: 'm6-gallery/' } },
  })
  await database.imageGeneration.deleteMany({
    where: {
      sourceImage: { storageKey: { startsWith: 'm6-gallery-source/' } },
    },
  })
  await database.sourceImage.deleteMany({
    where: { storageKey: { startsWith: 'm6-gallery-source/' } },
  })
  await database.session.deleteMany({
    where: { id: { in: sources.map((source) => source.sessionId) } },
  })
}

test('submits an approved browser capture through the private generation flow', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'runs once')

  const mutationRequests: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET') {
      mutationRequests.push(
        `${request.method()} ${new URL(request.url()).pathname}`,
      )
    }
  })

  await page.context().grantPermissions(['camera'])
  await page.goto('/capture/samurai')
  await expect(page.getByTestId('capture-video')).toBeVisible()
  await expect(page.getByTestId('capture-take-photo')).toBeEnabled()
  await page.getByTestId('capture-take-photo').click()
  await expect(page.getByTestId('capture-retake')).toBeVisible({
    timeout: 5_000,
  })
  await page.getByTestId('capture-use-picture').click()

  await expect(page.getByTestId('capture-processing-overlay')).toBeVisible()
  await expect(page.getByTestId('capture-generation-progress')).toHaveAttribute(
    'data-stage',
    'preparing',
  )
  await expect(
    page.getByTestId('capture-generation-progress-label'),
  ).toHaveCount(1)
  await expect(page.getByTestId('capture-back-to-themes')).toBeHidden()
  expect(mutationRequests).toEqual(
    expect.arrayContaining([
      'POST /api/sessions',
      'POST /api/sessions/current/capture',
      'POST /api/sessions/current/generate',
    ]),
  )

  await page.reload()
  await expect(page.getByTestId('capture-generation-progress')).toHaveAttribute(
    'data-stage',
    'preparing',
  )
  await expect(page.getByTestId('capture-back-to-themes')).toBeHidden()
  expect(
    mutationRequests.filter(
      (request) => request === 'POST /api/sessions/current/generate',
    ),
  ).toHaveLength(1)

  await page.goto('/')
  await page.getByTestId('theme-samurai').click()
  await expect(page.getByTestId('capture-video')).toBeVisible()
  await expect(page.getByTestId('capture-generating')).toBeHidden()
  expect(mutationRequests).toContain('POST /api/sessions/current/close')
})

test('atomically caps daily Leonardo reservations at 10000 credits', async ({
  request: _request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'runs once')

  const budgetDay = new Date('2099-01-01T12:00:00.000Z')
  const database = getTestDb()
  await database.generationCreditReservation.deleteMany({
    where: { budgetDay: new Date('2099-01-01T00:00:00.000Z') },
  })
  await database.dailyGenerationBudget.deleteMany({
    where: { day: new Date('2099-01-01T00:00:00.000Z') },
  })
  const reservations = await Promise.all(
    Array.from({ length: 201 }, () =>
      reserveGenerationCredits(randomUUID(), budgetDay),
    ),
  )
  expect(reservations.filter(Boolean)).toHaveLength(200)

  await expect(
    database.dailyGenerationBudget.findUniqueOrThrow({
      select: { reservedCredits: true },
      where: { day: new Date('2099-01-01T00:00:00.000Z') },
    }),
  ).resolves.toEqual({ reservedCredits: 10_000 })
  await expect(
    database.generationCreditReservation.count({
      where: { budgetDay: new Date('2099-01-01T00:00:00.000Z') },
    }),
  ).resolves.toBe(200)
})

function leonardoCompletion(providerGenerationId: string) {
  return {
    data: {
      object: {
        id: providerGenerationId,
        images: [
          {
            url: `https://cdn.leonardo.ai/generations/${providerGenerationId}.jpg`,
          },
        ],
        status: 'COMPLETE',
      },
    },
    type: 'image_generation.complete',
  }
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

  const closed = await request.post('/api/sessions/current/close', {
    headers: { cookie, origin },
  })
  expect(closed.status()).toBe(204)
  expect(closed.headers()['set-cookie']).toContain('Max-Age=0')
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
  page,
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

  const unauthenticatedStatus = await request.get(
    '/api/sessions/current/generation',
  )
  expect(unauthenticatedStatus.status()).toBe(401)

  const pendingStatus = await request.get('/api/sessions/current/generation', {
    headers: { cookie },
  })
  expect(pendingStatus.status()).toBe(200)
  expect(await pendingStatus.json()).toEqual(generation)

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

  const submittedStatus = await request.get(
    '/api/sessions/current/generation',
    { headers: { cookie } },
  )
  expect(submittedStatus.status()).toBe(200)
  expect(await submittedStatus.json()).toEqual({
    jobId: generation.jobId,
    status: 'submitted',
  })

  const unauthorizedCompletion = await request.post(
    '/api/internal/leonardo-completion',
    { data: leonardoCompletion(`deterministic-${generation.jobId}`) },
  )
  expect(unauthorizedCompletion.status()).toBe(401)

  const malformedCompletion = await request.post(
    '/api/internal/leonardo-completion',
    {
      data: { type: 'image_generation.complete' },
      headers: { authorization: 'Bearer test-leonardo-webhook-token' },
    },
  )
  expect(malformedCompletion.status()).toBe(400)

  const completion = leonardoCompletion(`deterministic-${generation.jobId}`)
  const acceptedCompletion = await request.post(
    '/api/internal/leonardo-completion',
    {
      data: completion,
      headers: { authorization: 'Bearer test-leonardo-webhook-token' },
    },
  )
  expect(acceptedCompletion.status()).toBe(204)
  const replayedCompletion = await request.post(
    '/api/internal/leonardo-completion',
    {
      data: completion,
      headers: { authorization: 'Bearer test-leonardo-webhook-token' },
    },
  )
  expect(replayedCompletion.status()).toBe(204)
  await expect(
    database.imageGeneration.findUniqueOrThrow({
      select: { providerOutputUrl: true },
      where: { id: generation.jobId },
    }),
  ).resolves.toEqual({
    providerOutputUrl: `https://cdn.leonardo.ai/generations/deterministic-${generation.jobId}.jpg`,
  })
  await expect(
    database.backgroundJob.count({
      where: {
        aggregateId: generation.jobId,
        kind: 'RECONCILE_GENERATION',
      },
    }),
  ).resolves.toBe(1)

  await submitGeneration(request)
  const generatedImage = await database.generatedImage.findUniqueOrThrow({
    select: {
      byteSize: true,
      deleteAfter: true,
      publishedAt: true,
      publicId: true,
      status: true,
      storageKey: true,
    },
    where: { generationId: generation.jobId },
  })
  expect(generatedImage.status).toBe('ACTIVE')
  expect(generatedImage.publicId).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(generatedImage.publishedAt).not.toBeNull()
  if (!generatedImage.publishedAt) {
    throw new Error('Expected the generated image to be published')
  }
  expect(
    generatedImage.deleteAfter.getTime() - generatedImage.publishedAt.getTime(),
  ).toBe(30 * 24 * 60 * 60 * 1_000)
  const completedCountAfterPublication =
    await database.eventAggregate.findUniqueOrThrow({
      select: { completedPhotoCount: true },
      where: { id: 'current' },
    })
  await submitGeneration(request)
  await expect(
    database.eventAggregate.findUniqueOrThrow({
      select: { completedPhotoCount: true },
      where: { id: 'current' },
    }),
  ).resolves.toEqual(completedCountAfterPublication)
  expect(
    existsSync(
      resolve('test-results/source-storage', generatedImage.storageKey),
    ),
  ).toBe(true)
  await expect(
    database.imageGeneration.findUniqueOrThrow({
      select: { status: true },
      where: { id: generation.jobId },
    }),
  ).resolves.toEqual({ status: 'SUCCEEDED' })
  await expect(
    database.sourceImage.findUniqueOrThrow({
      select: { status: true },
      where: { id: sourceId },
    }),
  ).resolves.toEqual({ status: 'DELETE_PENDING' })

  await sweepCleanup(request)
  await expect(
    database.sourceImage.findUniqueOrThrow({
      select: { status: true },
      where: { id: sourceId },
    }),
  ).resolves.toEqual({ status: 'DELETED' })

  const succeededStatus = await request.get(
    '/api/sessions/current/generation',
    { headers: { cookie } },
  )
  expect(succeededStatus.status()).toBe(200)
  const succeeded = (await succeededStatus.json()) as {
    jobId: string
    resultPath?: string
    status: string
  }
  expect(succeeded).toEqual({
    jobId: generation.jobId,
    resultPath: `/photo/${generatedImage.publicId}`,
    status: 'succeeded',
  })
  expect(succeeded.resultPath).not.toContain(generation.jobId)

  const publicPhoto = await request.get(
    `/api/photos/${generatedImage.publicId}`,
  )
  expect(publicPhoto.status()).toBe(200)
  expect(await publicPhoto.json()).toEqual({
    downloadUrl: `/api/photos/${generatedImage.publicId}/download`,
    height: 768,
    imageUrl: `/api/photos/${generatedImage.publicId}/image`,
    width: 1376,
  })

  const publicImage = await request.get(
    `/api/photos/${generatedImage.publicId}/image`,
  )
  expect(publicImage.status()).toBe(200)
  expect(publicImage.headers()['cache-control']).toBe('no-store')
  expect(publicImage.headers()['content-length']).toBe(
    String(generatedImage.byteSize),
  )
  expect(publicImage.headers()['content-type']).toContain('image/jpeg')
  expect((await publicImage.body()).byteLength).toBe(generatedImage.byteSize)

  const publicDownload = await request.get(
    `/api/photos/${generatedImage.publicId}/download`,
  )
  expect(publicDownload.status()).toBe(200)
  expect(publicDownload.headers()['content-disposition']).toContain(
    'attachment',
  )
  expect((await publicDownload.body()).byteLength).toBe(generatedImage.byteSize)

  await page.goto(`/photo/${generatedImage.publicId}`)
  await expect(page.getByTestId('photo-image')).toBeVisible()
  await expect(page.getByTestId('photo-image')).toHaveAttribute(
    'src',
    `/api/photos/${generatedImage.publicId}/image`,
  )
  await expect(page.getByTestId('photo-download')).toHaveAttribute(
    'href',
    `/api/photos/${generatedImage.publicId}/download`,
  )
  await expect(page.getByTestId('photo-back-to-themes')).toHaveAttribute(
    'href',
    '/',
  )
  await expect(page.getByTestId('photo-qr-code')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  )
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  })
  await page.getByTestId('photo-copy-link').click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${origin}/photo/${generatedImage.publicId}`)
  await page.evaluate(() => {
    window.print = () => document.body.setAttribute('data-printed', 'true')
  })
  await page.getByTestId('photo-print').click()
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'true')

  await database.generatedImage.update({
    data: { deleteAfter: new Date('2000-01-01T00:00:00.000Z') },
    where: { publicId: generatedImage.publicId },
  })
  const expiredPhoto = await request.get(
    `/api/photos/${generatedImage.publicId}`,
  )
  expect(expiredPhoto.status()).toBe(404)
  const expiredImage = await request.get(
    `/api/photos/${generatedImage.publicId}/image`,
  )
  expect(expiredImage.status()).toBe(404)
  const expiredDownload = await request.get(
    `/api/photos/${generatedImage.publicId}/download`,
  )
  expect(expiredDownload.status()).toBe(404)
  await page.reload()
  await expect(page.getByTestId('photo-unavailable')).toBeVisible()
})

test('lists active public photos with stable cursor navigation and keeps the event count after expiry', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'runs once')

  const database = getTestDb()
  await removePublishedGalleryFixtures()
  const countBefore = await database.eventAggregate.findUnique({
    select: { completedPhotoCount: true },
    where: { id: 'current' },
  })
  const photos = await Promise.all(
    Array.from({ length: 7 }, () =>
      createPublishedGalleryPhoto(new Date('2099-01-01T12:00:00.000Z')),
    ),
  )
  await database.eventAggregate.upsert({
    where: { id: 'current' },
    update: { completedPhotoCount: { increment: photos.length } },
    create: { completedPhotoCount: photos.length, id: 'current' },
  })

  const publicIds = new Set(photos.map((photo) => photo.publicId))
  const firstPageResponse = await request.get('/api/photos/recent')
  expect(firstPageResponse.status()).toBe(200)
  const firstPage = (await firstPageResponse.json()) as {
    completedCount: number
    newerCursor?: string
    olderCursor?: string
    photos: Array<{ imageUrl: string; publicId: string }>
  }
  expect(firstPage.completedCount).toBe(
    (countBefore?.completedPhotoCount ?? 0) + photos.length,
  )
  expect(firstPage.photos).toHaveLength(6)
  expect(firstPage.photos.every((photo) => publicIds.has(photo.publicId))).toBe(
    true,
  )
  expect(new Set(firstPage.photos.map((photo) => photo.publicId)).size).toBe(6)
  expect(firstPage.photos[0]?.imageUrl).toBe(
    `/api/photos/${firstPage.photos[0]?.publicId}/image`,
  )
  expect(firstPage.newerCursor).toBeUndefined()
  expect(firstPage.olderCursor).toBeTruthy()
  const olderCursor = firstPage.olderCursor
  if (!olderCursor) throw new Error('Expected an older-page cursor')

  const olderPageResponse = await request.get('/api/photos/recent', {
    params: { before: olderCursor },
  })
  expect(olderPageResponse.status()).toBe(200)
  const olderPage = (await olderPageResponse.json()) as {
    newerCursor?: string
    olderCursor?: string
    photos: Array<{ publicId: string }>
  }
  expect(olderPage.photos.length).toBeGreaterThan(0)
  expect(olderPage.photos.length).toBeLessThanOrEqual(6)
  expect(olderPage.photos.some((photo) => publicIds.has(photo.publicId))).toBe(
    true,
  )
  expect(
    olderPage.photos.some(
      (photo) =>
        publicIds.has(photo.publicId) &&
        firstPage.photos.some(
          (firstPagePhoto) => firstPagePhoto.publicId === photo.publicId,
        ),
    ),
  ).toBe(false)
  expect(olderPage.newerCursor).toBeTruthy()
  const newerCursor = olderPage.newerCursor
  if (!newerCursor) throw new Error('Expected a newer-page cursor')

  const newerPageResponse = await request.get('/api/photos/recent', {
    params: { after: newerCursor },
  })
  expect(newerPageResponse.status()).toBe(200)
  expect(
    (
      (await newerPageResponse.json()) as {
        photos: Array<{ publicId: string }>
      }
    ).photos.map((photo) => photo.publicId),
  ).toEqual(firstPage.photos.map((photo) => photo.publicId))

  await page.goto('/overview')
  await expect(page.getByTestId('overview-grid')).toBeVisible()
  await expect(page.getByTestId('overview-photo')).toHaveCount(6)
  await expect(page.getByTestId('overview-count')).toBeVisible()
  const [galleryBounds, countBounds] = await Promise.all([
    page.getByTestId('overview-grid').boundingBox(),
    page.getByTestId('overview-count').boundingBox(),
  ])
  expect(galleryBounds).not.toBeNull()
  expect(countBounds).not.toBeNull()
  if (!galleryBounds || !countBounds) {
    throw new Error('Expected visible overview layout bounds')
  }
  expect(countBounds.y).toBeCloseTo(galleryBounds.y, 1)
  expect(countBounds.y + countBounds.height).toBeCloseTo(
    galleryBounds.y + galleryBounds.height,
    1,
  )

  await database.generatedImage.updateMany({
    data: { deleteAfter: new Date('2000-01-01T00:00:00.000Z') },
    where: { publicId: { in: photos.map((photo) => photo.publicId) } },
  })
  const countAfterExpiry = await request.get('/api/photos/count')
  expect(countAfterExpiry.status()).toBe(200)
  expect(await countAfterExpiry.json()).toEqual({
    completedCount: (countBefore?.completedPhotoCount ?? 0) + photos.length,
  })

  await removePublishedGalleryFixtures()
})

test('requeues only confirmed retryable generation failures', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'runs once')

  const origin = String(testInfo.project.use.baseURL)
  const created = await request.post('/api/sessions', {
    data: { themeId: 'samurai' },
    headers: { origin },
  })
  const setCookie = created.headers()['set-cookie']
  if (!setCookie) throw new Error('Expected a session cookie')
  const [cookie] = setCookie.split(';', 1)
  if (!cookie) throw new Error('Expected a session cookie value')

  const sourceId = await uploadSyntheticSourceForSession(
    request,
    origin,
    cookie,
  )
  const generated = await request.post('/api/sessions/current/generate', {
    headers: { cookie, origin },
  })
  expect(generated.status()).toBe(202)
  const generation = (await generated.json()) as { jobId: string }

  const database = getTestDb()
  await database.imageGeneration.update({
    data: { status: 'FAILED' },
    where: { id: generation.jobId },
  })
  await database.backgroundJob.updateMany({
    data: {
      completedAt: new Date(),
      lastErrorCode: 'PROVIDER_REJECTED',
      status: 'FAILED',
    },
    where: { aggregateId: generation.jobId, kind: 'GENERATE_IMAGE' },
  })

  const retried = await request.post('/api/sessions/current/retry', {
    headers: { cookie, origin },
  })
  expect(retried.status()).toBe(202)
  expect(await retried.json()).toEqual({
    jobId: generation.jobId,
    status: 'pending',
  })
  await expect(
    database.imageGeneration.findUniqueOrThrow({
      select: { status: true },
      where: { id: generation.jobId },
    }),
  ).resolves.toEqual({ status: 'PENDING' })
  await expect(
    database.backgroundJob.findFirstOrThrow({
      select: { lastErrorCode: true, status: true },
      where: { aggregateId: generation.jobId, kind: 'GENERATE_IMAGE' },
    }),
  ).resolves.toEqual({ lastErrorCode: null, status: 'QUEUED' })

  await database.imageGeneration.update({
    data: { status: 'FAILED' },
    where: { id: generation.jobId },
  })
  await database.backgroundJob.updateMany({
    data: { lastErrorCode: 'SUBMISSION_OUTCOME_UNKNOWN', status: 'FAILED' },
    where: { aggregateId: generation.jobId, kind: 'GENERATE_IMAGE' },
  })
  const uncertain = await request.post('/api/sessions/current/retry', {
    headers: { cookie, origin },
  })
  expect(uncertain.status()).toBe(409)

  await database.backgroundJob.updateMany({
    data: { lastErrorCode: 'PROVIDER_REJECTED' },
    where: { aggregateId: generation.jobId, kind: 'GENERATE_IMAGE' },
  })
  await database.sourceImage.update({
    data: { deleteAfter: new Date(Date.now() - 1_000) },
    where: { id: sourceId },
  })
  const expired = await request.post('/api/sessions/current/retry', {
    headers: { cookie, origin },
  })
  expect(expired.status()).toBe(409)
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
