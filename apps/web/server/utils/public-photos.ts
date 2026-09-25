import type {
  PublicPhotoListItem,
  PublicPhotoOverviewResponse,
} from '@bouvet-team-photobooth/contracts'
import { db } from './db'

const publicIdPattern = /^[A-Za-z0-9_-]{43}$/
const overviewPageSize = 6

interface PublicPhotoCursor {
  publicId: string
  publishedAt: Date
}

function encodeCursor(photo: PublicPhotoCursor) {
  return Buffer.from(
    JSON.stringify({
      publicId: photo.publicId,
      publishedAt: photo.publishedAt,
    }),
  ).toString('base64url')
}

function decodeCursor(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > 256) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cursor' })
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    )
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      !('publicId' in decoded) ||
      !('publishedAt' in decoded) ||
      typeof decoded.publicId !== 'string' ||
      typeof decoded.publishedAt !== 'string' ||
      !publicIdPattern.test(decoded.publicId)
    ) {
      throw new Error('Invalid cursor')
    }

    const publishedAt = new Date(decoded.publishedAt)
    if (Number.isNaN(publishedAt.getTime())) throw new Error('Invalid cursor')
    return { publicId: decoded.publicId, publishedAt }
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cursor' })
  }
}

function getPhotoItem(photo: {
  height: number
  publishedAt: Date | null
  publicId: string
  width: number
}): PublicPhotoListItem {
  if (!photo.publishedAt) {
    throw new Error('Published gallery photo is missing its publication time')
  }

  return {
    height: photo.height,
    imageUrl: `/api/photos/${photo.publicId}/image`,
    publishedAt: photo.publishedAt.toISOString(),
    publicId: photo.publicId,
    width: photo.width,
  }
}

function getPhotoCursor(
  photo:
    | {
        publicId: string
        publishedAt: Date | null
      }
    | undefined,
): PublicPhotoCursor | undefined {
  if (!photo?.publishedAt) return undefined
  return { publicId: photo.publicId, publishedAt: photo.publishedAt }
}

export async function getCompletedPhotoCount() {
  const aggregate = await db.eventAggregate.findUnique({
    select: { completedPhotoCount: true },
    where: { id: 'current' },
  })
  return aggregate?.completedPhotoCount ?? 0
}

export async function getPublicPhotoOverview(
  beforeValue: unknown,
  afterValue: unknown,
): Promise<PublicPhotoOverviewResponse> {
  const before = decodeCursor(beforeValue)
  const after = decodeCursor(afterValue)
  if (before && after) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cursor' })
  }

  const now = new Date()
  const visibleWhere = {
    deleteAfter: { gt: now },
    publishedAt: { not: null },
    status: 'ACTIVE' as const,
  }
  const cursor = before ?? after
  const candidates = await db.generatedImage.findMany({
    where: {
      ...visibleWhere,
      ...(cursor
        ? {
            OR: after
              ? [
                  { publishedAt: { gt: cursor.publishedAt } },
                  {
                    publicId: { gt: cursor.publicId },
                    publishedAt: cursor.publishedAt,
                  },
                ]
              : [
                  { publishedAt: { lt: cursor.publishedAt } },
                  {
                    publicId: { lt: cursor.publicId },
                    publishedAt: cursor.publishedAt,
                  },
                ],
          }
        : {}),
    },
    orderBy: [
      { publishedAt: after ? 'asc' : 'desc' },
      { publicId: after ? 'asc' : 'desc' },
    ],
    select: {
      height: true,
      publicId: true,
      publishedAt: true,
      width: true,
    },
    take: overviewPageSize + 1,
  })
  const page = candidates.slice(0, overviewPageSize)
  if (after) page.reverse()

  const newest = getPhotoCursor(page[0])
  const oldest = getPhotoCursor(page.at(-1))
  const hasOlder = after
    ? Boolean(
        oldest &&
        (await db.generatedImage.findFirst({
          where: {
            ...visibleWhere,
            OR: [
              { publishedAt: { lt: oldest.publishedAt } },
              {
                publicId: { lt: oldest.publicId },
                publishedAt: oldest.publishedAt,
              },
            ],
          },
          select: { publicId: true },
        })),
      )
    : candidates.length > overviewPageSize
  const hasNewer = before
    ? Boolean(
        newest &&
        (await db.generatedImage.findFirst({
          where: {
            ...visibleWhere,
            OR: [
              { publishedAt: { gt: newest.publishedAt } },
              {
                publicId: { gt: newest.publicId },
                publishedAt: newest.publishedAt,
              },
            ],
          },
          select: { publicId: true },
        })),
      )
    : after
      ? candidates.length > overviewPageSize
      : false

  return {
    completedCount: await getCompletedPhotoCount(),
    ...(hasNewer && newest ? { newerCursor: encodeCursor(newest) } : {}),
    ...(hasOlder && oldest ? { olderCursor: encodeCursor(oldest) } : {}),
    photos: page.map(getPhotoItem),
  }
}

export async function getPublicPhoto(publicId: string | undefined) {
  if (!publicId || !publicIdPattern.test(publicId)) return null

  return db.generatedImage.findFirst({
    select: {
      byteSize: true,
      contentType: true,
      height: true,
      publicId: true,
      storageKey: true,
      width: true,
      generation: {
        select: {
          sourceImage: {
            select: { session: { select: { themeId: true } } },
          },
        },
      },
    },
    where: {
      deleteAfter: { gt: new Date() },
      publicId,
      status: 'ACTIVE',
    },
  })
}

export function throwPhotoNotFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
}
