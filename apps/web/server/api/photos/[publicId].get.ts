import type { PublicPhotoResponse } from '@bouvet-team-photobooth/contracts'
import { getPublicPhoto, throwPhotoNotFound } from '../../utils/public-photos'
import { isThemeId } from '../../utils/themes'

export default defineEventHandler(
  async (event): Promise<PublicPhotoResponse> => {
    const photo = await getPublicPhoto(getRouterParam(event, 'publicId'))
    if (!photo) throwPhotoNotFound()

    const themeId = photo.generation.sourceImage.session.themeId

    return {
      downloadUrl: `/api/photos/${photo.publicId}/download`,
      height: photo.height,
      imageUrl: `/api/photos/${photo.publicId}/image`,
      width: photo.width,
      ...(isThemeId(themeId) ? { themeId } : {}),
    }
  },
)
