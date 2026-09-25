import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentGenerationModelProfileId } from '../../server/utils/generation-models'

const {
  createGenerationSourceUpload,
  db,
  GenerationSubmissionOutcomeUnknownError,
  getGenerationCompletion,
  getGeneratedOutput,
  getSourceImage,
  reserveGenerationCredits,
  storeGeneratedImage,
  submitGeneration,
  uploadGenerationSource,
} = vi.hoisted(() => {
  class GenerationSubmissionOutcomeUnknownError extends Error {}

  return {
    createGenerationSourceUpload: vi.fn(),
    db: {
      $transaction: vi.fn(),
      backgroundJob: {
        create: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        updateMany: vi.fn(),
      },
      imageGeneration: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    GenerationSubmissionOutcomeUnknownError,
    getGenerationCompletion: vi.fn(),
    getGeneratedOutput: vi.fn(),
    getSourceImage: vi.fn(),
    reserveGenerationCredits: vi.fn(),
    storeGeneratedImage: vi.fn(),
    submitGeneration: vi.fn(),
    uploadGenerationSource: vi.fn(),
  }
})

vi.mock('../../server/utils/db', () => ({ db }))
vi.mock('../../server/utils/generation-budget', () => ({
  reserveGenerationCredits,
}))
vi.mock('../../server/utils/generation-provider', () => ({
  createGenerationSourceUpload,
  GenerationSubmissionOutcomeUnknownError,
  getGenerationCompletion,
  getGeneratedOutput,
  submitGeneration,
  uploadGenerationSource,
}))
vi.mock('../../server/utils/source-storage', () => ({
  getSourceImage,
  storeGeneratedImage,
}))

const [{ recordGenerationCompletion }, { runGenerationSubmission }] =
  await Promise.all([
    import('../../server/utils/generation-completion'),
    import('../../server/utils/generation-submission'),
  ])

const now = new Date('2026-09-22T12:00:00.000Z')
const generationId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation((operation) => operation(db))
  db.backgroundJob.create.mockResolvedValue({})
  db.backgroundJob.upsert.mockResolvedValue({})
  db.backgroundJob.updateMany.mockResolvedValue({ count: 1 })
  db.imageGeneration.findMany.mockResolvedValue([])
  db.imageGeneration.update.mockResolvedValue({})
  db.imageGeneration.updateMany.mockResolvedValue({ count: 1 })
  getGenerationCompletion.mockResolvedValue({ status: 'PENDING' })
  getGeneratedOutput.mockRejectedValue(new Error('Output is unavailable'))
  getSourceImage.mockResolvedValue(Uint8Array.of(1, 2, 3))
  reserveGenerationCredits.mockResolvedValue(true)
  storeGeneratedImage.mockResolvedValue(undefined)
  submitGeneration.mockResolvedValue({ providerGenerationId: 'provider-id' })
  createGenerationSourceUpload.mockResolvedValue({
    fields: { key: 'source-key' },
    providerSourceImageId: 'source-id',
    uploadUrl: 'https://uploads.example/source',
  })
  uploadGenerationSource.mockResolvedValue(undefined)
})

afterEach(() => {
  delete process.env.GENERATION_PROVIDER
})

