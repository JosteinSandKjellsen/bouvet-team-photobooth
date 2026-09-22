import type { SourceImageUploadResponse } from '@bouvet-team-photobooth/contracts'
import {
  getCurrentSession,
  getSessionSettings,
  isCaptureGenerationEnabled,
  requireSameOrigin,
  sessionCookieName,
} from '../../../utils/sessions'
import { createSourceImage } from '../../../utils/sources'

export default defineEventHandler(
  async (event): Promise<SourceImageUploadResponse> => {
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

    const parts = await readMultipartFormData(event)
    const imageParts = parts?.filter((part) => part.name === 'image') ?? []
    if (imageParts.length !== 1 || !imageParts[0]?.data) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid image' })
    }

    return createSourceImage(session, imageParts[0].data)
  },
)
