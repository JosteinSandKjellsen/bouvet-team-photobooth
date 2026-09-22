import {
  getPublicPhoto,
  throwPhotoNotFound,
} from '../../../utils/public-photos'
import { getSourceImage } from '../../../utils/source-storage'

export default defineEventHandler(async (event) => {
  const photo = await getPublicPhoto(getRouterParam(event, 'publicId'))
  if (!photo) throwPhotoNotFound()

  const image = await getSourceImage(photo.storageKey)
  setHeader(event, 'cache-control', 'no-store')
  setHeader(
    event,
    'content-disposition',
    'attachment; filename="teambilde.jpg"',
  )
  setHeader(event, 'content-length', photo.byteSize)
  setHeader(event, 'content-type', photo.contentType)
  return image
})
