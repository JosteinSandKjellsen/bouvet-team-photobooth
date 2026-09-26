import type { PhotoDeletionResponse } from '@bouvet-team-photobooth/contracts'
import { requireAdminSession } from '../../../utils/admin-sessions'
import { getPhotoDeletionStatus } from '../../../utils/photo-deletion'

export default defineEventHandler(
  async (event): Promise<PhotoDeletionResponse> => {
    await requireAdminSession(event)
    return getPhotoDeletionStatus(getRouterParam(event, 'operationId'))
  },
)
