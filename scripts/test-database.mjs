import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const getPnpmCommand = (platform) =>
  platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function main() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required')
  }

  const databaseName = new URL(testDatabaseUrl).pathname.slice(1)
  if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must target a database ending in _test')
  }

  const env = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    DIRECT_URL: testDatabaseUrl,
    NUXT_CLEANUP_WORKER_TOKEN: 'test-cleanup-worker-token',
    NUXT_SESSION_MAX_ACTIVE: '100',
    NUXT_SESSION_TTL_MS: '300000',
  }

  function runPnpm(args) {
    const result = spawnSync(getPnpmCommand(process.platform), args, {
      cwd: root,
      env,
      stdio: 'inherit',
    })

    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      return false
    }

    return true
  }

  if (
    runPnpm([
      '--filter',
      '@bouvet-team-photobooth/web',
      'exec',
      'prisma',
      'migrate',
      'deploy',
    ]) &&
    runPnpm(['build'])
  ) {
    runPnpm([
      '--filter',
      '@bouvet-team-photobooth/web',
      'exec',
      'playwright',
      'test',
      'test/e2e/sessions.spec.ts',
    ])
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main()
}
