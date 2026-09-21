---
description: 'Use when editing Nuxt Vue components, frontend composables, layouts, design tokens, UI copy, language files, localization, async data states, accessibility, camera UI, or Nuxt i18n configuration.'
applyTo: 'apps/web/app/**,apps/web/nuxt.config.ts'
---

# Frontend

- Before layout, styling or UI-copy work, read the
  [design playbook](../../docs/design-playbook.md). Follow its responsive screen
  patterns and visual checks; screenshots do not override product/privacy rules
  or authorize implementing a future milestone.
- Reuse or extend existing components in `apps/web/app/components` before creating
  new ones. Extract genuinely repeated UI/behavior; do not copy it between pages
  or create speculative abstractions. Follow the
  [component reuse rules](../../docs/design-playbook.md#component-reuse).
- Use the [central color and size tokens](../../docs/design-playbook.md#starting-tokens)
  from the planned `apps/web/app/assets/css/tokens.css` once UI work introduces it.
  Shared styles consume CSS variables instead of repeating color/size literals.
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

## Language Files

Introduce localization with the first product UI milestone, not as part of
documentation work. Use `@nuxtjs/i18n` with Vue I18n's Composition API (`useI18n`,
`t`, `n`, `d`), not a custom dictionary lookup or interpolation helper. Recheck
Nuxt compatibility and pin the dependency when implementing it.

### Catalog And Locale

- Start with one UTF-8 JSON catalog at `apps/web/i18n/locales/nb.json`, following
  the [Nuxt locale-file convention](https://i18n.nuxtjs.org/docs/guide/lazy-load-translations).
  It is the single source for authored visitor-facing text; do not duplicate
  messages in component-local dictionaries or inline `<i18n>` blocks.
- Use Norwegian Bokmal: locale code/default/fallback `nb`, language tag `nb-NO`.
  Keep browser-language detection disabled and use `strategy: 'no_prefix'`.
  There is no language picker, language preference cookie or `/nb` route variant.
  Preserve the four agreed user-facing routes and canonical public photo URLs.
- Ensure SSR and hydration use the same locale and the document has the correct
  Norwegian `lang` attribute. Do not initialize a second global i18n instance or
  rely on client-only locale selection.
- When the catalog is created, extend this instruction's `applyTo` with
  `apps/web/i18n/**` in the same change. Do not add an unmatched future glob now.

### Message Organization

- Use nested objects with stable English `camelCase` semantic keys, accessed by
  dotted paths such as `capture.review.title`. Do not use translated sentences,
  screen positions, numeric IDs or vague names such as `text1` as keys.
- Group by feature and then state/purpose: `themeSelection`, `capture.ready`,
  `capture.countdown`, `capture.review`, `capture.generating`, `capture.errors`,
  `photo.actions`, `photo.expired`, `overview`, `privacy` and `themes`.
  Add only namespaces needed by the implemented slice, not empty future groups.
- Reserve `common.actions` and `common.status` for text shared with the same
  meaning in multiple places. Identical words in different contexts may need
  different keys. Do not make `common`, `misc` or `general` a catch-all.
- Each key represents a complete message or label, including punctuation. Keep
  related keys together with consistent ordering; remove obsolete keys when
  their consumers are removed. Never append unrelated values at the root.
- Include headings, buttons, status/error/recovery messages, placeholders,
  validation feedback, tooltips, alt text, accessible names, live announcements
  and page titles. Brand names and runtime data are not translated message keys.
- Keep theme display names/descriptions under `themes.<themeKey>`. Use an explicit
  validated mapping from stable theme IDs/slugs to message keys; never translate
  route slugs. Artwork, provider prompts/settings and secrets remain in their
  existing configuration boundaries, not the public message catalog.

Illustrative subset, not a catalog to create during documentation work:

```json
{
  "common": {
    "actions": {
      "cancel": "Avbryt"
    }
  },
  "capture": {
    "countdown": {
      "announcement": "Bildet tas om {seconds}"
    },
    "review": {
      "title": "Ble bildet bra?",
      "actions": {
        "retake": "Ta bildet igjen",
        "usePicture": "Bruk bildet"
      }
    }
  },
  "overview": {
    "completedCount": "Ingen teambilder | Ett teambilde | {count} teambilder"
  }
}
```

### Rendering And Data Boundaries

- Use `t('capture.review.title')` in templates or reactive computed values. Use
  [named interpolation](https://vue-i18n.intlify.dev/guide/essentials/syntax.html)
  for dynamic values, for example `{ seconds }`. Do not concatenate translated
  fragments or insert values with string replacement.
- Use Vue I18n plural selection with a numeric count, for example
  `t('overview.completedCount', count)`, and locale-aware `n`/`d` formatting for
  numbers/dates. Keep formatting options centralized with i18n configuration;
  use an explicit application/event timezone for consistent server/client output.
- Store plain messages, not HTML, CSS classes, URLs or application logic. Use
  `i18n-t` with named component slots when a sentence includes a link/emphasis;
  never render translations or interpolated input with `v-html`.
- APIs return stable status/error codes and safe structured data, not localized
  sentences or arbitrary translation keys. Map known codes to catalog keys in
  the UI with a localized safe fallback for unknown codes; never show raw provider
  errors. Preserve existing API contracts unless the selected slice changes them.
- Keep catalog data out of the type-only contracts package. Derive message-key
  typing from the source catalog using the library's supported typing, rather
  than maintaining a second manual list of keys. Avoid unconstrained dynamic keys.

### Adding Copy And Verification

For each copy change, find the owning namespace and reuse an existing key only
when its meaning matches. Add the complete Norwegian message and named parameters,
update consumers together, and test the rendered result with the real catalog.

When localization is implemented, fail checks for missing referenced keys, invalid
message syntax and duplicate JSON keys. Exercise interpolation, zero/one/many
plurals, accessible labels, Norwegian formatting and SSR/hydration without raw
key output. Do not silence missing-key warnings or mask missing Norwegian copy
with English defaults. A mock returning the key is not localization coverage.

When another language is requested, add its catalog with the same leaf keys and
placeholder names, register the locale and check parity before enabling it.
Review long-text layouts and fallback behavior. A picker, browser detection and
localized URLs remain separate product decisions; do not add them preemptively.
