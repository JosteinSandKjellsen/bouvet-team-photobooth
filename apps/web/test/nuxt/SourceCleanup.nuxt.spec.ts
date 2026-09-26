import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  db,
  deleteGeneratedImage,
  deleteGenerationSource,
  deleteSourceImage,
  GenerationSourceDeletionError,
} = vi.hoisted(() => {
  class GenerationSourceDeletionError extends Error {
    retryable = false
  }

  return {
    db: {
      $transaction: vi.fn(),
      backgroundJob: {
        create: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      generatedImage: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
      imageGeneration: {
        findUnique: vi.fn(),
      },
      sourceImage: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    deleteGeneratedImage: vi.fn(),
    deleteGenerationSource: vi.fn(),
    deleteSourceImage: vi.fn(),
    GenerationSourceDeletionError,
  }
})

vi.mock('../../server/utils/db', () => ({ db }))
vi.mock('../../server/utils/photo-deletion', () => ({
  runPhotoDeletionCleanup: vi.fn(),
}))
vi.mock('../../server/utils/generation-provider', () => ({
  deleteGenerationSource,
  GenerationSourceDeletionError,
}))
vi.mock('../../server/utils/source-storage', () => ({
  deleteGeneratedImage,
  deleteSourceImage,
}))

const { runExpiredSourceCleanup } =
  await import('../../server/utils/source-cleanup')

const now = new Date('2026-09-21T20:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation((operation) => operation(db))
  db.sourceImage.updateMany.mockResolvedValue({ count: 1 })
  db.generatedImage.findMany.mockResolvedValue([])
  db.generatedImage.updateMany.mockResolvedValue({ count: 1 })
  db.backgroundJob.create.mockResolvedValue({})
  db.backgroundJob.findMany.mockResolvedValue([])
  db.backgroundJob.updateMany.mockResolvedValue({ count: 1 })
  db.imageGeneration.findUnique.mockResolvedValue(null)
  deleteGeneratedImage.mockResolvedValue(undefined)
  deleteGenerationSource.mockResolvedValue(undefined)
  deleteSourceImage.mockResolvedValue(undefined)
})

afterEach(() => {
  delete process.env.GENERATION_PROVIDER
})

describe('runExpiredSourceCleanup', () => {
  it('queues, leases, removes, and tombstones one expired source', async () => {
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          aggregateId: '11111111-1111-4111-8111-111111111111',
          attempt: 0,
          id: '22222222-2222-4222-8222-222222222222',
          maxAttempts: 5,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    db.sourceImage.findMany.mockResolvedValueOnce([
      { id: '11111111-1111-4111-8111-111111111111' },
    ])
    db.sourceImage.findUnique.mockResolvedValueOnce({
      status: 'DELETE_PENDING',
      storageKey: 'sources/expired.jpg',
    })

    await runExpiredSourceCleanup(now)

    expect(db.backgroundJob.create).toHaveBeenCalledWith({
      data: {
        aggregateId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey:
          'delete-source-image:11111111-1111-4111-8111-111111111111',
        kind: 'DELETE_SOURCE_IMAGE',
      },
    })
    expect(deleteSourceImage).toHaveBeenCalledWith('sources/expired.jpg')
    expect(db.sourceImage.updateMany).toHaveBeenLastCalledWith({
      data: { deletedAt: now, status: 'DELETED' },
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        status: 'DELETE_PENDING',
      },
    })
  })

  it('returns an expired lease to the queue before claiming more work', async () => {
    db.backgroundJob.findMany
      .mockResolvedValueOnce([
        {
          attempt: 1,
          id: '22222222-2222-4222-8222-222222222222',
          maxAttempts: 5,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    db.sourceImage.findMany.mockResolvedValueOnce([])

    await runExpiredSourceCleanup(now)

    expect(db.backgroundJob.updateMany).toHaveBeenCalledWith({
      data: {
        leaseExpiresAt: null,
        leaseOwner: null,
        nextAttemptAt: new Date(now.getTime() + 60_000),
        status: 'QUEUED',
      },
      where: {
        id: '22222222-2222-4222-8222-222222222222',
        leaseExpiresAt: { lt: now },
        status: 'RUNNING',
      },
    })
    expect(db.backgroundJob.findMany).toHaveBeenCalledWith({
      orderBy: { leaseExpiresAt: 'asc' },
      select: { attempt: true, id: true, maxAttempts: true },
      take: 25,
      where: {
        kind: 'DELETE_SOURCE_IMAGE',
        leaseExpiresAt: { lt: now },
        status: 'RUNNING',
      },
    })
  })

  it('deletes one confirmed Leonardo source through a leased cleanup job', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          aggregateId: '11111111-1111-4111-8111-111111111111',
          attempt: 0,
          id: '22222222-2222-4222-8222-222222222222',
          maxAttempts: 5,
        },
      ])
    db.sourceImage.findMany.mockResolvedValueOnce([])
    db.imageGeneration.findUnique.mockResolvedValueOnce({
      providerSourceImageId: '33333333-3333-4333-8333-333333333333',
      providerSourceUploadedAt: new Date('2026-09-21T19:00:00.000Z'),
    })

    await runExpiredSourceCleanup(now)

    expect(deleteGenerationSource).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
    )
    expect(db.backgroundJob.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: '22222222-2222-4222-8222-222222222222',
        leaseExpiresAt: { gt: now },
        leaseOwner: expect.any(String),
        status: 'RUNNING',
      },
      data: {
        completedAt: now,
        leaseExpiresAt: null,
        leaseOwner: null,
        status: 'SUCCEEDED',
      },
    })
  })
})
