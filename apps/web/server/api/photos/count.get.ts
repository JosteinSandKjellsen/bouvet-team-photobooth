import type { PublicPhotoCountResponse } from '@bouvet-team-photobooth/contracts'
import { getCompletedPhotoCount } from '../../utils/public-photos'

export default defineEventHandler(
  async (): Promise<PublicPhotoCountResponse> => ({
    completedCount: await getCompletedPhotoCount(),
  }),
)
