import {
  getSessionSettings,
  requireSameOrigin,
  sessionCookieName,
} from '../../../utils/sessions'

export default defineEventHandler((event) => {
  const settings = getSessionSettings(event)
  requireSameOrigin(event, settings.sessionOrigin)

  deleteCookie(event, sessionCookieName, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  })
  setResponseStatus(event, 204)
})
