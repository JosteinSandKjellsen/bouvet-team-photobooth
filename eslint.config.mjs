import withNuxt from './apps/web/.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: [
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  {
    files: ['apps/web/app/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)server(/|$)|^#server|^#internal/nitro|^node:',
              message: 'Frontend code cannot import server-only modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(apps|server)(/|$)|^[@~#]|^node:',
              message:
                'Contracts must remain independent of application and server code.',
            },
          ],
        },
      ],
    },
  },
).override('nuxt/import-globals', { files: ['apps/web/**/*.{ts,vue}'] })
