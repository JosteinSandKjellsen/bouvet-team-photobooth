import { timingSafeEqual } from 'node:crypto'
import { runGenerationSubmission } from '../../utils/generation-submission'

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

  await runGenerationSubmission()
  setResponseStatus(event, 204)
})
