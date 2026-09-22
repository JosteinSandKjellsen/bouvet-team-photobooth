import type { Context } from '@netlify/functions'
import { runGenerationSubmission } from '../../server/utils/generation-submission'
import { runExpiredSourceCleanup } from '../../server/utils/source-cleanup'

export default async function jobSweep(_request: Request, _context: Context) {
  await runExpiredSourceCleanup()
  await runGenerationSubmission()
  return new Response(null, { status: 204 })
}
