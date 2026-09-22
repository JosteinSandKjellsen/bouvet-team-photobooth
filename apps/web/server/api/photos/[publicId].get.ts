import type { PublicPhotoResponse } from '@bouvet-team-photobooth/contracts'
import { getPublicPhoto, throwPhotoNotFound } from '../../utils/public-photos'

export default defineEventHandler(
  async (event): Promise<PublicPhotoResponse> => {
    const photo = await getPublicPhoto(getRouterParam(event, 'publicId'))
    if (!photo) throwPhotoNotFound()

    return {
      downloadUrl: `/api/photos/${photo.publicId}/download`,
      height: photo.height,
      imageUrl: `/api/photos/${photo.publicId}/image`,
      width: photo.width,
    }
  },
)
