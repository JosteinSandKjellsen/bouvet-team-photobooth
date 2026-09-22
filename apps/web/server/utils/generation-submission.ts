import { randomUUID } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'
import { db } from './db'
import { reserveGenerationCredits } from './generation-budget'
import { getGeneratedOutput, submitGeneration } from './generation-provider'
import { getSourceImage, storeGeneratedImage } from './source-storage'
import { isThemeId } from './themes'

const submissionBatchSize = 10
const submissionLeaseMs = 60_000

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

  const owner = randomUUID()
  const jobs = await claimReconciliationJobs(owner, now)
  for (const job of jobs) {
    await reconcileClaimedGeneration(job, owner, now)
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
    await db.$transaction(async (transaction) => {
      const recovered = await transaction.backgroundJob.updateMany({
        where: { id: job.id, leaseExpiresAt: { lt: now }, status: 'RUNNING' },
        data: {
          completedAt: now,
          lastErrorCode: 'SUBMISSION_OUTCOME_UNKNOWN',
          status: 'FAILED',
        },
      })
      if (recovered.count === 0) return

      await transaction.imageGeneration.updateMany({
        where: { id: job.aggregateId, status: 'SUBMITTING' },
        data: { status: 'SUBMISSION_UNKNOWN' },
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
    if (result.count === 1) claimed.push({ ...job, attempt: job.attempt + 1 })
  }
  return claimed
}

async function submitClaimedGeneration(
  job: { aggregateId: string; id: string },
  owner: string,
  now: Date,
) {
  const prepared = await db.imageGeneration.updateMany({
    where: { id: job.aggregateId, status: 'PENDING' },
    data: { status: 'SUBMITTING' },
  })
  if (prepared.count === 0) return

  const generation = await db.imageGeneration.findUnique({
    where: { id: job.aggregateId },
    select: {
      sourceImage: {
        select: {
          deleteAfter: true,
          session: { select: { themeId: true } },
          status: true,
          storageKey: true,
        },
      },
    },
  })
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

  let sourceImage: Uint8Array
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

  if (process.env.GENERATION_PROVIDER === 'leonardo') {
    const reserved = await reserveGenerationCredits(job.aggregateId, now)
    if (!reserved) {
      await failGenerationForDailyCap(job.id, job.aggregateId, owner, now)
      return
    }
  }

  const result = await submitGeneration({
    generationId: job.aggregateId,
    sourceImage,
    themeId,
  })
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
    where: { id: generationId, status: 'SUBMITTING' },
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
    where: { id: generationId, status: 'SUBMITTING' },
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
