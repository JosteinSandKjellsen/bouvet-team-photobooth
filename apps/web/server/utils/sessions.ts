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

const isSerializationConflict = (error: unknown) => {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return false
  }

  const cause = error.cause
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'originalCode' in cause &&
    cause.originalCode === '40001'
  )
}

export function getSessionSettings(event: H3Event) {
  const config = useRuntimeConfig(event)
  const sessionMaxActive = Number(config.sessionMaxActive)
  const sessionOrigin = config.sessionOrigin
  const sessionTtlMs = Number(config.sessionTtlMs)

  if (
    typeof sessionOrigin !== 'string' ||
    new URL(sessionOrigin).origin !== sessionOrigin ||
    !Number.isSafeInteger(sessionMaxActive) ||
    sessionMaxActive <= 0 ||
    !Number.isSafeInteger(sessionTtlMs) ||
    sessionTtlMs <= 0
  ) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Session service is unavailable',
    })
  }

  return { sessionMaxActive, sessionOrigin, sessionTtlMs }
}

export function requireSameOrigin(event: H3Event, sessionOrigin: string) {
  if (getRequestHeader(event, 'origin') !== sessionOrigin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

export async function createSession(
  themeId: ThemeDescriptor['id'],
  sessionTtlMs: number,
  sessionMaxActive: number,
) {
  const capability = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + sessionTtlMs)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const session = await db.$transaction(
        async (transaction) => {
          const activeSessions = await transaction.session.count({
            where: { expiresAt: { gt: now } },
          })
          if (activeSessions >= sessionMaxActive) {
            throw createError({
              statusCode: 429,
              statusMessage: 'Session capacity is unavailable',
            })
          }

          return transaction.session.create({
            data: {
              capabilityHash: hashCapability(capability),
              themeId,
              expiresAt,
            },
            select: { expiresAt: true, themeId: true },
          })
        },
        { isolationLevel: 'Serializable' },
      )

      return { capability, session }
    } catch (error) {
      if (!isSerializationConflict(error) || attempt === 2) throw error
    }
  }

  throw createError({
    statusCode: 503,
    statusMessage: 'Session service is unavailable',
  })
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
