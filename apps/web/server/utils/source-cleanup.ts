import { randomUUID } from 'node:crypto'
import { db } from './db'
import {
  deleteGenerationSource,
  GenerationSourceDeletionError,
} from './generation-provider'
import { logJobFailure } from './job-logging'
import { deleteGeneratedImage, deleteSourceImage } from './source-storage'
import { runPhotoDeletionCleanup } from './photo-deletion'

const cleanupBatchSize = 25
const cleanupLeaseMs = 60_000
const retryDelayMs = 60_000

export async function runExpiredSourceCleanup(now = new Date()) {
  await runPhotoDeletionCleanup(now)
  await recoverExpiredSourceCleanupJobs(now)
  await enqueueExpiredSourceCleanupJobs(now)
  await recoverExpiredGeneratedImageCleanupJobs(now)
  await enqueueExpiredGeneratedImageCleanupJobs(now)
  await recoverExpiredProviderSourceCleanupJobs(now)

  const owner = randomUUID()
  const jobs = await claimSourceCleanupJobs(owner, now)
  for (const job of jobs) {
    await deleteExpiredSourceImage(job, owner, now)
  }

  const generatedImageJobs = await claimGeneratedImageCleanupJobs(owner, now)
  for (const job of generatedImageJobs) {
    await deleteExpiredGeneratedImage(job, owner, now)
  }

  const providerSourceJobs = await claimProviderSourceCleanupJobs(owner, now)
  for (const job of providerSourceJobs) {
    await deleteProviderSourceImage(job, owner, now)
  }
}

export async function enqueueSourceCleanup(sourceId: string) {
  await db.$transaction(async (transaction) => {
    const changed = await transaction.sourceImage.updateMany({
      where: { id: sourceId, status: 'ACTIVE' },
      data: { status: 'DELETE_PENDING' },
    })
    if (changed.count === 0) return

    await transaction.backgroundJob.create({
      data: {
        aggregateId: sourceId,
        idempotencyKey: `delete-source-image:${sourceId}`,
        kind: 'DELETE_SOURCE_IMAGE',
      },
    })
  })
}

async function enqueueExpiredSourceCleanupJobs(now: Date) {
  const sources = await db.sourceImage.findMany({
    where: { deleteAfter: { lte: now }, status: 'ACTIVE' },
    orderBy: { deleteAfter: 'asc' },
    select: { id: true },
    take: cleanupBatchSize,
  })

  for (const source of sources) {
    await enqueueSourceCleanup(source.id)
  }
}

async function enqueueExpiredGeneratedImageCleanupJobs(now: Date) {
  const images = await db.generatedImage.findMany({
    where: { deleteAfter: { lte: now }, status: 'ACTIVE' },
    orderBy: { deleteAfter: 'asc' },
    select: { id: true },
    take: cleanupBatchSize,
  })

  for (const image of images) {
    await db.$transaction(async (transaction) => {
      const changed = await transaction.generatedImage.updateMany({
        where: { id: image.id, status: 'ACTIVE' },
        data: { status: 'DELETE_PENDING' },
      })
      if (changed.count === 0) return

      await transaction.backgroundJob.create({
        data: {
          aggregateId: image.id,
          idempotencyKey: `delete-generated-image:${image.id}`,
          kind: 'DELETE_GENERATED_IMAGE',
        },
      })
    })
  }
}

async function recoverExpiredSourceCleanupJobs(now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'DELETE_SOURCE_IMAGE',
      leaseExpiresAt: { lt: now },
      status: 'RUNNING',
    },
    orderBy: { leaseExpiresAt: 'asc' },
    select: { attempt: true, id: true, maxAttempts: true },
    take: cleanupBatchSize,
  })

  for (const job of jobs) {
    const exhausted = job.attempt >= job.maxAttempts
    await db.backgroundJob.updateMany({
      where: { id: job.id, leaseExpiresAt: { lt: now }, status: 'RUNNING' },
      data: exhausted
        ? { completedAt: now, status: 'FAILED' }
        : {
            leaseExpiresAt: null,
            leaseOwner: null,
            nextAttemptAt: new Date(now.getTime() + retryDelayMs),
            status: 'QUEUED',
          },
    })
  }
}

