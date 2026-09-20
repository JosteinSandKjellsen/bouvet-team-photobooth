---
description: 'Use when editing Nuxt Vue components, frontend composables, async data states, accessibility, or camera UI.'
applyTo: 'apps/web/app/**'
---

# Frontend

- Use Vue `<script setup lang="ts">` and Nuxt composables. Use relative API URLs
  with `useFetch` for application data; handle pending, success, failure and retry.
- Keep browser-only APIs behind client lifecycle boundaries. The app remains SSR
  enabled; the diagnostic health request intentionally starts after hydration.
- Import public contracts from `@bouvet-team-photobooth/contracts` with
  `import type`. Never import server modules, credentials or persistence models.
- Use semantic controls, visible keyboard focus, live status announcements and
  responsive layouts. Use `@lucide/vue` icons, not bespoke SVG tool icons.
- For camera, countdown, preview, file-picker or compression work, first read the
  [camera playbook](../../docs/camera-and-initial-image-playbook.md). Its feature
  is deferred; do not request camera access as part of health-check work.
- Add behavior coverage alongside the
  [health component tests](../../apps/web/test/nuxt/HealthStatus.nuxt.spec.ts)
  and verify changed user flows in Playwright.
