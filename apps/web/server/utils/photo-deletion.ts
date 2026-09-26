import { randomBytes, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { PhotoDeletionResponse } from '@bouvet-team-photobooth/contracts'
import { db } from './db'
import {
  deleteLeonardoGeneration,
  GenerationDeletionError,
} from './generation-provider'
import { deleteGeneratedImage } from './source-storage'
import { logJobFailure } from './job-logging'

const publicIdPattern = /^[A-Za-z0-9_-]{43}$/
const providerIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const jobKind = 'DELETE_PUBLIC_PHOTO'
const leaseMs = 60_000
const retryMs = 60_000

export function isDeletableProviderGenerationId(
  providerId: string | null,
  generationId: string,
) {
  return (
    providerId === `deterministic-${generationId}` ||
    Boolean(providerId && providerIdPattern.test(providerId))
  )
}

export async function requestPhotoDeletion(publicId: string | undefined) {
  if (!publicId || !publicIdPattern.test(publicId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid photo' })
  }
  let deletion
  try {
    deletion = await db.$transaction(async (transaction) => {
      const existing = await transaction.photoDeletion.findUnique({
        where: { publicId },
      })
      if (existing) return existing
      const photo = await transaction.generatedImage.findUnique({
        where: { publicId },
        include: { generation: true },
      })
      if (!photo?.publishedAt || photo.generation.status !== 'SUCCEEDED') {
        throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
      }
      const providerId = photo.generation.providerGenerationId
      if (!isDeletableProviderGenerationId(providerId, photo.generationId)) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Provider reference unavailable',
        })
      }
      await transaction.generatedImage.update({
        where: { id: photo.id },
        data: { status: 'DELETE_PENDING' },
      })
      const created = await transaction.photoDeletion.create({
        data: {
          publicId,
          operationId: randomBytes(32).toString('base64url'),
          imageId: photo.id,
          generationId: photo.generationId,
          providerGenerationId: providerId,
          storageKey: photo.storageKey,
        },
      })
      await transaction.backgroundJob.create({
        data: {
          aggregateId: created.id,
          idempotencyKey: `delete-public-photo:${publicId}`,
          kind: jobKind,
        },
      })
      return created
    })
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 'P2002'
    )
      throw error
    deletion = await db.photoDeletion.findUnique({ where: { publicId } })
    if (!deletion) throw error
  }
  return getPhotoDeletionStatus(deletion.operationId)
}

