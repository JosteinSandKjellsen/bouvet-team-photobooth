import {
  getPublicPhoto,
  throwPhotoNotFound,
} from '../../../utils/public-photos'
import {
  createPublicImageThumbnail,
  getPublicImageCacheControl,
} from '../../../utils/public-image-cache'
import { getSourceImage } from '../../../utils/source-storage'

export default defineEventHandler(async (event) => {
  const photo = await getPublicPhoto(getRouterParam(event, 'publicId'))
  if (!photo) throwPhotoNotFound()

  const variant = getQuery(event).variant
  if (variant !== undefined && variant !== 'thumbnail') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image variant',
    })
  }

  const etag = `"${photo.publicId}-${variant ?? 'full'}"`
  setHeader(
    event,
    'cache-control',
    getPublicImageCacheControl(photo.deleteAfter),
  )
  setHeader(event, 'etag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return
  }

  const source = await getSourceImage(photo.storageKey)
  const image =
    variant === 'thumbnail' ? await createPublicImageThumbnail(source) : source

  setHeader(event, 'content-length', image.byteLength)
  setHeader(event, 'content-type', photo.contentType)
  return image
})
