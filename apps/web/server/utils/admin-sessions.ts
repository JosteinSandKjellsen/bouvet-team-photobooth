import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { toWebRequest } from 'h3'
import { db } from './db'
import { requireSameOrigin } from './sessions'

export const adminCookieName = 'photobooth_admin'
export const adminLeaseMs = 5 * 60_000
export const adminTokenPattern = /^[A-Za-z0-9_-]{43}$/
export const hashAdminToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

export function getAdminSettings(event: H3Event) {
  setHeader(event, 'cache-control', 'no-store')
  const config = useRuntimeConfig(event)
  const settings = getConfiguredAdminSettings(config)
  if (!settings) {
    throw createError({ statusCode: 503, statusMessage: 'Admin unavailable' })
  }
  return settings
}

export function getAdminAvailability(event: H3Event) {
  setHeader(event, 'cache-control', 'no-store')
  return {
    enabled: Boolean(getConfiguredAdminSettings(useRuntimeConfig(event))),
  }
}

function getConfiguredAdminSettings(
  config: ReturnType<typeof useRuntimeConfig>,
) {
  const hash = config.adminPassphraseHash
  const origin = config.sessionOrigin
  if (
    config.adminDeletionEnabled !== true ||
    typeof hash !== 'string' ||
    !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash) ||
    typeof origin !== 'string' ||
    !/^https:\/\/[^/]+$|^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(
      origin,
    )
  ) {
    return null
  }
  try {
    if (new URL(origin).origin !== origin) return null
  } catch {
    return null
  }
  return { hash, origin }
}

export async function verifyAdminPassphrase(passphrase: string, hash: string) {
  const [, salt, expected] = hash.split(':')
  if (!salt || !expected) return false
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      passphrase,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error)
        else resolve(key)
      },
    )
  })
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'))
}

export async function limitAdminLogin(event: H3Event, now = new Date()) {
  const windowMs = 10 * 60_000
  const window = Math.floor(now.getTime() / windowMs)
  // Netlify overwrites this header. Elsewhere, never trust forwarded client IPs.
  const ip =
    process.env.NETLIFY === 'true'
      ? getRequestHeader(event, 'x-nf-client-connection-ip')
      : getRequestIP(event)
  for (const [scope, limit] of [
    ['global', 30],
    [hashAdminToken(ip ?? 'unknown'), 5],
  ] as const) {
    const bucket = await db.adminLoginBucket.upsert({
      where: { key: `${scope}:${window}` },
      create: {
        key: `${scope}:${window}`,
        attempts: 1,
        expiresAt: new Date((window + 1) * windowMs),
      },
      update: { attempts: { increment: 1 } },
    })
    if (bucket.attempts > limit) {
      setHeader(
        event,
        'retry-after',
        Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1_000),
      )
      throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
    }
  }
}

export async function loginAdmin(event: H3Event) {
  const settings = getAdminSettings(event)
  requireSameOrigin(event, settings.origin)
  await limitAdminLogin(event)
  const body = await readLoginBody(event)
  if (
    !body ||
    typeof body !== 'object' ||
    !('passphrase' in body) ||
    typeof body.passphrase !== 'string' ||
    body.passphrase.length < 1 ||
    body.passphrase.length > 512 ||
    !('pageToken' in body) ||
    typeof body.pageToken !== 'string' ||
    !adminTokenPattern.test(body.pageToken)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid login' })
  }
  if (!(await verifyAdminPassphrase(body.passphrase, settings.hash))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid login' })
  }
  const capability = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + adminLeaseMs)
  const previous = getCookie(event, adminCookieName)
  const pageTokenHash = hashAdminToken(body.pageToken)
  await db.$transaction(async (transaction) => {
    if (previous) {
      await transaction.adminSession.deleteMany({
        where: { capabilityHash: hashAdminToken(previous) },
      })
    }
    await transaction.adminSession.create({
      data: {
        capabilityHash: hashAdminToken(capability),
        pageTokenHash,
        credentialVersion: hashAdminToken(settings.hash),
        expiresAt,
      },
    })
  })
  setCookie(event, adminCookieName, capability, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/admin',
  })
  return { expiresAt: expiresAt.toISOString() }
}

export async function requireAdminSession(event: H3Event) {
  const settings = getAdminSettings(event)
  if (event.method !== 'GET') requireSameOrigin(event, settings.origin)
  const capability = getCookie(event, adminCookieName)
  const pageToken = getRequestHeader(event, 'x-admin-page-token')
  if (
    !capability ||
    !adminTokenPattern.test(capability) ||
    !pageToken ||
    !adminTokenPattern.test(pageToken)
  ) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Admin session required',
    })
  }
  const session = await db.adminSession.findFirst({
    where: {
      capabilityHash: hashAdminToken(capability),
      pageTokenHash: hashAdminToken(pageToken),
      credentialVersion: hashAdminToken(settings.hash),
      expiresAt: { gt: new Date() },
    },
  })
  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Admin session expired',
    })
  }
  return session
}

async function readLoginBody(event: H3Event): Promise<unknown> {
  if (
    getRequestHeader(event, 'content-type')?.split(';')[0] !==
    'application/json'
  ) {
    throw createError({ statusCode: 415, statusMessage: 'JSON required' })
  }
  const reader = toWebRequest(event).body?.getReader()
  if (!reader)
    throw createError({ statusCode: 400, statusMessage: 'Invalid login' })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2_048) {
        await reader.cancel()
        throw createError({ statusCode: 413, statusMessage: 'Login too large' })
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid login' })
  }
}
