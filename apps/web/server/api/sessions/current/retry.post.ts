import type { GenerationAcceptedResponse } from '@bouvet-team-photobooth/contracts'
import {
  getCurrentSession,
  getSessionSettings,
  requireSameOrigin,
  sessionCookieName,
} from '../../../utils/sessions'
import { retryGenerationForSource } from '../../../utils/sources'

export default defineEventHandler(
  async (event): Promise<GenerationAcceptedResponse> => {
    const settings = getSessionSettings(event)
    requireSameOrigin(event, settings.sessionOrigin)

    const capability = getCookie(event, sessionCookieName)
    if (!capability) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const session = await getCurrentSession(capability)
    if (!session) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const generation = await retryGenerationForSource(session.id)
    setResponseStatus(event, 202)
    return { jobId: generation.id, status: 'pending' }
  },
)
