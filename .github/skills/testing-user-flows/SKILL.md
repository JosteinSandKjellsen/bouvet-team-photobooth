---
name: testing-user-flows
description: 'Create or update behavior-focused Nuxt and Playwright tests without coupling them to visitor-facing copy.'
---

# Testing User Flows

1. Read the applicable scoped testing instruction and the owning component,
   composable, route or API handler. Identify the behavior contract: a state
   change, emitted event, navigation, request effect, cleanup or API response.
2. Do not test authored strings, translations, branding or static layout text.
   Test the behavior the visitor can complete and its observable result instead.
3. For each element a test must drive or observe, add one stable, unique
   `data-testid` to that action or state. Use semantic IDs such as
   `capture-activate-camera` or `capture-approved`; do not use ordinal or
   copy-derived IDs. Add no ID for untested presentation.
4. Select browser and component-test elements only with their test ID. Do not
   use `getByText`, accessible-name matching, text-content assertions or generic
   tag/class selectors as test selectors. Preserve semantic HTML and accessible
   labels for visitors; the test ID is only a testing contract.
5. Run the narrowest affected component or browser test. Run `pnpm test:e2e`
   after application-flow changes and complete the relevant checks in
   [verify-change](../verify-change/SKILL.md) before handoff.