async function recoverExpiredGeneratedImageCleanupJobs(now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'DELETE_GENERATED_IMAGE',
      leaseExpiresAt: { lt: now },
      status: 'RUNNING',
    },
    orderBy: { leaseExpiresAt: 'asc' },
    select: { attempt: true, id: true, maxAttempts: true },
    take: cleanupBatchSize,
  })

  for (const job of jobs) {
    await rescheduleCleanupJob(
      job,
      undefined,
      now,
      'GENERATED_IMAGE_DELETE_FAILED',
    )
  }
}

async function recoverExpiredProviderSourceCleanupJobs(now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'DELETE_PROVIDER_SOURCE_IMAGE',
      leaseExpiresAt: { lt: now },
      status: 'RUNNING',
    },
    orderBy: { leaseExpiresAt: 'asc' },
    select: { id: true },
    take: cleanupBatchSize,
  })

  for (const job of jobs) {
    await db.backgroundJob.updateMany({
      where: { id: job.id, leaseExpiresAt: { lt: now }, status: 'RUNNING' },
      data: {
        completedAt: now,
        lastErrorCode: 'PROVIDER_SOURCE_DELETE_OUTCOME_UNKNOWN',
        status: 'FAILED',
      },
    })
  }
}

async function claimSourceCleanupJobs(owner: string, now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'DELETE_SOURCE_IMAGE',
      nextAttemptAt: { lte: now },
      status: 'QUEUED',
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    select: { aggregateId: true, attempt: true, id: true, maxAttempts: true },
    take: cleanupBatchSize,
  })
  const leaseExpiresAt = new Date(now.getTime() + cleanupLeaseMs)

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

async function claimGeneratedImageCleanupJobs(owner: string, now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'DELETE_GENERATED_IMAGE',
      nextAttemptAt: { lte: now },
      status: 'QUEUED',
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    select: { aggregateId: true, attempt: true, id: true, maxAttempts: true },
    take: cleanupBatchSize,
  })
  const leaseExpiresAt = new Date(now.getTime() + cleanupLeaseMs)
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

