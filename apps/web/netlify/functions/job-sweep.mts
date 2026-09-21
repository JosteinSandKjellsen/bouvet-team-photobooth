import type { Context } from '@netlify/functions'
import { runExpiredSourceCleanup } from '../../server/utils/source-cleanup'

export default async function jobSweep(_request: Request, _context: Context) {
  await runExpiredSourceCleanup()
  return new Response(null, { status: 204 })
}
