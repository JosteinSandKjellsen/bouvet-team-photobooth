import type { SessionResponse } from '@bouvet-team-photobooth/contracts'
import {
  getCurrentSession,
  sessionCookieName,
  toSessionResponse,
} from '../../utils/sessions'

export default defineEventHandler(async (event): Promise<SessionResponse> => {
  const capability = getCookie(event, sessionCookieName)
  if (!capability) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const session = await getCurrentSession(capability)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return toSessionResponse(session)
})
