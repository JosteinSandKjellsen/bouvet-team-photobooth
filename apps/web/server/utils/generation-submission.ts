import { randomBytes, randomUUID } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'
import { db } from './db'
import { reserveGenerationCredits } from './generation-budget'
import { recordGenerationCompletion } from './generation-completion'
import {
  createGenerationSourceUpload,
  GenerationSubmissionOutcomeUnknownError,
  getGenerationCompletion,
  getGeneratedOutput,
  submitGeneration,
  uploadGenerationSource,
} from './generation-provider'
import { getSourceImage, storeGeneratedImage } from './source-storage'
import { isThemeId } from './themes'

const submissionBatchSize = 10
const submissionLeaseMs = 60_000
const completionPollDelayMs = 5_000

export async function runGenerationSubmission(now = new Date()) {
  const provider = process.env.GENERATION_PROVIDER
  if (provider !== 'deterministic' && provider !== 'leonardo') return

  await recoverUncertainSubmissions(now)
  await reconcileSubmittedGenerations(now)

  const owner = randomUUID()
  const jobs = await claimGenerationJobs(owner, now)
  for (const job of jobs) {
    await submitClaimedGeneration(job, owner, now)
  }
}

async function reconcileSubmittedGenerations(now: Date) {
  await recoverReconciliationJobs(now)
  await pollSubmittedGenerations(now)

  const owner = randomUUID()
  const jobs = await claimReconciliationJobs(owner, now)
  for (const job of jobs) {
    await reconcileClaimedGeneration(job, owner, now)
  }
}

async function pollSubmittedGenerations(now: Date) {
  if (process.env.GENERATION_PROVIDER !== 'leonardo') return

  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'RECONCILE_GENERATION',
      nextAttemptAt: { lte: now },
      status: { in: ['FAILED', 'QUEUED'] },
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    select: { aggregateId: true, id: true, status: true },
    take: submissionBatchSize,
  })
  if (jobs.length === 0) return

  const generations = await db.imageGeneration.findMany({
    where: {
      id: { in: jobs.map((job) => job.aggregateId) },
      providerGenerationId: { not: null },
      providerOutputUrl: null,
      status: 'SUBMITTED',
    },
    select: { id: true, providerGenerationId: true },
  })
  const jobsByGenerationId = new Map(jobs.map((job) => [job.aggregateId, job]))
  const nextAttemptAt = new Date(now.getTime() + completionPollDelayMs)

  for (const generation of generations) {
    const job = jobsByGenerationId.get(generation.id)
    if (!job || !generation.providerGenerationId) continue

    let completion: Awaited<ReturnType<typeof getGenerationCompletion>>
    try {
      completion = await getGenerationCompletion(
        generation.providerGenerationId,
      )
    } catch {
      await db.backgroundJob.updateMany({
        where: { id: job.id, status: job.status },
        data: {
          lastErrorCode: 'COMPLETION_POLL_FAILED',
          nextAttemptAt,
        },
      })
      continue
    }

    if (completion.status === 'COMPLETE') {
      await recordGenerationCompletion(
        generation.providerGenerationId,
        completion.providerOutputUrl,
      )
      continue
    }
    if (completion.status === 'PENDING') {
      await db.backgroundJob.updateMany({
        where: { id: job.id, status: job.status },
        data: { lastErrorCode: null, nextAttemptAt },
      })
      continue
    }

    await db.$transaction(async (transaction) => {
      await transaction.backgroundJob.updateMany({
        where: { id: job.id, status: job.status },
        data: {
          completedAt: now,
          lastErrorCode: 'PROVIDER_GENERATION_FAILED',
          status: 'FAILED',
        },
      })
      await transaction.imageGeneration.updateMany({
        where: { id: generation.id, status: 'SUBMITTED' },
        data: { status: 'FAILED' },
      })
    })
  }
}