export async function getPhotoDeletionStatus(
  operationId: string | undefined,
): Promise<PhotoDeletionResponse> {
  if (!operationId || !publicIdPattern.test(operationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid deletion' })
  }
  const deletion = await db.photoDeletion.findUnique({ where: { operationId } })
  if (!deletion)
    throw createError({ statusCode: 404, statusMessage: 'Deletion not found' })
  const job = await db.backgroundJob.findUnique({
    where: { idempotencyKey: `delete-public-photo:${deletion.publicId}` },
    select: { status: true },
  })
  if (!job) {
    console.error('Photo deletion job is missing', {
      operation: 'delete-public-photo',
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Deletion status unavailable',
    })
  }
  return {
    operationId,
    status: deletion.completedAt
      ? 'completed'
      : job.status === 'FAILED'
        ? 'failed'
        : 'pending',
  }
}

export async function runPhotoDeletionCleanup(
  now = new Date(),
  operationId?: string,
) {
  await pruneAdminState(now)
  const expired = await db.backgroundJob.findMany({
    where: { kind: jobKind, status: 'RUNNING', leaseExpiresAt: { lte: now } },
    take: 25,
  })
  for (const job of expired) {
    const deletion = await db.photoDeletion.findUnique({
      where: { id: job.aggregateId },
    })
    const uncertain = Boolean(
      deletion?.providerDeleteStartedAt && !deletion.providerDeletedAt,
    )
    const failed = uncertain || job.attempt >= job.maxAttempts
    await db.backgroundJob.updateMany({
      where: { id: job.id, status: 'RUNNING', leaseExpiresAt: { lte: now } },
      data: {
        status: failed ? 'FAILED' : 'QUEUED',
        completedAt: failed ? now : null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: uncertain
          ? 'PROVIDER_DELETE_UNCONFIRMED'
          : 'DELETION_LEASE_EXPIRED',
      },
    })
    if (failed)
      console.error('Photo deletion requires operator attention', {
        operation: 'delete-public-photo',
        uncertain,
      })
  }

  const requested = operationId
    ? await db.photoDeletion.findUniqueOrThrow({
        where: { operationId },
        select: { id: true },
      })
    : undefined
  const job = await db.backgroundJob.findFirst({
    where: {
      kind: jobKind,
      status: 'QUEUED',
      nextAttemptAt: { lte: now },
      ...(requested ? { aggregateId: requested.id } : {}),
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!job) return
  const owner = randomUUID()
  const claimed = await db.backgroundJob.updateMany({
    where: { id: job.id, status: 'QUEUED' },
    data: {
      status: 'RUNNING',
      attempt: { increment: 1 },
      leaseOwner: owner,
      leaseExpiresAt: new Date(Date.now() + leaseMs),
    },
  })
  if (!claimed.count) return

  try {
    const deletion = await db.photoDeletion.findUniqueOrThrow({
      where: { id: job.aggregateId },
    })
    if (!deletion.localDeletedAt) {
      if (!deletion.storageKey)
        throw new Error('Missing deletion storage reference')
      await deleteGeneratedImage(deletion.storageKey)
      await db.photoDeletion.update({
        where: { id: deletion.id },
        data: { localDeletedAt: new Date() },
      })
    }
    if (!deletion.providerDeletedAt) {
      if (deletion.providerDeleteStartedAt) {
        throw new GenerationDeletionError(
          'Generation deletion outcome is unknown',
        )
      }
      const providerId = deletion.providerGenerationId
      if (!providerId)
        throw new GenerationDeletionError('Missing provider reference')
      const started = await db.photoDeletion.updateMany({
        where: { id: deletion.id, providerDeleteStartedAt: null },
        data: { providerDeleteStartedAt: new Date() },
      })
      if (!started.count)
        throw new GenerationDeletionError('Generation deletion already started')
      try {
        if (providerId === `deterministic-${deletion.generationId}`) {
          if (process.env.GENERATION_PROVIDER !== 'deterministic') {
            throw new GenerationDeletionError(
              'Synthetic deletion is not configured',
            )
          }
        } else {
          await deleteLeonardoGeneration(providerId)
        }
      } catch (error) {
        if (error instanceof GenerationDeletionError && error.retryable) {
          await db.photoDeletion.update({
            where: { id: deletion.id },
            data: { providerDeleteStartedAt: null },
          })
        }
        throw error
      }
      await db.photoDeletion.update({
        where: { id: deletion.id },
        data: { providerDeletedAt: new Date() },
      })
    }
    await db.$transaction(async (transaction) => {
      const finished = await transaction.backgroundJob.updateMany({
        where: {
          id: job.id,
          status: 'RUNNING',
          leaseOwner: owner,
          leaseExpiresAt: { gt: new Date() },
        },
        data: {
          status: 'SUCCEEDED',
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
        },
      })
      if (!finished.count) return
      await transaction.generatedImage.deleteMany({
        where: {
          id: deletion.imageId,
          status: { in: ['DELETE_PENDING', 'DELETED'] },
        },
      })
      await transaction.imageGeneration.updateMany({
        where: { id: deletion.generationId, status: 'SUCCEEDED' },
        data: { providerOutputUrl: null },
      })
      await transaction.photoDeletion.update({
        where: { id: deletion.id },
        data: {
          completedAt: new Date(),
          storageKey: null,
          providerGenerationId: null,
        },
      })
    })
  } catch (error) {
    const retryable =
      !(error instanceof GenerationDeletionError) || error.retryable
    const failed = !retryable || job.attempt + 1 >= job.maxAttempts
    logJobFailure('Photo deletion failed', error, {
      operation: 'delete-public-photo',
      retryable,
      requiresOperator: failed,
    })
    await db.backgroundJob.updateMany({
      where: { id: job.id, status: 'RUNNING', leaseOwner: owner },
      data: {
        status: failed ? 'FAILED' : 'QUEUED',
        completedAt: failed ? new Date() : null,
        nextAttemptAt: new Date(Date.now() + retryMs),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: retryable
          ? 'PHOTO_DELETE_FAILED'
          : 'PROVIDER_DELETE_UNCONFIRMED',
      },
    })
  }
}

async function pruneAdminState(now: Date) {
  const sessions = await db.adminSession.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    take: 25,
  })
  await db.adminSession.deleteMany({
    where: {
      id: { in: sessions.map(({ id }) => id) },
      expiresAt: { lte: now },
    },
  })
  const buckets = await db.adminLoginBucket.findMany({
    where: { expiresAt: { lte: now } },
    select: { key: true },
    take: 25,
  })
  await db.adminLoginBucket.deleteMany({
    where: { key: { in: buckets.map(({ key }) => key) } },
  })
  const completed = await db.photoDeletion.findMany({
    where: { completedAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } },
    select: { id: true },
    take: 25,
  })
  const ids = completed.map(({ id }) => id)
  await db.$transaction(async (transaction) => {
    await transaction.backgroundJob.deleteMany({
      where: { kind: jobKind, aggregateId: { in: ids }, status: 'SUCCEEDED' },
    })
    await transaction.photoDeletion.deleteMany({ where: { id: { in: ids } } })
  })
}
