import sharp from 'sharp'

const publicImageCacheSeconds = 3 * 60 * 60

export function getPublicImageCacheControl(
  deleteAfter: Date,
  now = new Date(),
) {
  const remainingSeconds = Math.max(
    0,
    Math.floor((deleteAfter.getTime() - now.getTime()) / 1000),
  )
  const maxAge = Math.min(publicImageCacheSeconds, remainingSeconds)

  return `public, max-age=${maxAge}, s-maxage=${maxAge}, must-revalidate`
}

export async function createPublicImageThumbnail(image: Uint8Array) {
  return sharp(image)
    .resize({ width: 768, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
}
