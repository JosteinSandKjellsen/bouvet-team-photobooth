import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { db, getSourceImage, reserveGenerationCredits, submitGeneration } =
  vi.hoisted(() => ({
    db: {
      $transaction: vi.fn(),
      backgroundJob: {
        create: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      imageGeneration: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    getSourceImage: vi.fn(),
    reserveGenerationCredits: vi.fn(),
    submitGeneration: vi.fn(),
  }))

vi.mock('../../server/utils/db', () => ({ db }))
vi.mock('../../server/utils/generation-budget', () => ({
  reserveGenerationCredits,
}))
vi.mock('../../server/utils/generation-provider', () => ({ submitGeneration }))
vi.mock('../../server/utils/source-storage', () => ({ getSourceImage }))

const { runGenerationSubmission } =
  await import('../../server/utils/generation-submission')

const now = new Date('2026-09-22T12:00:00.000Z')
const generationId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation((operation) => operation(db))
  db.backgroundJob.create.mockResolvedValue({})
  db.backgroundJob.updateMany.mockResolvedValue({ count: 1 })
  db.imageGeneration.updateMany.mockResolvedValue({ count: 1 })
  getSourceImage.mockResolvedValue(Uint8Array.of(1, 2, 3))
  reserveGenerationCredits.mockResolvedValue(true)
  submitGeneration.mockResolvedValue({ providerGenerationId: 'provider-id' })
})

afterEach(() => {
  delete process.env.GENERATION_PROVIDER
})

describe('runGenerationSubmission', () => {
  it('submits the active stored source with its server-owned theme to Leonardo', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ aggregateId: generationId, id: jobId }])
    db.imageGeneration.findUnique.mockResolvedValue({
      sourceImage: {
        deleteAfter: new Date('2026-09-22T12:30:00.000Z'),
        session: { themeId: 'space-cowboys' },
        status: 'ACTIVE',
        storageKey: 'sources/source.jpg',
      },
    })

    await runGenerationSubmission(now)

    expect(getSourceImage).toHaveBeenCalledWith('sources/source.jpg')
    expect(reserveGenerationCredits).toHaveBeenCalledWith(generationId, now)
    expect(submitGeneration).toHaveBeenCalledWith({
      generationId,
      sourceImage: Uint8Array.of(1, 2, 3),
      themeId: 'space-cowboys',
    })
  })
})
