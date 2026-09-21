---
description: 'Use when editing Nitro API handlers, server services, uploads, provider calls, persistence, or background jobs.'
applyTo: 'apps/web/server/**'
---

# Backend

- Use Nitro `defineEventHandler`; keep handlers thin once domain services exist.
  Return public DTOs from the contracts package, never database/provider objects.
- Validate untrusted input at runtime. Static TypeScript types are not validation.
  Authorize data access when introducing ownership-bearing features. Do not add
  auth or a database to the dependency-free liveness endpoint.
- Keep secrets in server-only runtime configuration. Sanitize errors and logs;
  do not expose source bytes, tokens, provider IDs or provider URLs to clients.
- Before implementing sessions, public results, or gallery reads, read the
  [product experience playbook](../../docs/product-experience-playbook.md) and
  [implementation plan](../../docs/implementation-plan.md). Authorize private
  session operations separately from public published-result reads.
- Before upload work, read the
  [camera/server validation rules](../../docs/camera-and-initial-image-playbook.md).
- Before paid generation or provider work, read the
  [Leonardo playbook](../../docs/leonardo-integration-playbook.md), including
  uncertain submissions, webhook authentication and unverified provider erasure.
- Before Prisma, jobs, object storage or retention work, read the
  [data and jobs playbook](../../docs/prisma-data-and-jobs-playbook.md).
  Keep external calls outside database transactions and SDKs in adapters.
- These future baselines do not authorize installing their dependencies now.
  Test the real HTTP contract, not only a mock response or a typed literal.