async function recoverUncertainSubmissions(now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'GENERATE_IMAGE',
      leaseExpiresAt: { lt: now },
      status: 'RUNNING',
    },
    orderBy: { leaseExpiresAt: 'asc' },
    select: { aggregateId: true, id: true },
    take: submissionBatchSize,
  })

  for (const job of jobs) {
    const generation = await db.imageGeneration.findUnique({
      where: { id: job.aggregateId },
      select: { status: true },
    })
    if (
      generation?.status === 'PENDING' ||
      generation?.status === 'READY_TO_SUBMIT'
    ) {
      await db.backgroundJob.updateMany({
        where: { id: job.id, leaseExpiresAt: { lt: now }, status: 'RUNNING' },
        data: {
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt: now,
          status: 'QUEUED',
        },
      })
      continue
    }

    const submissionWasUncertain = generation?.status === 'SUBMITTING'
    await db.$transaction(async (transaction) => {
      const recovered = await transaction.backgroundJob.updateMany({
        where: { id: job.id, leaseExpiresAt: { lt: now }, status: 'RUNNING' },
        data: {
          completedAt: now,
          lastErrorCode: submissionWasUncertain
            ? 'SUBMISSION_OUTCOME_UNKNOWN'
            : 'SOURCE_UPLOAD_OUTCOME_UNKNOWN',
          status: 'FAILED',
        },
      })
      if (recovered.count === 0) return

      await transaction.imageGeneration.updateMany({
        where: {
          id: job.aggregateId,
          status: submissionWasUncertain ? 'SUBMITTING' : 'UPLOADING',
        },
        data: {
          status: submissionWasUncertain ? 'SUBMISSION_UNKNOWN' : 'FAILED',
        },
      })
    })
  }
}

async function claimGenerationJobs(owner: string, now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'GENERATE_IMAGE',
      nextAttemptAt: { lte: now },
      status: 'QUEUED',
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    select: { aggregateId: true, id: true },
    take: submissionBatchSize,
  })
  const leaseExpiresAt = new Date(now.getTime() + submissionLeaseMs)
  const claimed = []
  for (const job of jobs) {
    const result = await db.backgroundJob.updateMany({
      where: { id: job.id, status: 'QUEUED' },
      data: {
        attempt: { increment: 1 },
        leaseExpiresAt,
        leaseOwner: owner,
        status: 'RUNNING',
      },
    })
    if (result.count === 1) claimed.push(job)
  }
  return claimed
}

async function recoverReconciliationJobs(now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'RECONCILE_GENERATION',
      leaseExpiresAt: { lt: now },
      status: 'RUNNING',
    },
    orderBy: { leaseExpiresAt: 'asc' },
    select: { attempt: true, id: true, maxAttempts: true },
    take: submissionBatchSize,
  })

  for (const job of jobs) {
    const exhausted = job.attempt >= job.maxAttempts
    await db.backgroundJob.updateMany({
      where: { id: job.id, leaseExpiresAt: { lt: now }, status: 'RUNNING' },
      data: exhausted
        ? {
            completedAt: now,
            lastErrorCode: 'OUTPUT_INGESTION_FAILED',
            status: 'FAILED',
          }
        : {
            lastErrorCode: 'OUTPUT_INGESTION_FAILED',
            leaseExpiresAt: null,
            leaseOwner: null,
            nextAttemptAt: now,
            status: 'QUEUED',
          },
    })
  }
}

async function claimReconciliationJobs(owner: string, now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'RECONCILE_GENERATION',
      nextAttemptAt: { lte: now },
      status: 'QUEUED',
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    select: { aggregateId: true, attempt: true, id: true, maxAttempts: true },
    take: submissionBatchSize,
  })
  if (jobs.length === 0) return []

  const readyGenerations = await db.imageGeneration.findMany({
    where: {
      id: { in: jobs.map((job) => job.aggregateId) },
      ...(process.env.GENERATION_PROVIDER === 'leonardo'
        ? { providerOutputUrl: { not: null } }
        : {}),
      status: 'SUBMITTED',
    },
    select: { id: true },
  })
  const readyGenerationIds = new Set(
    readyGenerations.map((generation) => generation.id),
  )
  const leaseExpiresAt = new Date(now.getTime() + submissionLeaseMs)
  const claimed = []
  for (const job of jobs) {
    if (!readyGenerationIds.has(job.aggregateId)) continue
    const result = await db.backgroundJob.updateMany({
      where: { id: job.id, status: 'QUEUED' },
      data: {
        attempt: { increment: 1 },
        leaseExpiresAt,
        leaseOwner: owner,
        status: 'RUNNING',
      },
    })
    if (result.count === 1) claimed.push({ ...job, attempt: job.attempt + 1 })
  }
  return claimed
}

