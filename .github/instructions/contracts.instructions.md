---
description: 'Use when editing shared public API DTOs, response shapes, and client/server contract boundaries.'
applyTo: 'packages/contracts/**'
---

# Public Contracts

- This private workspace package exports types only. Use `import type` at both
  ends; do not introduce runtime helpers or import application/server code.
- Keep DTOs independent of persistence schemas and provider SDKs. No credentials,
  storage keys, provider IDs, or raw provider URLs belong in public responses.
- Read the [product experience playbook](../../docs/product-experience-playbook.md)
  and [implementation plan](../../docs/implementation-plan.md) before adding a
  product contract. Public picture IDs and private session capabilities are
  separate from internal persistence IDs.
- For image contracts, read the
  [upload contract](../../docs/camera-and-initial-image-playbook.md) and
  [generation lifecycle](../../docs/leonardo-integration-playbook.md).
  Public source/image/job handles are application-owned opaque identifiers.
- Change producer, consumer and real HTTP assertions together. Run
  `pnpm typecheck` and the relevant component and browser checks.
- Adding a DTO does not authorize implementing a deferred feature. Runtime
  validation belongs at trust boundaries when those endpoints are introduced.
