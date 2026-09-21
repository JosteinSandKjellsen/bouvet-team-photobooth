import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { SourceImageUploadResponse } from '@bouvet-team-photobooth/contracts'
import { db } from './db'
import { storeSourceImage } from './source-storage'

const MAX_INPUT_BYTES = 4_000_000
const MAX_INPUT_PIXELS = 16_000_000
const MAX_PROCESSED_DIMENSION = 1_600
const MAX_PROCESSED_BYTES = 4_000_000

const allowedMimeTypes = new Set(['jpeg', 'png', 'webp'])

function invalidImage() {
  return createError({ statusCode: 400, statusMessage: 'Invalid image' })
}

export async function createSourceImage(
  session: { expiresAt: Date; id: string },
  image: Uint8Array,
): Promise<SourceImageUploadResponse> {
  const existing = await db.sourceImage.findUnique({
    where: { sessionId: session.id },
    select: {
      byteSize: true,
      contentType: true,
      height: true,
      id: true,
      width: true,
    },
  })
  if (existing) {
    return toUploadResponse(existing)
  }

  if (image.byteLength === 0 || image.byteLength > MAX_INPUT_BYTES) {
    throw invalidImage()
  }

  let normalized: { bytes: Uint8Array; height: number; width: number }
  try {
    const metadata = await sharp(image, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata()
    if (
      !metadata.format ||
      !allowedMimeTypes.has(metadata.format) ||
      !metadata.width ||
      !metadata.height
    ) {
      throw invalidImage()
    }

    const result = await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        height: MAX_PROCESSED_DIMENSION,
        width: MAX_PROCESSED_DIMENSION,
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true })
    normalized = {
      bytes: result.data,
      height: result.info.height,
      width: result.info.width,
    }
  } catch {
    throw invalidImage()
  }

  if (normalized.bytes.byteLength > MAX_PROCESSED_BYTES) {
    throw invalidImage()
  }

  const storageKey = `sources/${randomUUID()}.jpg`
  let source
  try {
    source = await db.sourceImage.create({
      data: {
        byteSize: normalized.bytes.byteLength,
        contentType: 'image/jpeg',
        deleteAfter: session.expiresAt,
        height: normalized.height,
        sessionId: session.id,
        storageKey,
        width: normalized.width,
      },
      select: {
        byteSize: true,
        contentType: true,
        height: true,
        id: true,
        width: true,
      },
    })
  } catch {
    const concurrent = await db.sourceImage.findUnique({
      where: { sessionId: session.id },
      select: {
        byteSize: true,
        contentType: true,
        height: true,
        id: true,
        width: true,
      },
    })
    if (concurrent) {
      return toUploadResponse(concurrent)
    }
    throw createError({
      statusCode: 503,
      statusMessage: 'Source storage is unavailable',
    })
  }

  try {
    await storeSourceImage(storageKey, normalized.bytes)
  } catch {
    await db.sourceImage.delete({ where: { id: source.id } })
    throw createError({
      statusCode: 503,
      statusMessage: 'Source storage is unavailable',
    })
  }

  return toUploadResponse(source)
}

function toUploadResponse(source: {
  byteSize: number
  contentType: string
  height: number
  id: string
  width: number
}): SourceImageUploadResponse {
  return {
    height: source.height,
    mimeType: 'image/jpeg',
    processedBytes: source.byteSize,
    sourceId: source.id,
    width: source.width,
  }
}
