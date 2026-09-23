const defaultIntervalMs = 2_000
const workerPaths = [
  '/api/internal/generation-submission',
  '/api/internal/source-cleanup',
]
const maxResponseDiagnosticLength = 1_000

export function getWorkerSettings(environment = process.env) {
  const origin =
    environment.LOCAL_GENERATION_WORKER_ORIGIN ??
    environment.NUXT_SESSION_ORIGIN ??
    'http://127.0.0.1:3000'
  const token = environment.NUXT_CLEANUP_WORKER_TOKEN
  const intervalValue =
    environment.LOCAL_GENERATION_WORKER_INTERVAL_MS ?? String(defaultIntervalMs)
  const intervalMs = Number(intervalValue)

  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('invalid protocol')
    }
  } catch {
    throw new Error('LOCAL_GENERATION_WORKER_ORIGIN must be an HTTP(S) URL')
  }

  if (!token) {
    throw new Error('NUXT_CLEANUP_WORKER_TOKEN is required')
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
    throw new Error(
      'LOCAL_GENERATION_WORKER_INTERVAL_MS must be an integer of at least 1000',
    )
  }

  return { intervalMs, origin: origin.replace(/\/$/, ''), token }
}

export async function runSweep(settings) {
  for (const path of workerPaths) {
    const startedAt = performance.now()
    const response = await fetch(`${settings.origin}${path}`, {
      headers: { Authorization: `Bearer ${settings.token}` },
      method: 'POST',
    })
    const durationMs = Math.round(performance.now() - startedAt)
    if (response.status !== 204) {
      const diagnostic = await getResponseDiagnostic(response, settings.token)
      throw new Error(
        formatWorkerRequestFailure({
          ...diagnostic,
          durationMs,
          path,
          status: response.status,
        }),
      )
    }
    console.info('Local generation worker request completed', {
      durationMs,
      method: 'POST',
      path,
      status: response.status,
    })
  }
}

async function getResponseDiagnostic(response, token) {
  const requestId =
    response.headers?.get?.('x-request-id') ??
    response.headers?.get?.('x-nf-request-id') ??
    undefined
  try {
    const body = await response.text?.()
    return {
      requestId,
      responseBody: body ? sanitizeDiagnostic(body, token) : undefined,
    }
  } catch {
    return { requestId }
  }
}

function sanitizeDiagnostic(value, token) {
  return value
    .replaceAll(token, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/https?:\/\/[^\s"']+/gi, '[url]')
    .replace(/\s+/g, ' ')
    .slice(0, maxResponseDiagnosticLength)
}

function formatWorkerRequestFailure({
  durationMs,
  path,
  requestId,
  responseBody,
  status,
}) {
  const details = [
    `Worker request failed: POST ${path} returned HTTP ${status} after ${durationMs}ms`,
  ]
  if (requestId) details.push(`requestId=${requestId}`)
  if (responseBody) details.push(`response=${responseBody}`)
  return details.join(' ')
}

async function main() {
  const settings = getWorkerSettings()
  let stopped = false
  let running = false

  const sweep = async () => {
    if (stopped || running) return

    running = true
    const startedAt = performance.now()
    console.info('Local generation worker sweep started', {
      origin: new URL(settings.origin).origin,
    })
    try {
      await runSweep(settings)
      console.info('Local generation worker sweep completed', {
        durationMs: Math.round(performance.now() - startedAt),
      })
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : 'Worker request failed',
      )
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void sweep(), settings.intervalMs)
  const stop = () => {
    stopped = true
    clearInterval(timer)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  await sweep()
  console.log(`Local generation worker sweeping ${settings.origin}`)
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Worker failed')
    process.exitCode = 1
  })
}
