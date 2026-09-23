import type { GenerationAcceptedResponse } from '@bouvet-team-photobooth/contracts'
import {
  getCurrentSession,
  getSessionSettings,
  isCaptureGenerationEnabled,
  requireSameOrigin,
  sessionCookieName,
} from '../../../utils/sessions'
import { triggerGenerationWorker } from '../../../utils/generation-worker'
import { createGenerationForSource } from '../../../utils/sources'

export default defineEventHandler(
  async (event): Promise<GenerationAcceptedResponse> => {
    const settings = getSessionSettings(event)
    requireSameOrigin(event, settings.sessionOrigin)
    if (!isCaptureGenerationEnabled(event)) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Capture generation is disabled',
      })
    }

    const capability = getCookie(event, sessionCookieName)
    if (!capability) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const session = await getCurrentSession(capability)
    if (!session) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const generation = await createGenerationForSource(session.id)
    await triggerGenerationWorker()
    setResponseStatus(event, 202)
    return { jobId: generation.id, status: 'pending' }
  },
)