async function submitClaimedGeneration(
  job: { aggregateId: string; id: string },
  owner: string,
  now: Date,
) {
  const generation = await db.imageGeneration.findUnique({
    where: { id: job.aggregateId },
    select: {
      providerSourceImageId: true,
      providerSourceUploadedAt: true,
      sourceImage: {
        select: {
          deleteAfter: true,
          session: { select: { themeId: true } },
          status: true,
          storageKey: true,
        },
      },
      status: true,
    },
  })
  if (!generation) return

  const usesLeonardo = process.env.GENERATION_PROVIDER === 'leonardo'
  let generationStatus = generation.status
  if (generationStatus === 'PENDING') {
    const prepared = await db.imageGeneration.updateMany({
      where: { id: job.aggregateId, status: 'PENDING' },
      data: { status: usesLeonardo ? 'UPLOADING' : 'SUBMITTING' },
    })
    if (prepared.count === 0) return
    generationStatus = usesLeonardo ? 'UPLOADING' : 'SUBMITTING'
  } else if (!(usesLeonardo && generationStatus === 'READY_TO_SUBMIT')) {
    return
  }

  const source = generation?.sourceImage
  const themeId = source?.session.themeId
  if (
    !source ||
    source.deleteAfter <= now ||
    source.status !== 'ACTIVE' ||
    !themeId ||
    !isThemeId(themeId)
  ) {
    await failGenerationForUnavailableSource(
      job.id,
      job.aggregateId,
      owner,
      now,
    )
    return
  }

  let sourceImage: Uint8Array | undefined
  if (!usesLeonardo || generationStatus === 'UPLOADING') {
    try {
      sourceImage = await getSourceImage(source.storageKey)
    } catch {
      await failGenerationForUnavailableSource(
        job.id,
        job.aggregateId,
        owner,
        now,
      )
      return
    }
  }

  if (usesLeonardo) {
    const reserved = await reserveGenerationCredits(job.aggregateId, now)
    if (!reserved) {
      await failGenerationForDailyCap(job.id, job.aggregateId, owner, now)
      return
    }
  }

  let providerSourceImageId = generation.providerSourceImageId ?? undefined
  let sourceUploadConfirmed = Boolean(generation.providerSourceUploadedAt)
  if (usesLeonardo && generationStatus === 'UPLOADING') {
    let upload: Awaited<ReturnType<typeof createGenerationSourceUpload>>
    try {
      upload = await createGenerationSourceUpload()
    } catch (error) {
      await failGenerationForSourceUpload(
        job.id,
        job.aggregateId,
        owner,
        now,
        getErrorMessage(error),
      )
      return
    }

    const persisted = await db.imageGeneration.updateMany({
      where: {
        id: job.aggregateId,
        providerSourceImageId: null,
        status: 'UPLOADING',
      },
      data: { providerSourceImageId: upload.providerSourceImageId },
    })
    if (persisted.count === 0) return

    try {
      await uploadGenerationSource(upload, sourceImage as Uint8Array)
    } catch (error) {
      await failGenerationForSourceUpload(
        job.id,
        job.aggregateId,
        owner,
        now,
        getErrorMessage(error),
      )
      return
    }

    const uploaded = await db.imageGeneration.updateMany({
      where: {
        id: job.aggregateId,
        providerSourceImageId: upload.providerSourceImageId,
        status: 'UPLOADING',
      },
      data: {
        providerSourceUploadedAt: new Date(),
        status: 'READY_TO_SUBMIT',
      },
    })
    if (uploaded.count === 0) return
    providerSourceImageId = upload.providerSourceImageId
    sourceUploadConfirmed = true
    generationStatus = 'READY_TO_SUBMIT'
  }

  if (usesLeonardo) {
    if (
      generationStatus !== 'READY_TO_SUBMIT' ||
      !providerSourceImageId ||
      !sourceUploadConfirmed
    ) {
      await failGenerationForSourceUpload(
        job.id,
        job.aggregateId,
        owner,
        now,
        'Generation source upload state is invalid',
      )
      return
    }

    const submitting = await db.imageGeneration.updateMany({
      where: { id: job.aggregateId, status: 'READY_TO_SUBMIT' },
      data: { status: 'SUBMITTING' },
    })
    if (submitting.count === 0) return
  }

  let result: Awaited<ReturnType<typeof submitGeneration>>
  try {
    result = await submitGeneration({
      generationId: job.aggregateId,
      providerSourceImageId,
      themeId,
    })
  } catch (error) {
    if (!(error instanceof GenerationSubmissionOutcomeUnknownError)) throw error

    await quarantineUncertainSubmission(
      job.id,
      job.aggregateId,
      owner,
      now,
      error.message,
    )
    return
  }
  await db.$transaction(async (transaction) => {
    const completed = await transaction.backgroundJob.updateMany({
      where: {
        id: job.id,
        leaseExpiresAt: { gt: now },
        leaseOwner: owner,
        status: 'RUNNING',
      },
      data: {
        completedAt: now,
        leaseExpiresAt: null,
        leaseOwner: null,
        status: 'SUCCEEDED',
      },
    })
    if (completed.count === 0) return

    await transaction.imageGeneration.updateMany({
      where: { id: job.aggregateId, status: 'SUBMITTING' },
      data: {
        providerGenerationId: result.providerGenerationId,
        status: 'SUBMITTED',
      },
    })
    await transaction.backgroundJob.create({
      data: {
        aggregateId: job.aggregateId,
        idempotencyKey: `reconcile-generation:${job.aggregateId}`,
        kind: 'RECONCILE_GENERATION',
      },
    })
  })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Generation source upload failed'
}

