---
description: 'Use when writing Vitest component tests, Playwright API/browser checks, or Nuxt test configuration.'
applyTo: 'apps/web/test/**,apps/web/vitest.config.ts,apps/web/playwright.config.ts'
---

# Testing

- Put Nuxt-runtime component tests in `test/nuxt`; use `mountSuspended` and reset
  hoisted mocks between cases. Assert behavior and cleanup, not implementation
  snapshots or Nuxt-generated cache keys.
- Put production API/browser tests in `test/e2e`. Vitest must not collect them.
  Playwright owns one built Node/Nitro server; keep `reuseExistingServer: false`.
- `playwright test` serves the existing `.output` and may not include source
  changes. For browser validation after source edits, run `pnpm test:e2e`, or run
  `pnpm build` immediately before invoking Playwright directly.
- Use the real API for happy paths; intercept only failure scenarios. Cover
  error recovery, keyboard access and desktop/mobile overflow. Do not use sleeps.
- Test business behavior and user flows, not authored copy, translations, branding
  or other static presentation. Assert state changes, navigation, enabled/disabled
  controls, emitted events, request effects and API contracts instead.
- Never use visible text, accessible names or text-content assertions to identify
  an element under test. Add a unique, stable `data-testid` only to the specific
  action or observable state that a test needs, then select it with the test ID.
  Do not add test IDs to untested presentation or use test IDs as styling hooks.
- Read the [product experience playbook](../../docs/product-experience-playbook.md)
  and [implementation plan](../../docs/implementation-plan.md) before adding
  milestone tests; do not test a deferred feature as though it were implemented.
- Tests/configs must pass `pnpm typecheck`, not merely transpile in a test runner.
  Failed browser runs retain traces and screenshots under ignored report paths.
- For implemented camera features, use the
  [required camera scenarios](../../docs/camera-and-initial-image-playbook.md).
  For provider features, use the
  [Leonardo constraints](../../docs/leonardo-integration-playbook.md).
  For database/jobs work, use the
  [persistence checklist](../../docs/prisma-data-and-jobs-playbook.md).
- Do not add empty future test suites or make live paid provider calls from CI.
  Node-output tests do not prove Netlify-specific behavior.
