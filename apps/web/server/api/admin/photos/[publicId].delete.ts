import type { PhotoDeletionResponse } from '@bouvet-team-photobooth/contracts'
import { requireAdminSession } from '../../../utils/admin-sessions'
import {
  getPhotoDeletionStatus,
  requestPhotoDeletion,
  runPhotoDeletionCleanup,
} from '../../../utils/photo-deletion'

export default defineEventHandler(
  async (event): Promise<PhotoDeletionResponse> => {
    await requireAdminSession(event)
    const accepted = await requestPhotoDeletion(
      getRouterParam(event, 'publicId'),
    )
    if (accepted.status === 'pending')
      await runPhotoDeletionCleanup(new Date(), accepted.operationId)
    const result = await getPhotoDeletionStatus(accepted.operationId)
    setResponseStatus(event, result.status === 'pending' ? 202 : 200)
    return result
  },
)