async function failGenerationForSourceUpload(
  jobId: string,
  generationId: string,
  owner: string,
  now: Date,
  diagnostic: string,
) {
  const completed = await db.backgroundJob.updateMany({
    where: {
      id: jobId,
      leaseExpiresAt: { gt: now },
      leaseOwner: owner,
      status: 'RUNNING',
    },
    data: {
      completedAt: now,
      lastError: diagnostic,
      lastErrorCode: 'SOURCE_UPLOAD_FAILED',
      leaseExpiresAt: null,
      leaseOwner: null,
      status: 'FAILED',
    },
  })
  if (completed.count === 0) return

  await db.imageGeneration.updateMany({
    where: {
      id: generationId,
      status: { in: ['READY_TO_SUBMIT', 'UPLOADING'] },
    },
    data: { status: 'FAILED' },
  })
}

async function quarantineUncertainSubmission(
  jobId: string,
  generationId: string,
  owner: string,
  now: Date,
  diagnostic: string,
) {
  await db.$transaction(async (transaction) => {
    const quarantined = await transaction.backgroundJob.updateMany({
      where: { id: jobId, leaseOwner: owner, status: 'RUNNING' },
      data: {
        completedAt: now,
        lastError: diagnostic,
        lastErrorCode: 'SUBMISSION_OUTCOME_UNKNOWN',
        leaseExpiresAt: null,
        leaseOwner: null,
        status: 'FAILED',
      },
    })
    if (quarantined.count === 0) return

    await transaction.imageGeneration.updateMany({
      where: { id: generationId, status: 'SUBMITTING' },
      data: { status: 'SUBMISSION_UNKNOWN' },
    })
  })
}

async function failGenerationForDailyCap(
  jobId: string,
  generationId: string,
  owner: string,
  now: Date,
) {
  const completed = await db.backgroundJob.updateMany({
    where: {
      id: jobId,
      leaseExpiresAt: { gt: now },
      leaseOwner: owner,
      status: 'RUNNING',
    },
    data: {
      completedAt: now,
      lastErrorCode: 'DAILY_CREDIT_CAP_EXCEEDED',
      status: 'FAILED',
    },
  })
  if (completed.count === 0) return

  await db.imageGeneration.updateMany({
    where: {
      id: generationId,
      status: { in: ['READY_TO_SUBMIT', 'SUBMITTING', 'UPLOADING'] },
    },
    data: { status: 'FAILED' },
  })
}

async function failGenerationForUnavailableSource(
  jobId: string,
  generationId: string,
  owner: string,
  now: Date,
) {
  const completed = await db.backgroundJob.updateMany({
    where: {
      id: jobId,
      leaseExpiresAt: { gt: now },
      leaseOwner: owner,
      status: 'RUNNING',
    },
    data: {
      completedAt: now,
      lastErrorCode: 'SOURCE_UNAVAILABLE',
      status: 'FAILED',
    },
  })
  if (completed.count === 0) return

  await db.imageGeneration.updateMany({
    where: {
      id: generationId,
      status: { in: ['READY_TO_SUBMIT', 'SUBMITTING', 'UPLOADING'] },
    },
    data: { status: 'FAILED' },
  })
}