describe('runGenerationSubmission', () => {
  it('polls without consuming an ingestion attempt before completion', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          aggregateId: generationId,
          attempt: 0,
          id: jobId,
          maxAttempts: 5,
          status: 'QUEUED',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    db.imageGeneration.findMany.mockResolvedValueOnce([
      { id: generationId, providerGenerationId: 'provider-id' },
    ])

    await runGenerationSubmission(now)

    expect(db.imageGeneration.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [generationId] },
        providerGenerationId: { not: null },
        providerOutputUrl: null,
        status: 'SUBMITTED',
      },
      select: {
        id: true,
        providerGenerationId: true,
        providerSourceImageId: true,
        providerSourceUploadedAt: true,
      },
    })
    expect(getGenerationCompletion).toHaveBeenCalledWith('provider-id')
    expect(db.backgroundJob.updateMany).toHaveBeenCalledWith({
      where: { id: jobId, status: 'QUEUED' },
      data: {
        lastErrorCode: null,
        nextAttemptAt: new Date('2026-09-22T12:00:05.000Z'),
      },
    })
  })

  it('enqueues provider cleanup after a confirmed terminal provider failure', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    getGenerationCompletion.mockResolvedValue({ status: 'FAILED' })
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { aggregateId: generationId, id: jobId, status: 'QUEUED' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    db.imageGeneration.findMany.mockResolvedValueOnce([
      {
        id: generationId,
        providerGenerationId: 'provider-id',
        providerSourceImageId: 'source-id',
        providerSourceUploadedAt: new Date('2026-09-22T11:00:00.000Z'),
      },
    ])

    await runGenerationSubmission(now)

    expect(db.backgroundJob.upsert).toHaveBeenCalledWith({
      where: {
        idempotencyKey: `delete-provider-source-image:${generationId}`,
      },
      update: {},
      create: {
        aggregateId: generationId,
        idempotencyKey: `delete-provider-source-image:${generationId}`,
        kind: 'DELETE_PROVIDER_SOURCE_IMAGE',
      },
    })
  })

  it('enqueues provider cleanup after recovering an exhausted reconciliation lease', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          aggregateId: generationId,
          attempt: 5,
          id: jobId,
          maxAttempts: 5,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    db.imageGeneration.findUnique.mockResolvedValueOnce({
      providerSourceImageId: 'source-id',
      providerSourceUploadedAt: new Date('2026-09-22T11:00:00.000Z'),
      status: 'SUBMITTED',
    })

    await runGenerationSubmission(now)

    expect(db.backgroundJob.upsert).toHaveBeenCalledWith({
      where: {
        idempotencyKey: `delete-provider-source-image:${generationId}`,
      },
      update: {},
      create: {
        aggregateId: generationId,
        idempotencyKey: `delete-provider-source-image:${generationId}`,
        kind: 'DELETE_PROVIDER_SOURCE_IMAGE',
      },
    })
  })

  it('enqueues provider cleanup after exhausted output ingestion', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          aggregateId: generationId,
          attempt: 4,
          id: jobId,
          maxAttempts: 5,
        },
      ])
      .mockResolvedValueOnce([])
    db.imageGeneration.findMany.mockResolvedValueOnce([{ id: generationId }])
    db.imageGeneration.findUnique
      .mockResolvedValueOnce({
        providerGenerationId: 'provider-id',
        providerOutputUrl:
          'https://cdn.leonardo.ai/generations/provider-id.jpg',
        providerSourceImageId: 'source-id',
        providerSourceUploadedAt: new Date('2026-09-22T11:00:00.000Z'),
        sourceImage: {
          deleteAfter: new Date('2026-09-22T12:30:00.000Z'),
          id: '33333333-3333-4333-8333-333333333333',
          status: 'ACTIVE',
        },
        status: 'SUBMITTED',
      })
      .mockResolvedValueOnce({
        providerSourceImageId: 'source-id',
        providerSourceUploadedAt: new Date('2026-09-22T11:00:00.000Z'),
        status: 'SUBMITTED',
      })

    await runGenerationSubmission(now)

    expect(db.backgroundJob.upsert).toHaveBeenCalledWith({
      where: {
        idempotencyKey: `delete-provider-source-image:${generationId}`,
      },
      update: {},
      create: {
        aggregateId: generationId,
        idempotencyKey: `delete-provider-source-image:${generationId}`,
        kind: 'DELETE_PROVIDER_SOURCE_IMAGE',
      },
    })
  })

  it('submits the active stored source with its server-owned theme to Leonardo', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ aggregateId: generationId, id: jobId }])
    db.imageGeneration.findUnique.mockResolvedValue({
      modelProfileId: currentGenerationModelProfileId,
      providerSourceImageId: null,
      providerSourceUploadedAt: null,
      sourceImage: {
        deleteAfter: new Date('2026-09-22T12:30:00.000Z'),
        session: { themeId: 'space-cowboys' },
        status: 'ACTIVE',
        storageKey: 'sources/source.jpg',
      },
      status: 'PENDING',
    })

    await runGenerationSubmission(now)

    expect(getSourceImage).toHaveBeenCalledWith('sources/source.jpg')
    expect(createGenerationSourceUpload).toHaveBeenCalledOnce()
    expect(uploadGenerationSource).toHaveBeenCalledWith(
      {
        fields: { key: 'source-key' },
        providerSourceImageId: 'source-id',
        uploadUrl: 'https://uploads.example/source',
      },
      Uint8Array.of(1, 2, 3),
    )
    expect(reserveGenerationCredits).toHaveBeenCalledWith(generationId, 50, now)
    expect(submitGeneration).toHaveBeenCalledWith({
      generationId,
      modelProfileId: currentGenerationModelProfileId,
      providerSourceImageId: 'source-id',
      themeId: 'space-cowboys',
    })
  })

  it('resumes a confirmed source upload without uploading it again', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ aggregateId: generationId, id: jobId }])
    db.imageGeneration.findUnique.mockResolvedValue({
      modelProfileId: currentGenerationModelProfileId,
      providerSourceImageId: 'persisted-source-id',
      providerSourceUploadedAt: new Date('2026-09-22T11:59:00.000Z'),
      sourceImage: {
        deleteAfter: new Date('2026-09-22T12:30:00.000Z'),
        session: { themeId: 'space-cowboys' },
        status: 'ACTIVE',
        storageKey: 'sources/source.jpg',
      },
      status: 'READY_TO_SUBMIT',
    })

    await runGenerationSubmission(now)

    expect(getSourceImage).not.toHaveBeenCalled()
    expect(createGenerationSourceUpload).not.toHaveBeenCalled()
    expect(uploadGenerationSource).not.toHaveBeenCalled()
    expect(submitGeneration).toHaveBeenCalledWith({
      generationId,
      modelProfileId: currentGenerationModelProfileId,
      providerSourceImageId: 'persisted-source-id',
      themeId: 'space-cowboys',
    })
  })

  it('requeues a stale job when its source upload was confirmed', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    db.backgroundJob.findMany
      .mockResolvedValueOnce([{ aggregateId: generationId, id: jobId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    db.imageGeneration.findUnique.mockResolvedValue({
      status: 'READY_TO_SUBMIT',
    })

    await runGenerationSubmission(now)

    expect(db.backgroundJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: jobId,
        leaseExpiresAt: { lt: now },
        status: 'RUNNING',
      },
      data: {
        leaseExpiresAt: null,
        leaseOwner: null,
        nextAttemptAt: now,
        status: 'QUEUED',
      },
    })
    expect(createGenerationSourceUpload).not.toHaveBeenCalled()
    expect(uploadGenerationSource).not.toHaveBeenCalled()
    expect(submitGeneration).not.toHaveBeenCalled()
  })

  it('fails the job without submitting when the source upload fails', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    uploadGenerationSource.mockRejectedValue(
      new Error('Generation source upload outcome is unknown'),
    )
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ aggregateId: generationId, id: jobId }])
    db.imageGeneration.findUnique.mockResolvedValue({
      modelProfileId: currentGenerationModelProfileId,
      providerSourceImageId: null,
      providerSourceUploadedAt: null,
      sourceImage: {
        deleteAfter: new Date('2026-09-22T12:30:00.000Z'),
        session: { themeId: 'space-cowboys' },
        status: 'ACTIVE',
        storageKey: 'sources/source.jpg',
      },
      status: 'PENDING',
    })

    await runGenerationSubmission(now)

    expect(submitGeneration).not.toHaveBeenCalled()
    expect(db.backgroundJob.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: jobId,
        leaseExpiresAt: { gt: now },
        leaseOwner: expect.any(String),
        status: 'RUNNING',
      },
      data: {
        completedAt: now,
        lastError: 'Generation source upload outcome is unknown',
        lastErrorCode: 'SOURCE_UPLOAD_FAILED',
        leaseExpiresAt: null,
        leaseOwner: null,
        status: 'FAILED',
      },
    })
  })

  it('fails without submitting when the persisted model profile is unavailable', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ aggregateId: generationId, id: jobId }])
    db.imageGeneration.findUnique.mockResolvedValue({
      modelProfileId: 'retired-profile',
      providerSourceImageId: null,
      providerSourceUploadedAt: null,
      sourceImage: {
        deleteAfter: new Date('2026-09-22T12:30:00.000Z'),
        session: { themeId: 'space-cowboys' },
        status: 'ACTIVE',
        storageKey: 'sources/source.jpg',
      },
      status: 'PENDING',
    })

    await runGenerationSubmission(now)

    expect(reserveGenerationCredits).not.toHaveBeenCalled()
    expect(submitGeneration).not.toHaveBeenCalled()
    expect(db.backgroundJob.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: jobId,
        leaseExpiresAt: { gt: now },
        leaseOwner: expect.any(String),
        status: 'RUNNING',
      },
      data: {
        completedAt: now,
        lastErrorCode: 'MODEL_PROFILE_UNAVAILABLE',
        status: 'FAILED',
      },
    })
  })

  it('quarantines an uncertain provider response without failing the sweep', async () => {
    process.env.GENERATION_PROVIDER = 'leonardo'
    const diagnostic =
      'Invalid generation provider response (requestId=request-id)'
    submitGeneration.mockRejectedValue(
      new GenerationSubmissionOutcomeUnknownError(diagnostic),
    )
    db.backgroundJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ aggregateId: generationId, id: jobId }])
    db.imageGeneration.findUnique.mockResolvedValue({
      modelProfileId: currentGenerationModelProfileId,
      providerSourceImageId: null,
      providerSourceUploadedAt: null,
      sourceImage: {
        deleteAfter: new Date('2026-09-22T12:30:00.000Z'),
        session: { themeId: 'space-cowboys' },
        status: 'ACTIVE',
        storageKey: 'sources/source.jpg',
      },
      status: 'PENDING',
    })

    await expect(runGenerationSubmission(now)).resolves.toBeUndefined()

    expect(db.backgroundJob.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: jobId,
        leaseOwner: expect.any(String),
        status: 'RUNNING',
      },
      data: {
        completedAt: now,
        lastError: diagnostic,
        lastErrorCode: 'SUBMISSION_OUTCOME_UNKNOWN',
        leaseExpiresAt: null,
        leaseOwner: null,
        status: 'FAILED',
      },
    })
    expect(db.imageGeneration.updateMany).toHaveBeenLastCalledWith({
      where: { id: generationId, status: 'SUBMITTING' },
      data: { status: 'SUBMISSION_UNKNOWN' },
    })
    expect(db.backgroundJob.upsert).not.toHaveBeenCalled()
  })
})

describe('recordGenerationCompletion', () => {
  it('revives a failed reconciliation job without replaying generation', async () => {
    db.imageGeneration.findUnique.mockResolvedValue({
      id: generationId,
      providerOutputUrl: null,
      status: 'SUBMITTED',
    })

    await recordGenerationCompletion(
      'provider-id',
      'https://cdn.leonardo.ai/generations/provider-id.jpg',
    )

    expect(db.backgroundJob.updateMany).toHaveBeenCalledWith({
      where: {
        idempotencyKey: `reconcile-generation:${generationId}`,
        status: 'FAILED',
      },
      data: {
        attempt: 0,
        completedAt: null,
        lastError: null,
        lastErrorCode: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        status: 'QUEUED',
      },
    })
  })

  it('does not revive an exhausted download after completion was recorded', async () => {
    db.imageGeneration.findUnique.mockResolvedValue({
      id: generationId,
      providerOutputUrl: 'https://cdn.leonardo.ai/generations/provider-id.jpg',
      status: 'SUBMITTED',
    })

    await recordGenerationCompletion(
      'provider-id',
      'https://cdn.leonardo.ai/generations/provider-id.jpg',
    )

    expect(db.backgroundJob.updateMany).not.toHaveBeenCalled()
  })
})
