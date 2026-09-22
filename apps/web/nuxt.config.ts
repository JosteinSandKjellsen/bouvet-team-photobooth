import { config } from 'dotenv'

config({
  path: new URL('../../.env', import.meta.url).pathname,
  quiet: true,
})

export default defineNuxtConfig({
  compatibilityDate: '2026-09-20',
  modules: ['@nuxt/eslint', '@nuxtjs/i18n'],
  devtools: { enabled: false },
  telemetry: false,
  runtimeConfig: {
    captureGenerationEnabled: false,
    cleanupWorkerToken: '',
    leonardoWebhookToken: '',
    sessionMaxActive: '',
    sessionOrigin: '',
    sessionTtlMs: '',
    public: {
      captureGenerationEnabled: false,
    },
  },
  typescript: {
    strict: true,
    nodeTsConfig: {
      include: [
        '../vitest.config.ts',
        '../playwright.config.ts',
        '../netlify/**/*.mts',
        '../test/e2e/**/*.ts',
      ],
      compilerOptions: { types: ['node'] },
    },
  },
  nitro: { preset: process.env.NETLIFY ? 'netlify' : 'node-server' },
  eslint: { config: { autoInit: false } },
  css: ['~/assets/css/tokens.css'],
  i18n: {
    defaultLocale: 'nb',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    locales: [{ code: 'nb', language: 'nb-NO', file: 'nb.json' }],
    vueI18n: './i18n.config.ts',
  },
  app: {
    head: {
      title: 'Bouvet Team Photobooth',
      htmlAttrs: { lang: 'nb-NO' },
      link: [
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: '/favicon.svg',
        },
      ],
      meta: [
        {
          name: 'description',
          content: 'Bouvet Team Photobooth.',
        },
      ],
    },
  },
})
