---
name: implement-vertical-slice
description: 'Implement an end-to-end Nuxt feature or API-backed Vue screen, from acceptance criteria through shared contracts, Nitro, frontend states and regression tests.'
---

# Implement A Vertical Slice

1. Identify the requested behavior, active milestone and observable acceptance
   criteria. Do not implement future features merely because a playbook exists.
2. Read the owning code and its scoped instructions. For layouts, styling or copy,
   read the [design playbook](../../../docs/design-playbook.md) and use its screen
   patterns without treating mockup placeholders as product requirements.
   For camera/upload work,
   read the [camera playbook](../../../docs/camera-and-initial-image-playbook.md).
   For generation, read the [Leonardo playbook](../../../docs/leonardo-integration-playbook.md).
   For storage, Prisma or jobs, read the [data playbook](../../../docs/prisma-data-and-jobs-playbook.md).
   Stop and ask about conflicting requirements or unresolved feature gates.
3. Locate or add the smallest public contract in `packages/contracts`. Specify
   validation, authorization and failure behavior where relevant. Keep provider
   and persistence internals out of DTOs.
4. Add the Nitro producer and Vue consumer. Use relative API URLs and explicit
   loading, success, failure and recovery states. Avoid speculative abstractions.
5. Add the smallest behavior test, run it immediately, and repair that slice
   before expanding. Use the real API in the production happy-path test.
6. Run `pnpm check` and `pnpm test:e2e` for the completed application change.
   Update canonical guidance only when the agreed behavior actually changes.

Complete when the acceptance criteria are demonstrated. Report changed surfaces,
commands and actual results, and any unverified provider/platform requirements.
Never report that a model call, remote deployment or privacy gate passed without
observing it. Setup and command details: [development guide](../../../docs/development.md).
