import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3100)
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('E2E_PORT must be an integer between 1024 and 65535')
}
const captureGenerationEnabled = Boolean(process.env.TEST_DATABASE_URL)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './test/e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      'node --env-file-if-exists=../../.env ../../scripts/start-production-server.mjs',
    url: `${baseURL}/api/health`,
    env: {
      ...process.env,
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      NUXT_CAPTURE_GENERATION_ENABLED: String(captureGenerationEnabled),
      NUXT_LEONARDO_WEBHOOK_TOKEN: 'test-leonardo-webhook-token',
      NUXT_PUBLIC_CAPTURE_GENERATION_ENABLED: String(captureGenerationEnabled),
      NUXT_SESSION_MAX_ACTIVE: '100',
      NUXT_SESSION_ORIGIN: baseURL,
      NUXT_SESSION_TTL_MS: '300000',
      GENERATION_PROVIDER: 'deterministic',
      SOURCE_STORAGE_DIR: 'test-results/source-storage',
    },
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
