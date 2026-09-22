const defaultIntervalMs = 2_000

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
  for (const path of [
    '/api/internal/generation-submission',
    '/api/internal/source-cleanup',
  ]) {
    const response = await fetch(`${settings.origin}${path}`, {
      headers: { Authorization: `Bearer ${settings.token}` },
      method: 'POST',
    })
    if (response.status !== 204) {
      throw new Error(`Worker request failed with HTTP ${response.status}`)
    }
  }
}

async function main() {
  const settings = getWorkerSettings()
  let stopped = false
  let running = false

  const sweep = async () => {
    if (stopped || running) return

    running = true
    try {
      await runSweep(settings)
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