async function reconcileClaimedGeneration(
  job: {
    aggregateId: string
    attempt: number
    id: string
    maxAttempts: number
  },
  owner: string,
  now: Date,
) {
  const generation = await db.imageGeneration.findUnique({
    where: { id: job.aggregateId },
    select: {
      providerGenerationId: true,
      providerOutputUrl: true,
      sourceImage: { select: { deleteAfter: true, id: true, status: true } },
      status: true,
    },
  })
  if (
    !generation ||
    generation.status !== 'SUBMITTED' ||
    !generation.providerGenerationId ||
    generation.sourceImage.status !== 'ACTIVE' ||
    generation.sourceImage.deleteAfter <= now
  ) {
    await completeReconciliationJob(job.id, owner, now)
    return
  }

  let output: Awaited<ReturnType<typeof getGeneratedOutput>>
  let metadata: Metadata
  try {
    output = await getGeneratedOutput(
      generation.providerGenerationId,
      generation.providerOutputUrl ?? undefined,
    )
    metadata = await sharp(output.image).metadata()
    if (
      output.contentType !== 'image/jpeg' ||
      !metadata.width ||
      !metadata.height ||
      output.image.byteLength === 0
    ) {
      throw new Error('Invalid generated output')
    }
  } catch {
    await rescheduleReconciliationJob(job, owner, now)
    return
  }

  const image = await db.generatedImage.upsert({
    where: { generationId: job.aggregateId },
    update: {},
    create: {
      byteSize: output.image.byteLength,
      contentType: output.contentType,
      deleteAfter: generation.sourceImage.deleteAfter,
      generationId: job.aggregateId,
      height: metadata.height,
      publicId: randomBytes(32).toString('base64url'),
      storageKey: `generated/${job.aggregateId}.jpg`,
      width: metadata.width,
    },
    select: { id: true, storageKey: true },
  })

  try {
    await storeGeneratedImage(image.storageKey, output.image)
  } catch {
    await rescheduleReconciliationJob(job, owner, now)
    return
  }

  await db.$transaction(async (transaction) => {
    const completed = await transaction.backgroundJob.updateMany({
      where: {
        id: job.id,
        leaseExpiresAt: { gt: now },
        leaseOwner: owner,
        status: 'RUNNING',
      },
      data: {
        completedAt: now,
        leaseExpiresAt: null,
        leaseOwner: null,
        status: 'SUCCEEDED',
      },
    })
    if (completed.count === 0) return

    await transaction.generatedImage.updateMany({
      where: { id: image.id, status: 'PENDING' },
      data: { status: 'ACTIVE' },
    })
    await transaction.imageGeneration.updateMany({
      where: { id: job.aggregateId, status: 'SUBMITTED' },
      data: { status: 'SUCCEEDED' },
    })
    const source = await transaction.sourceImage.updateMany({
      where: { id: generation.sourceImage.id, status: 'ACTIVE' },
      data: { status: 'DELETE_PENDING' },
    })
    if (source.count === 1) {
      await transaction.backgroundJob.create({
        data: {
          aggregateId: generation.sourceImage.id,
          idempotencyKey: `delete-source-image:${generation.sourceImage.id}`,
          kind: 'DELETE_SOURCE_IMAGE',
        },
      })
    }
  })
}

async function completeReconciliationJob(id: string, owner: string, now: Date) {
  await db.backgroundJob.updateMany({
    where: {
      id,
      leaseExpiresAt: { gt: now },
      leaseOwner: owner,
      status: 'RUNNING',
    },
    data: {
      completedAt: now,
      leaseExpiresAt: null,
      leaseOwner: null,
      status: 'SUCCEEDED',
    },
  })
}

async function rescheduleReconciliationJob(
  job: { attempt: number; id: string; maxAttempts: number },
  owner: string,
  now: Date,
) {
  const exhausted = job.attempt >= job.maxAttempts
  await db.backgroundJob.updateMany({
    where: {
      id: job.id,
      leaseExpiresAt: { gt: now },
      leaseOwner: owner,
      status: 'RUNNING',
    },
    data: exhausted
      ? {
          completedAt: now,
          lastErrorCode: 'OUTPUT_INGESTION_FAILED',
          status: 'FAILED',
        }
      : {
          lastErrorCode: 'OUTPUT_INGESTION_FAILED',
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt: now,
          status: 'QUEUED',
        },
  })
}
