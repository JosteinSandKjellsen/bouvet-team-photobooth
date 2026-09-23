import assert from 'node:assert/strict'
import test from 'node:test'
import { getWorkerSettings, runSweep } from './run-local-generation-worker.mjs'

test('uses the local session origin and default sweep interval', () => {
  assert.deepEqual(
    getWorkerSettings({
      NUXT_CLEANUP_WORKER_TOKEN: 'worker-token',
      NUXT_SESSION_ORIGIN: 'http://127.0.0.1:3001/',
    }),
    {
      intervalMs: 2_000,
      origin: 'http://127.0.0.1:3001',
      token: 'worker-token',
    },
  )
})

test('rejects an unsafe worker configuration', () => {
  assert.throws(
    () =>
      getWorkerSettings({
        LOCAL_GENERATION_WORKER_ORIGIN: 'ssh://localhost:3000',
        NUXT_CLEANUP_WORKER_TOKEN: 'worker-token',
      }),
    /LOCAL_GENERATION_WORKER_ORIGIN/,
  )
  assert.throws(
    () =>
      getWorkerSettings({
        LOCAL_GENERATION_WORKER_ORIGIN: 'https://localhost:3000',
        LOCAL_GENERATION_WORKER_INTERVAL_MS: '999',
        NUXT_CLEANUP_WORKER_TOKEN: 'worker-token',
      }),
    /LOCAL_GENERATION_WORKER_INTERVAL_MS/,
  )
})

test('sweeps the protected generation and cleanup endpoints', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ options, url })
    return { status: 204, text: async () => '' }
  }

  try {
    await runSweep({
      intervalMs: 2_000,
      origin: 'http://127.0.0.1:3000',
      token: 'worker-token',
    })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.deepEqual(requests, [
    {
      options: {
        headers: { Authorization: 'Bearer worker-token' },
        method: 'POST',
      },
      url: 'http://127.0.0.1:3000/api/internal/generation-submission',
    },
    {
      options: {
        headers: { Authorization: 'Bearer worker-token' },
        method: 'POST',
      },
      url: 'http://127.0.0.1:3000/api/internal/source-cleanup',
    },
  ])
})

test('reports a failed endpoint response without exposing the worker token', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    headers: new Headers({ 'x-request-id': 'request-123' }),
    status: 500,
    text: async () =>
      'Database connection failed for Bearer worker-token at http://127.0.0.1:5432',
  })

  try {
    await assert.rejects(
      runSweep({
        intervalMs: 2_000,
        origin: 'http://127.0.0.1:3000',
        token: 'worker-token',
      }),
      (error) => {
        assert.match(
          error.message,
          /POST \/api\/internal\/generation-submission returned HTTP 500/,
        )
        assert.match(error.message, /requestId=request-123/)
        assert.match(error.message, /Bearer \[redacted\]/)
        assert.match(error.message, /\[url\]/)
        assert.doesNotMatch(error.message, /worker-token/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
