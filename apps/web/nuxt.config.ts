export default defineNuxtConfig({
  compatibilityDate: '2026-09-20',
  modules: ['@nuxt/eslint'],
  devtools: { enabled: false },
  telemetry: false,
  typescript: {
    strict: true,
    nodeTsConfig: {
      include: [
        '../vitest.config.ts',
        '../playwright.config.ts',
        '../test/e2e/**/*.ts',
      ],
      compilerOptions: { types: ['node'] },
    },
  },
  nitro: { preset: 'node-server' },
  eslint: { config: { autoInit: false } },
  app: {
    head: {
      title: 'Bouvet Team Photobooth',
      htmlAttrs: { lang: 'en' },
      meta: [
        {
          name: 'description',
          content: 'Bouvet team photobooth service status.',
        },
      ],
    },
  },
})
