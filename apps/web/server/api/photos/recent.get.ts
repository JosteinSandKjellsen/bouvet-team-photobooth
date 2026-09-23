import type { PublicPhotoOverviewResponse } from '@bouvet-team-photobooth/contracts'
import { getPublicPhotoOverview } from '../../utils/public-photos'

export default defineEventHandler(
  async (event): Promise<PublicPhotoOverviewResponse> => {
    const query = getQuery(event)
    return getPublicPhotoOverview(query.before, query.after)
  },
)
