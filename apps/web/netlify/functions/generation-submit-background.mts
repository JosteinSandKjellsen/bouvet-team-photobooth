import type { Context } from '@netlify/functions'
import { runGenerationSubmission } from '../../server/utils/generation-submission'

const completionPolls = 24
const completionPollIntervalMs = 5_000

export default async function generationSubmit(
  request: Request,
  _context: Context,
) {
  const workerToken = process.env.NUXT_GENERATION_WORKER_TOKEN
  if (
    !workerToken ||
    request.headers.get('authorization') !== `Bearer ${workerToken}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const runs =
    process.env.GENERATION_PROVIDER === 'leonardo' ? completionPolls : 1
  for (let attempt = 0; attempt < runs; attempt += 1) {
    await runGenerationSubmission()
    if (attempt < runs - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, completionPollIntervalMs),
      )
    }
  }

  return new Response(null, { status: 202 })
}
