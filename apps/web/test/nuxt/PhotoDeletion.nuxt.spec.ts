import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { db, removeBytes, removeProvider } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    adminSession: { findMany: vi.fn(), deleteMany: vi.fn() },
    adminLoginBucket: { findMany: vi.fn(), deleteMany: vi.fn() },
    photoDeletion: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    backgroundJob: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    generatedImage: { deleteMany: vi.fn() },
    imageGeneration: { updateMany: vi.fn() },
  },
  removeBytes: vi.fn(),
  removeProvider: vi.fn(),
}))
vi.mock('../../server/utils/db', () => ({ db }))
vi.mock('../../server/utils/source-storage', () => ({
  deleteGeneratedImage: removeBytes,
}))
vi.mock('../../server/utils/generation-provider', async (original) => ({
  ...(await original<
    typeof import('../../server/utils/generation-provider')
  >()),
  deleteLeonardoGeneration: removeProvider,
}))
const { isDeletableProviderGenerationId, runPhotoDeletionCleanup } =
  await import('../../server/utils/photo-deletion')
const { GenerationDeletionError } =
  await import('../../server/utils/generation-provider')

const deletion = {
  id: 'deletion',
  imageId: 'image',
  generationId: 'generation',
  publicId: 'public',
  providerGenerationId: '11111111-1111-4111-8111-111111111111',
  storageKey: 'private/generated.jpg',
  localDeletedAt: null,
  providerDeletedAt: null,
  providerDeleteStartedAt: null,
}
const job = { id: 'job', aggregateId: 'deletion', attempt: 0, maxAttempts: 5 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  db.$transaction.mockImplementation((action) => action(db))
  db.adminSession.findMany.mockResolvedValue([])
  db.adminLoginBucket.findMany.mockResolvedValue([])
  db.photoDeletion.findMany.mockResolvedValue([])
  db.backgroundJob.findMany.mockResolvedValue([])
  db.backgroundJob.findFirst.mockResolvedValue(job)
  db.backgroundJob.updateMany.mockResolvedValue({ count: 1 })
  db.photoDeletion.findUniqueOrThrow.mockResolvedValue(deletion)
  db.photoDeletion.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => vi.restoreAllMocks())

describe('durable photo deletion', () => {
  it('accepts canonical Leonardo UUIDs regardless of their RFC version', () => {
    expect(
      isDeletableProviderGenerationId(
        '11111111-1111-4111-8111-111111111111',
        deletion.generationId,
      ),
    ).toBe(true)
    expect(
      isDeletableProviderGenerationId(
        '11111111-1111-6111-8111-111111111111',
        deletion.generationId,
      ),
    ).toBe(true)
    expect(
      isDeletableProviderGenerationId(
        '11111111-1111-9111-8111-111111111111',
        deletion.generationId,
      ),
    ).toBe(false)
    expect(
      isDeletableProviderGenerationId(
        `deterministic-${deletion.generationId}`,
        deletion.generationId,
      ),
    ).toBe(true)
  })

  it('removes stored bytes and provider output before removing the image record', async () => {
    await runPhotoDeletionCleanup()
    expect(removeBytes).toHaveBeenCalledWith(deletion.storageKey)
    expect(removeProvider).toHaveBeenCalledWith(deletion.providerGenerationId)
    expect(db.generatedImage.deleteMany).toHaveBeenCalledWith({
      where: {
        id: deletion.imageId,
        status: { in: ['DELETE_PENDING', 'DELETED'] },
      },
    })
    expect(db.photoDeletion.update).toHaveBeenCalledWith({
      where: { id: deletion.id },
      data: {
        completedAt: expect.any(Date),
        storageKey: null,
        providerGenerationId: null,
      },
    })
    expect(db.imageGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: deletion.generationId, status: 'SUCCEEDED' },
      data: { providerOutputUrl: null },
    })
  })

  it('keeps the hidden record and provider reference after an uncertain remote outcome', async () => {
    removeProvider.mockRejectedValueOnce(
      new GenerationDeletionError('Unconfirmed outcome'),
    )
    await runPhotoDeletionCleanup()
    expect(db.generatedImage.deleteMany).not.toHaveBeenCalled()
    expect(db.backgroundJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'PROVIDER_DELETE_UNCONFIRMED',
        }),
      }),
    )
  })

  it('retries storage failures without calling Leonardo', async () => {
    removeBytes.mockRejectedValueOnce(new Error('Storage unavailable'))
    await runPhotoDeletionCleanup()
    expect(removeProvider).not.toHaveBeenCalled()
    expect(db.generatedImage.deleteMany).not.toHaveBeenCalled()
    expect(db.backgroundJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'QUEUED' }),
      }),
    )
  })

  it('releases the remote-start marker only for a confirmed retryable rejection', async () => {
    removeProvider.mockRejectedValueOnce(
      new GenerationDeletionError('Rate limited', true),
    )
    await runPhotoDeletionCleanup()
    expect(db.photoDeletion.update).toHaveBeenCalledWith({
      where: { id: deletion.id },
      data: { providerDeleteStartedAt: null },
    })
    expect(db.backgroundJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'QUEUED' }),
      }),
    )
  })

  it('does not repeat a provider call after a crash during remote deletion', async () => {
    db.backgroundJob.findMany.mockResolvedValueOnce([job])
    db.photoDeletion.findUnique.mockResolvedValue({
      ...deletion,
      providerDeleteStartedAt: new Date(),
    })
    db.backgroundJob.findFirst.mockResolvedValue(null)
    await runPhotoDeletionCleanup()
    expect(removeProvider).not.toHaveBeenCalled()
    expect(db.backgroundJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'PROVIDER_DELETE_UNCONFIRMED',
        }),
      }),
    )
  })

  it('resumes confirmed cleanup without repeating external operations', async () => {
    db.photoDeletion.findUniqueOrThrow.mockResolvedValue({
      ...deletion,
      providerDeletedAt: new Date(),
      localDeletedAt: new Date(),
    })
    await runPhotoDeletionCleanup()
    expect(removeBytes).not.toHaveBeenCalled()
    expect(removeProvider).not.toHaveBeenCalled()
    expect(db.generatedImage.deleteMany).toHaveBeenCalled()
  })

  it('does not call the provider when another worker already started it', async () => {
    db.photoDeletion.updateMany.mockResolvedValue({ count: 0 })
    await runPhotoDeletionCleanup()
    expect(removeProvider).not.toHaveBeenCalled()
    expect(db.generatedImage.deleteMany).not.toHaveBeenCalled()
  })

  it('does not finalize database deletion after losing its lease', async () => {
    db.backgroundJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    await runPhotoDeletionCleanup()
    expect(db.generatedImage.deleteMany).not.toHaveBeenCalled()
  })
})