async function claimProviderSourceCleanupJobs(owner: string, now: Date) {
  const jobs = await db.backgroundJob.findMany({
    where: {
      kind: 'DELETE_PROVIDER_SOURCE_IMAGE',
      nextAttemptAt: { lte: now },
      status: 'QUEUED',
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    select: { aggregateId: true, attempt: true, id: true, maxAttempts: true },
    take: cleanupBatchSize,
  })
  const leaseExpiresAt = new Date(now.getTime() + cleanupLeaseMs)
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

async function deleteExpiredSourceImage(
  job: {
    aggregateId: string
    attempt: number
    id: string
    maxAttempts: number
  },
  owner: string,
  now: Date,
) {
  const source = await db.sourceImage.findUnique({
    where: { id: job.aggregateId },
    select: { status: true, storageKey: true },
  })
  if (!source || source.status !== 'DELETE_PENDING') {
    await completeSourceCleanupJob(job.id, owner, now)
    return
  }

  try {
    await deleteSourceImage(source.storageKey)
  } catch (error) {
    logJobFailure('Source image storage deletion failed', error, {
      operation: 'delete-source-image',
    })
    await rescheduleCleanupJob(job, owner, now, 'SOURCE_DELETE_FAILED')
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

    await transaction.sourceImage.updateMany({
      where: { id: job.aggregateId, status: 'DELETE_PENDING' },
      data: { deletedAt: now, status: 'DELETED' },
    })
  })
}

async function completeSourceCleanupJob(id: string, owner: string, now: Date) {
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

async function deleteProviderSourceImage(
  job: {
    aggregateId: string
    attempt: number
    id: string
    maxAttempts: number
  },
  owner: string,
  now: Date,
) {
  if (process.env.GENERATION_PROVIDER !== 'leonardo') {
    await failProviderSourceCleanupJob(
      job.id,
      owner,
      now,
      'PROVIDER_SOURCE_DELETE_PROVIDER_UNAVAILABLE',
    )
    return
  }

  const generation = await db.imageGeneration.findUnique({
    where: { id: job.aggregateId },
    select: { providerSourceImageId: true, providerSourceUploadedAt: true },
  })
  if (
    !generation?.providerSourceImageId ||
    !generation.providerSourceUploadedAt
  ) {
    await completeSourceCleanupJob(job.id, owner, now)
    return
  }

  try {
    await deleteGenerationSource(generation.providerSourceImageId)
  } catch (error) {
    logJobFailure('Provider source image deletion failed', error, {
      operation: 'delete-provider-source-image',
      retryable:
        error instanceof GenerationSourceDeletionError
          ? error.retryable
          : false,
    })
    if (error instanceof GenerationSourceDeletionError && error.retryable) {
      await rescheduleCleanupJob(
        job,
        owner,
        now,
        'PROVIDER_SOURCE_DELETE_FAILED',
      )
      return
    }
    await failProviderSourceCleanupJob(
      job.id,
      owner,
      now,
      'PROVIDER_SOURCE_DELETE_UNCONFIRMED',
    )
    return
  }

  await completeSourceCleanupJob(job.id, owner, now)
}

async function failProviderSourceCleanupJob(
  id: string,
  owner: string,
  now: Date,
  errorCode:
    | 'PROVIDER_SOURCE_DELETE_PROVIDER_UNAVAILABLE'
    | 'PROVIDER_SOURCE_DELETE_UNCONFIRMED',
) {
  await db.backgroundJob.updateMany({
    where: {
      id,
      leaseExpiresAt: { gt: now },
      leaseOwner: owner,
      status: 'RUNNING',
    },
    data: { completedAt: now, lastErrorCode: errorCode, status: 'FAILED' },
  })
}

async function deleteExpiredGeneratedImage(
  job: {
    aggregateId: string
    attempt: number
    id: string
    maxAttempts: number
  },
  owner: string,
  now: Date,
) {
  const image = await db.generatedImage.findUnique({
    where: { id: job.aggregateId },
    select: { status: true, storageKey: true },
  })
  if (!image || image.status !== 'DELETE_PENDING') {
    await completeSourceCleanupJob(job.id, owner, now)
    return
  }

  try {
    await deleteGeneratedImage(image.storageKey)
  } catch (error) {
    logJobFailure('Generated image storage deletion failed', error, {
      operation: 'delete-generated-image',
    })
    await rescheduleCleanupJob(job, owner, now, 'GENERATED_IMAGE_DELETE_FAILED')
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
      where: { id: job.aggregateId, status: 'DELETE_PENDING' },
      data: { deletedAt: now, status: 'DELETED' },
    })
  })
}

async function rescheduleCleanupJob(
  job: { attempt: number; id: string; maxAttempts: number },
  owner: string | undefined,
  now: Date,
  errorCode:
    | 'GENERATED_IMAGE_DELETE_FAILED'
    | 'PROVIDER_SOURCE_DELETE_FAILED'
    | 'SOURCE_DELETE_FAILED',
) {
  const exhausted = job.attempt >= job.maxAttempts
  await db.backgroundJob.updateMany({
    where: {
      id: job.id,
      ...(owner
        ? { leaseExpiresAt: { gt: now }, leaseOwner: owner, status: 'RUNNING' }
        : { leaseExpiresAt: { lt: now }, status: 'RUNNING' }),
    },
    data: exhausted
      ? {
          completedAt: now,
          lastErrorCode: errorCode,
          status: 'FAILED',
        }
      : {
          lastErrorCode: errorCode,
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt: new Date(now.getTime() + retryDelayMs),
          status: 'QUEUED',
        },
  })
}
