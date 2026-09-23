import type { Context } from '@netlify/functions'
import { runGenerationSubmission } from '../../server/utils/generation-submission'

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

  await runGenerationSubmission()
  return new Response(null, { status: 202 })
}
