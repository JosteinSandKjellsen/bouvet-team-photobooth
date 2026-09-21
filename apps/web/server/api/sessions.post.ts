import type {
  SessionResponse,
  ThemeDescriptor,
} from '@bouvet-team-photobooth/contracts'
import { isThemeId } from '../utils/themes'
import {
  createSession,
  getSessionSettings,
  requireSameOrigin,
  sessionCookieName,
  toSessionResponse,
} from '../utils/sessions'

interface CreateSessionBody {
  themeId: string
}

const isCreateSessionBody = (value: unknown): value is CreateSessionBody =>
  typeof value === 'object' &&
  value !== null &&
  Object.keys(value).length === 1 &&
  typeof (value as Record<string, unknown>).themeId === 'string'

export default defineEventHandler(async (event): Promise<SessionResponse> => {
  const settings = getSessionSettings(event)
  requireSameOrigin(event, settings.sessionOrigin)

  const body = await readBody<unknown>(event)
  if (!isCreateSessionBody(body) || !isThemeId(body.themeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid theme' })
  }

  const { capability, session } = await createSession(
    body.themeId as ThemeDescriptor['id'],
    settings.sessionTtlMs,
  )
  setCookie(event, sessionCookieName, capability, {
    httpOnly: true,
    maxAge: Math.floor(settings.sessionTtlMs / 1_000),
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  })
  setResponseStatus(event, 201)

  return toSessionResponse(session)
})
