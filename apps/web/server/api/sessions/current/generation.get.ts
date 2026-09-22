import type { GenerationStatusResponse } from '@bouvet-team-photobooth/contracts'
import { db } from '../../../utils/db'
import { getCurrentSession, sessionCookieName } from '../../../utils/sessions'

const generationStatuses = {
  FAILED: 'failed',
  PENDING: 'pending',
  SUBMISSION_UNKNOWN: 'submission_unknown',
  SUBMITTED: 'submitted',
  SUBMITTING: 'submitting',
  SUCCEEDED: 'succeeded',
} as const

export default defineEventHandler(
  async (event): Promise<GenerationStatusResponse> => {
    const capability = getCookie(event, sessionCookieName)
    if (!capability) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const session = await getCurrentSession(capability)
    if (!session) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const generation = await db.imageGeneration.findFirst({
      where: { sourceImage: { sessionId: session.id } },
      select: { id: true, status: true },
    })
    if (!generation) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Generation not found',
      })
    }

    return {
      jobId: generation.id,
      status: generationStatuses[generation.status],
    }
  },
)
