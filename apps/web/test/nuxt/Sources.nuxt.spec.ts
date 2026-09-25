import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nanoBananaModelProfileId } from '../../server/utils/generation-models'

const { db } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    backgroundJob: { create: vi.fn() },
    imageGeneration: { create: vi.fn(), findUnique: vi.fn() },
    sourceImage: { findFirst: vi.fn() },
  },
}))

vi.mock('../../server/utils/db', () => ({ db }))

const { createGenerationForSource } = await import('../../server/utils/sources')

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation((operation) => operation(db))
  db.imageGeneration.create.mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
  })
  db.imageGeneration.findUnique.mockResolvedValue(null)
  db.backgroundJob.create.mockResolvedValue({})
  db.sourceImage.findFirst.mockResolvedValue({
    id: '22222222-2222-4222-8222-222222222222',
    session: { themeId: 'samurai' },
  })
})

describe('createGenerationForSource', () => {
  it('pins the selected theme model profile before enqueuing the generation', async () => {
    await createGenerationForSource('33333333-3333-4333-8333-333333333333')

    expect(db.imageGeneration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modelProfileId: nanoBananaModelProfileId,
        }),
      }),
    )
  })
})
