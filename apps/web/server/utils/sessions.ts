import { createHash, randomBytes } from 'node:crypto'
import type {
  SessionResponse,
  ThemeDescriptor,
} from '@bouvet-team-photobooth/contracts'
import type { H3Event } from 'h3'
import { db } from './db'
import { isThemeId } from './themes'

export const sessionCookieName = 'photobooth_session'

const hashCapability = (capability: string) =>
  createHash('sha256').update(capability).digest('hex')

export function getSessionSettings(event: H3Event) {
  const config = useRuntimeConfig(event)
  const sessionOrigin = config.sessionOrigin
  const sessionTtlMs = Number(config.sessionTtlMs)

  if (
    typeof sessionOrigin !== 'string' ||
    new URL(sessionOrigin).origin !== sessionOrigin ||
    !Number.isSafeInteger(sessionTtlMs) ||
    sessionTtlMs <= 0
  ) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Session service is unavailable',
    })
  }

  return { sessionOrigin, sessionTtlMs }
}

export function requireSameOrigin(event: H3Event, sessionOrigin: string) {
  if (getRequestHeader(event, 'origin') !== sessionOrigin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

export async function createSession(
  themeId: ThemeDescriptor['id'],
  sessionTtlMs: number,
) {
  const capability = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionTtlMs)
  const session = await db.session.create({
    data: {
      capabilityHash: hashCapability(capability),
      themeId,
      expiresAt,
    },
    select: { expiresAt: true, themeId: true },
  })

  return { capability, session }
}

export async function getCurrentSession(capability: string) {
  return db.session.findFirst({
    where: {
      capabilityHash: hashCapability(capability),
      expiresAt: { gt: new Date() },
    },
    select: { expiresAt: true, id: true, themeId: true },
  })
}

export function toSessionResponse(session: {
  expiresAt: Date
  themeId: string
}): SessionResponse {
  if (!isThemeId(session.themeId)) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Session service is unavailable',
    })
  }

  return {
    expiresAt: session.expiresAt.toISOString(),
    themeId: session.themeId,
  }
}
