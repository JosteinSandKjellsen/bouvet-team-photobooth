import { randomUUID } from 'node:crypto'
import { db } from './db'
import { submitGeneration } from './generation-provider'

const submissionBatchSize = 10
const submissionLeaseMs = 60_000

export async function runGenerationSubmission(now = new Date()) {
  if (process.env.GENERATION_PROVIDER !== 'deterministic') return

  await recoverUncertainSubmissions(now)

  const owner = randomUUID()
  const jobs = await claimGenerationJobs(owner, now)
  for (const job of jobs) {
    await submitClaimedGeneration(job, owner, now)
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

  const result = await submitGeneration(job.aggregateId)
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
  })
}
