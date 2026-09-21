import { randomUUID } from 'node:crypto'
import { db } from './db'
import { deleteSourceImage } from './source-storage'

const cleanupBatchSize = 25
const cleanupLeaseMs = 60_000
const retryDelayMs = 60_000

export async function runExpiredSourceCleanup(now = new Date()) {
  await recoverExpiredSourceCleanupJobs(now)
  await enqueueExpiredSourceCleanupJobs(now)

  const owner = randomUUID()
  const jobs = await claimSourceCleanupJobs(owner, now)
  for (const job of jobs) {
    await deleteExpiredSourceImage(job, owner, now)
  }
}

async function enqueueExpiredSourceCleanupJobs(now: Date) {
  const sources = await db.sourceImage.findMany({
    where: { deleteAfter: { lte: now }, status: 'ACTIVE' },
    orderBy: { deleteAfter: 'asc' },
    select: { id: true },
    take: cleanupBatchSize,
  })

  for (const source of sources) {
    await db.$transaction(async (transaction) => {
      const changed = await transaction.sourceImage.updateMany({
        where: { id: source.id, status: 'ACTIVE' },
        data: { status: 'DELETE_PENDING' },
      })
      if (changed.count === 0) return

      await transaction.backgroundJob.create({
        data: {
          aggregateId: source.id,
          idempotencyKey: `delete-source-image:${source.id}`,
          kind: 'DELETE_SOURCE_IMAGE',
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
  } catch {
    await rescheduleSourceCleanupJob(job, owner, now)
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

async function rescheduleSourceCleanupJob(
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
          lastErrorCode: 'SOURCE_DELETE_FAILED',
          status: 'FAILED',
        }
      : {
          lastErrorCode: 'SOURCE_DELETE_FAILED',
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt: new Date(now.getTime() + retryDelayMs),
          status: 'QUEUED',
        },
  })
}
