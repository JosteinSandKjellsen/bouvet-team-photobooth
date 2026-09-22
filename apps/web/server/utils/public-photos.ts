import { db } from './db'

const publicIdPattern = /^[A-Za-z0-9_-]{43}$/

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
