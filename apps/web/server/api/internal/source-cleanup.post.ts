import { timingSafeEqual } from 'node:crypto'
import { runExpiredSourceCleanup } from '../../utils/source-cleanup'

const hasValidWorkerToken = (provided: string, expected: string) => {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  )
}

export default defineEventHandler(async (event) => {
  const { cleanupWorkerToken } = useRuntimeConfig(event)
  const authorization = getRequestHeader(event, 'authorization')
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]

  if (
    typeof cleanupWorkerToken !== 'string' ||
    cleanupWorkerToken.length === 0 ||
    !token ||
    !hasValidWorkerToken(token, cleanupWorkerToken)
  ) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  await runExpiredSourceCleanup()
  setResponseStatus(event, 204)
})
