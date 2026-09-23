import { timingSafeEqual } from 'node:crypto'
import { runGenerationSubmission } from '../../utils/generation-submission'
import { logJobFailure } from '../../utils/job-logging'

export default defineEventHandler(async (event) => {
  const { cleanupWorkerToken } = useRuntimeConfig(event)
  const authorization = getRequestHeader(event, 'authorization')
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]
  const expected =
    typeof cleanupWorkerToken === 'string' ? cleanupWorkerToken : ''

  if (
    expected.length === 0 ||
    !token ||
    token.length !== expected.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  ) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const startedAt = performance.now()
  try {
    await runGenerationSubmission()
  } catch (error) {
    logJobFailure('Generation submission sweep failed', error, {
      durationMs: Math.round(performance.now() - startedAt),
      provider: process.env.GENERATION_PROVIDER ?? 'disabled',
    })
    throw error
  }
  setResponseStatus(event, 204)
})
