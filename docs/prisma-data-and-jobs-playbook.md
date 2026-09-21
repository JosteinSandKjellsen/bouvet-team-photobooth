# Prisma Data and Jobs Playbook

## Applicability

This is the approved future persistence and Netlify-first deployment baseline.
The initial health-check scaffold does not install Prisma, connect a database,
or deploy workers. Azure remains a future migration option. Read this together
with the [camera](./camera-and-initial-image-playbook.md) and
[Leonardo](./leonardo-integration-playbook.md) playbooks for image workflows.
Resolve conflicts before implementation and recheck dated external facts when
the relevant milestone begins.

Examples below belong to `apps/web`: run their pnpm commands there, or use
`pnpm --filter @bouvet-team-photobooth/web` from the repository root. Prisma,
Netlify, and database scripts shown here are future examples, not installed
scaffold functionality. The initial Node-server build used by Playwright is
separate from a future Netlify deployment build and does not validate Functions.

This document is a standalone greenfield implementation baseline for persistence in a Nuxt application. It is not a migration guide for an existing application. It covers PostgreSQL, Prisma ORM, CRUD operations, durable background jobs, image metadata, retention deletion, Netlify deployment, and a future move to Azure.

## 1. Decisions

Use these defaults unless a measured requirement justifies a change:

- Use PostgreSQL on every platform.
- Use Prisma ORM `7.10.0`, the latest stable release verified for this baseline.
- Pin `prisma`, `@prisma/client`, and `@prisma/adapter-pg` to the same exact version.
- Use the Node.js 24 LTS release line, with Node.js `24.15.0` as the minimum version for local development, CI, Netlify builds, and Netlify Functions.
- Run Prisma only in a Node.js runtime, never in an edge runtime or browser bundle.
- Put image bytes in object storage. PostgreSQL stores keys, metadata, state, and ownership only.
- Treat PostgreSQL as the durable source of truth for jobs, retries, leases, and idempotency.
- Keep Nuxt routes, Netlify Functions, and Azure Functions as thin adapters around shared services.
- Use a pooled runtime connection and a direct migration connection.
- Instantiate one Prisma client per warm process and do not call `$disconnect()` after each request.
- Never run migrations from a request handler, background worker, or application startup hook.
- Do not adopt Prisma Accelerate for a new application because it is scheduled for retirement on December 1, 2026.

Prisma ORM 8 is currently published as a release candidate, not a stable production release. Re-evaluate it after general availability and after the application test suite passes against it.

## 2. Target architecture

```mermaid
flowchart LR
    Browser --> Nuxt[Nuxt server routes]
    Nuxt --> Services[Domain services]
    Worker[Job worker adapter] --> Services
    Scheduler[Scheduler adapter] --> Services
    Services --> Prisma[Prisma data access]
    Prisma --> Pooler[PostgreSQL pooler]
    Pooler --> Postgres[(PostgreSQL)]
    Services --> Objects[Object storage adapter]
    Services --> Provider[External image provider]
    Nuxt -. best-effort wake-up .-> Worker
    Scheduler -. sweeps queued jobs .-> Worker
```

The platform-specific surface is deliberately small:

```ts
export interface ObjectStore {
  put(
    key: string,
    body: Uint8Array,
    metadata: Record<string, string>,
  ): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  delete(key: string): Promise<void>
}

export interface JobNotifier {
  notify(jobId: string): Promise<void>
}
```

`ObjectStore.delete` must be idempotent: deleting an object that is already absent is successful. `JobNotifier.notify` is only a wake-up optimization. A scheduled database sweep must eventually find every queued job even when notification fails.

These interfaces are illustrative. Extend the storage contract with the
metadata, consistency, and bounded ingestion behavior required by the Leonardo
workflow when implementing it; do not treat these examples as a complete SDK.

Initial adapters:

- Netlify Blobs implements `ObjectStore`.
- A Netlify Background Function and Scheduled Function implement worker wake-up and sweeping.

Azure adapters:

- Azure Blob Storage implements `ObjectStore`.
- Azure Functions queue and timer triggers implement worker wake-up and sweeping.

No repository or domain service should import a Netlify or Azure SDK.

## 3. Version and package policy

This compatibility baseline was verified on September 15, 2026:

| Component            | Baseline   | Node.js requirement                       |
| -------------------- | ---------- | ----------------------------------------- |
| Node.js              | `24.x` LTS | `>=24.15.0 <25`                           |
| Nuxt                 | `4.5.2`    | 22: `>=22.19.0`; 24: `>=24.11.0`; 26: any |
| Prisma ORM           | `7.10.0`   | 20: `>=20.19.0`; 22: `>=22.12.0`; 24: any |
| `@netlify/functions` | `6.0.0`    | `>=22.12.0`                               |
| `@netlify/nuxt`      | `1.0.1`    | `>=22.12.0`                               |
| `@netlify/blobs`     | `11.1.0`   | `>=22.12.0`                               |
| `dotenv`             | `17.4.2`   | `>=12.0.0`                                |

Node.js 24 is the common supported LTS line. Do not use Node.js 26 for this baseline while it is a Current release rather than an LTS release. Keep the application on one Node.js major version and re-evaluate the matrix before changing it.

Declare the supported range in `package.json`:

```json
{
  "engines": {
    "node": ">=24.15.0 <25"
  }
}
```

The scaffold uses root `.nvmrc` containing `24` and `engineStrict: true` in
`pnpm-workspace.yaml` so pnpm 12 rejects an unsupported runtime. Non-registry
settings no longer belong in `.npmrc`. At the Netlify
milestone, add root `.node-version` containing the same major and check both
selectors for drift. Netlify resolves that major to an available patch. Verify
the minimum engine version locally, in CI, and in hosted builds; do not rely on
the platform build-image default.

Install matching stable packages:

```bash
pnpm add --save-exact @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 @netlify/blobs@11.1.0 @netlify/functions@6.0.0 dotenv@17.4.2 pg
pnpm add --save-dev --save-exact prisma@7.10.0 @netlify/nuxt@1.0.1 @types/pg
```

Use exact versions rather than `latest` or a caret range for the Prisma and Netlify integration packages, and commit the package-manager lockfile. Upgrade the three Prisma packages together in a dedicated pull request that runs schema validation, generation, integration tests, and a deployment smoke test.

At each planned upgrade:

1. Check the Prisma release page and all npm distribution tags. Do not assume the `latest` tag is a generally available release.
2. Reject alpha, beta, release-candidate, and `next` versions for production.
3. Review breaking changes and Node.js requirements.
4. Upgrade the CLI, client, and adapter together.
5. Generate the client and run tests against a real PostgreSQL instance.
6. Verify both the Netlify and Azure-compatible builds.

## 4. Prisma 7 setup

### Schema generator

Prisma 7 uses the `prisma-client` generator. The output path is required. The older `prisma-client-js` generator is deprecated.

```prisma
// prisma/schema.prisma

generator client {
  provider     = "prisma-client"
  output       = "../server/generated/prisma"
  runtime      = "nodejs"
  moduleFormat = "esm"
}

datasource db {
  provider = "postgresql"
}
```

Generate the client during development and before the Nuxt build:

```json
{
  "scripts": {
    "db:generate": "prisma generate",
    "db:validate": "prisma validate",
    "db:require-direct": "node --env-file-if-exists=.env -e \"if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is required')\"",
    "db:migrate:dev": "pnpm db:require-direct && prisma migrate dev && prisma generate",
    "db:migrate:deploy": "pnpm db:require-direct && prisma migrate deploy",
    "build": "prisma generate && nuxt build"
  }
}
```

Prisma 7 no longer generates the client automatically after `migrate dev`, so keep the explicit `prisma generate` step.

### Prisma configuration

Use the direct database endpoint for schema operations and migrations:

```ts
// prisma.config.ts
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

const schemaUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!schemaUrl) {
  throw new Error('DIRECT_URL or DATABASE_URL is required')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: schemaUrl,
  },
})
```

`DIRECT_URL` takes precedence for local schema commands and the dedicated CI migration stage. The `DATABASE_URL` fallback lets a Netlify build load this configuration for `prisma generate` without giving the build process the privileged migration credential. Never run `prisma migrate deploy` unless `DIRECT_URL` is explicitly present in that migration job.

Use two secrets:

```dotenv
# Application traffic through PgBouncer or another managed pooler.
DATABASE_URL="postgresql://app:secret@pooler.example:6432/app?sslmode=require"

# CI migration traffic directly to PostgreSQL.
DIRECT_URL="postgresql://migrator:secret@database.example:5432/app?sslmode=require"
```

Local development may use the same endpoint for both values. Production should use separate database roles:

- The runtime role can select, insert, update, and delete application rows.
- The migration role can change the schema.
- The runtime role must not own the schema or have migration privileges.

### Shared Prisma client

Create the client at module scope so a warm serverless process can reuse it:

```ts
// server/utils/db.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const adapter = new PrismaPg({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX ?? '3'),
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
})

export const db = new PrismaClient({ adapter })
```

Start with a client-side pool maximum of `1` to `3` per process when a server-side pooler is present. Calculate the total connection budget across all possible function instances and workers before increasing it. Monitor active and waiting connections rather than guessing.

Do not:

- create a new client inside every route handler;
- call `db.$disconnect()` after every invocation;
- import the server client from Vue components or shared browser code;
- open interactive transactions around provider or object-storage calls.

## 5. Baseline data model

This model supports source uploads, image generations, application-owned output IDs, storage retention, and durable work.

It is an illustrative starting point, not a production-ready authorization or
cleanup schema. Before implementing it, model actor ownership, retained cleanup
identifiers and remote-deletion capability state required by the Leonardo
playbook. Choose the authentication and retention policies explicitly rather
than inferring them from this example.

```prisma
// prisma/schema.prisma

enum AssetStatus {
  ACTIVE
  DELETE_PENDING
  DELETED
}

enum GenerationStatus {
  PENDING
  SUBMITTED
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELLED
}

enum JobKind {
  GENERATE_IMAGE
  POLL_GENERATION
  INGEST_GENERATED_IMAGE
  DELETE_SOURCE_IMAGE
  DELETE_GENERATED_IMAGE
}

enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  CANCELLED
}

model SourceImage {
  id               String            @id @default(uuid()) @db.Uuid
  storageKey       String            @unique
  providerSourceId String?           @unique
  contentType      String
  byteSize         Int
  width            Int
  height           Int
  status           AssetStatus       @default(ACTIVE)
  deleteAfter      DateTime          @db.Timestamptz(3)
  deletedAt        DateTime?         @db.Timestamptz(3)
  createdAt        DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime          @updatedAt @db.Timestamptz(3)
  generations      ImageGeneration[]

  @@index([status, deleteAfter])
}

model ImageGeneration {
  id                   String             @id @default(uuid()) @db.Uuid
  idempotencyKey       String             @unique
  sourceImageId        String             @db.Uuid
  sourceImage          SourceImage        @relation(fields: [sourceImageId], references: [id], onDelete: Restrict)
  modelId               String
  status                GenerationStatus   @default(PENDING)
  providerGenerationId String?            @unique
  errorCode             String?
  errorMessage          String?            @db.Text
  completedAt           DateTime?          @db.Timestamptz(3)
  createdAt             DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime           @updatedAt @db.Timestamptz(3)
  generatedImages      GeneratedImage[]

  @@index([sourceImageId])
  @@index([status, updatedAt])
}

model GeneratedImage {
  id           String          @id @default(uuid()) @db.Uuid
  publicId     String          @unique
  generationId String          @db.Uuid
  generation   ImageGeneration @relation(fields: [generationId], references: [id], onDelete: Restrict)
  storageKey   String          @unique
  contentType  String
  byteSize     Int
  width        Int
  height       Int
  status       AssetStatus     @default(ACTIVE)
  deleteAfter  DateTime        @db.Timestamptz(3)
  deletedAt    DateTime?       @db.Timestamptz(3)
  version      Int             @default(0)
  createdAt    DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime        @updatedAt @db.Timestamptz(3)

  @@index([generationId])
  @@index([status, deleteAfter])
}

model BackgroundJob {
  id               String     @id @default(uuid()) @db.Uuid
  kind             JobKind
  status           JobStatus  @default(QUEUED)
  aggregateId      String     @db.Uuid
  idempotencyKey   String     @unique
  payload          Json?
  attempt          Int        @default(0)
  maxAttempts      Int        @default(5)
  nextAttemptAt    DateTime   @default(now()) @db.Timestamptz(3)
  leaseOwner       String?
  leaseExpiresAt   DateTime?  @db.Timestamptz(3)
  lastErrorCode    String?
  lastErrorMessage String?    @db.Text
  completedAt      DateTime?  @db.Timestamptz(3)
  createdAt        DateTime   @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime   @updatedAt @db.Timestamptz(3)

  @@index([status, nextAttemptAt, createdAt])
  @@index([status, leaseExpiresAt])
  @@index([kind, aggregateId])
}
```

Rules for this schema:

- `GeneratedImage.id` is an internal persistence ID. `GeneratedImage.publicId`
  is a separately generated opaque public lookup ID with at least 128 bits of
  entropy; neither is a provider ID.
- Provider IDs and provider URLs are internal and must never become public identifiers.
- `storageKey` is an object key, not a public URL.
- `BackgroundJob.payload` contains small non-secret inputs only. Store large data in object storage and reference it by key.
- `aggregateId` identifies the domain row targeted by the job. The worker validates that the row exists and matches `kind`.
- `idempotencyKey` represents one logical effect, not one invocation.
- Store all times in UTC.
- Use `Restrict` by default. Add cascade deletion only when deletion of the parent must always and unconditionally delete its children.

## 6. CRUD patterns

Validate authorization and input before calling these functions. Never pass an HTTP request body directly into Prisma `data`.

### Add a row

```ts
const source = await db.sourceImage.create({
  data: {
    storageKey,
    contentType,
    byteSize,
    width,
    height,
    deleteAfter,
  },
  select: {
    id: true,
    deleteAfter: true,
  },
})
```

Use `createMany` for independent batches. Use a unique constraint plus `upsert` when repeated requests must converge on one row.

### Read a row

```ts
const image = await db.generatedImage.findFirst({
  where: {
    id: imageId,
    status: 'ACTIVE',
    deletedAt: null,
  },
  select: {
    id: true,
    storageKey: true,
    contentType: true,
    byteSize: true,
    width: true,
    height: true,
    deleteAfter: true,
    version: true,
  },
})
```

Always use `select` for public-facing reads. Never return `storageKey`, provider IDs, error details, or job payloads directly to a browser.

### Update a row

For an administrative update where concurrent edits are not meaningful, use `update` with a unique key:

```ts
await db.generatedImage.update({
  where: { id: imageId },
  data: { deleteAfter: validatedDeleteAfter },
})
```

For a read-modify-write flow, use optimistic concurrency control:

```ts
const result = await db.generatedImage.updateMany({
  where: {
    id: imageId,
    status: 'ACTIVE',
    version: expectedVersion,
  },
  data: {
    deleteAfter: validatedDeleteAfter,
    version: { increment: 1 },
  },
})

if (result.count !== 1) {
  throw new Error('Image was deleted or changed by another request')
}
```

`updateMany` is intentional here: it performs a compare-and-set and reports whether the state transition won. A plain read followed by `update` can overwrite a concurrent change.

### Request deletion

Deletion of a row that owns an object is a workflow, not a single SQL statement:

1. Atomically change `ACTIVE` to `DELETE_PENDING` and enqueue a deletion job.
2. Delete the object outside the database transaction.
3. Mark the row `DELETED` and set `deletedAt`.
4. Hard-delete tombstones later, after the recovery and audit window.

```ts
await db.$transaction(async (tx) => {
  const changed = await tx.generatedImage.updateMany({
    where: {
      id: imageId,
      status: 'ACTIVE',
      version: expectedVersion,
    },
    data: {
      status: 'DELETE_PENDING',
      version: { increment: 1 },
    },
  })

  if (changed.count !== 1) {
    throw new Error('Image was deleted or changed by another request')
  }

  await tx.backgroundJob.create({
    data: {
      kind: 'DELETE_GENERATED_IMAGE',
      aggregateId: imageId,
      idempotencyKey: `delete-generated-image:${imageId}`,
    },
  })
})
```

The transaction contains database operations only. The worker performs object deletion after it commits.

### Hard-delete a row

Only delete rows that are already confirmed as deleted:

```ts
const result = await db.generatedImage.deleteMany({
  where: {
    id: imageId,
    status: 'DELETED',
    deletedAt: { lt: tombstoneCutoff },
  },
})

if (result.count !== 1) {
  throw new Error('Image is not eligible for hard deletion')
}
```

For cleanup batches, select at most a fixed number of eligible IDs, then delete by those IDs. Never use an unbounded `deleteMany({})` in application code.

## 7. Transactions and idempotency

Use the smallest mechanism that preserves the invariant:

- Nested writes for related rows created together.
- `createMany`, `updateMany`, or `deleteMany` for one-model batches.
- `$transaction([])` for independent writes with precomputed IDs.
- A short interactive `$transaction` for conditional database-only logic.
- Unique constraints and optimistic concurrency for retryable APIs.

Never call Leonardo, email, object storage, Netlify, or Azure from inside a database transaction. A transaction holds a database connection while it waits and cannot roll back an external side effect.

When serializable isolation is necessary, catch Prisma error `P2034` and retry the entire short transaction a bounded number of times with jitter. Do not retry validation errors, authorization failures, unique conflicts that indicate different input, or other permanent failures.

A generation request should have an application idempotency key tied to the
authenticated actor and normalized request. Reusing a key with different input
is a conflict. A unique `ImageGeneration.idempotencyKey` prevents duplicate
logical rows, not exactly-once external paid generation. Follow the Leonardo
submission protocol: reconcile uncertain acceptance or hold it for explicit
review rather than resubmitting automatically.

## 8. Durable job protocol

Platform retries are delivery hints. The `BackgroundJob` row is authoritative.

### Enqueue

Create the domain transition and job row in one short database transaction. Commit first, then call `JobNotifier.notify(job.id)` as a best-effort wake-up. If notification fails, leave the job queued; the scheduler will find it.

### Claim with a lease

A worker may read a candidate and then use `updateMany` as a compare-and-set. Only one concurrent worker can change the row from `QUEUED` to `RUNNING`.

```ts
const LEASE_MS = 2 * 60_000

export async function claimNextJob(leaseOwner: string) {
  for (let pass = 0; pass < 3; pass += 1) {
    const now = new Date()
    const candidate = await db.backgroundJob.findFirst({
      where: {
        status: 'QUEUED',
        nextAttemptAt: { lte: now },
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    })

    if (!candidate) return null

    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS)
    const claimed = await db.backgroundJob.updateMany({
      where: {
        id: candidate.id,
        status: 'QUEUED',
        nextAttemptAt: { lte: now },
      },
      data: {
        status: 'RUNNING',
        leaseOwner,
        leaseExpiresAt,
        attempt: { increment: 1 },
      },
    })

    if (claimed.count === 1) {
      return db.backgroundJob.findUniqueOrThrow({
        where: { id: candidate.id },
      })
    }
  }

  return null
}
```

The lease owner should include the platform invocation ID and a random suffix. Renew a lease only when work can exceed half the lease duration. Completion, heartbeat, and failure updates must match both `id` and `leaseOwner`.

### Complete

```ts
const completed = await db.backgroundJob.updateMany({
  where: {
    id: job.id,
    status: 'RUNNING',
    leaseOwner,
    leaseExpiresAt: { gt: new Date() },
  },
  data: {
    status: 'SUCCEEDED',
    completedAt: new Date(),
    leaseOwner: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  },
})

if (completed.count !== 1) {
  throw new Error('Job lease was lost before completion')
}
```

If the lease is lost, the old worker must not write success. Every external operation must also be idempotent because a worker can stop after the external effect but before recording completion.

### Retry or fail

Classify errors before rescheduling:

- Retry timeouts, rate limits, transient provider errors, temporary database failures, and temporary storage failures.
- Exception: a timeout or expired lease after a paid generation submission may
  have an unknown outcome. Reconcile through a confirmed provider mechanism or
  hold for review; do not resubmit based solely on the job retry policy.
- Fail immediately for invalid input, unsupported models, missing required source data, authentication failures, and other permanent errors.
- Respect provider `Retry-After` values when present.
- Otherwise use capped exponential backoff with jitter.
- Change the job to `FAILED` when `attempt >= maxAttempts`.
- Truncate stored error messages and never store secrets or full provider responses.

For a retry, move the row back to `QUEUED`, set `nextAttemptAt`, clear the lease, and retain the last safe error summary. Use a compare-and-set that matches the current lease owner.

### Recover expired leases

A scheduled sweep must:

1. Mark expired `RUNNING` jobs with exhausted attempts as `FAILED`.
2. Return other expired `RUNNING` jobs to `QUEUED` with a future `nextAttemptAt`.
3. Clear their lease fields.
4. Process a bounded batch and stop before the platform timeout.

A late worker cannot complete after expiry because the completion predicate requires an unexpired matching lease.

## 9. Image retention and deletion

### Generated images

A scheduled retention sweep selects a bounded batch where:

```text
status = ACTIVE AND deleteAfter <= now
```

For each row, use the deletion transaction in section 6. The idempotency key ensures only one deletion job exists.

The deletion worker:

1. Re-reads the image.
2. Stops without deleting when `deleteAfter` was extended or status returned to `ACTIVE` through an approved recovery flow.
3. Deletes the object through `ObjectStore`.
4. Treats an already-missing object as success.
5. Changes `DELETE_PENDING` to `DELETED` and records `deletedAt`.
6. Completes the job.

If object deletion succeeds and the database update fails, retrying is safe because object deletion is idempotent.

### Source images

Use the same state machine for application-owned source objects. Provider-side deletion is separate from application storage deletion and must only be implemented when the provider publishes and verifies a supported delete operation.

Release temporary upload buffers after transfer, but keep durable source
objects needed by generation until output ingestion succeeds. Define bounded
failure and abandonment retention before implementing these workflows. Neither
local deletion nor using a source URL proves provider-side erasure.

Public result and gallery reads resolve only a published, unexpired `publicId`;
they do not require a private session capability. Upload, generation, retry, and
status operations remain separately authorized through the private anonymous
session. Record the current-event completed-picture aggregate independently of
expiring `GeneratedImage` rows, incrementing it exactly once after durable
publication and never decrementing it during retention cleanup.

Do not hard-delete a `SourceImage` while an `ImageGeneration` still references it. Retain metadata longer than the object when audit or support workflows require it.

### Tombstone cleanup

Hard-delete `DELETED` rows only after a configured tombstone period. Delete children before parents and use short bounded batches. Retain failed job records according to an operational audit policy, then remove them in a separate cleanup task.

## 10. Netlify deployment

### Runtime and build contract

Build Nuxt with Nitro's `netlify` preset so Nuxt server routes run in Netlify Node Functions. Netlify auto-detects Nitro during a hosted build. Keep `dist` as the publish directory and do not select the `netlify_edge` preset for this application because that would move the Nuxt server into the Deno-based Edge Functions runtime.

Use `@netlify/nuxt` for local access to Netlify platform primitives from `nuxt dev`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@netlify/nuxt'],
})
```

The module does not make Node-only packages edge-compatible. Keep standalone background and scheduled adapters in the default `netlify/functions` directory, outside the `dist` publish directory. Name their entry files `job-worker.mts` and `job-sweep.mts` to match the configuration below. Nitro owns its generated internal functions; do not point the user-functions directory at generated Nitro output.

Use the modern Netlify Functions API: a default export that accepts web-standard `Request` and Netlify `Context` values and returns `Response` where a response is applicable. Do not start a greenfield application with the deprecated AWS Lambda compatibility handler signature. Netlify has announced that deploys containing Lambda compatibility mode functions will no longer be accepted on or after July 1, 2027.

Use this baseline configuration:

```toml
# netlify.toml
[build]
  command = "pnpm build"
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[functions."job-worker"]
  background = true

[functions."job-sweep"]
  schedule = "*/10 * * * *"
```

The `background = true` property is preferred for new functions; the older `-background` filename suffix remains supported but should not be the baseline. A schedule may instead be exported in a TypeScript function's `config`, but define it in only one place. Schedules use UTC.

The `.node-version` file controls the Netlify build. A valid build version normally becomes the Functions runtime version as well. Node.js 24 is a valid AWS Lambda runtime and therefore resolves to the Node.js 24 Functions runtime. If a build uses a Node release that is not an eligible AWS Lambda runtime, Netlify falls back to Node.js 24 for Functions. If the runtime must be pinned independently, set `AWS_LAMBDA_JS_RUNTIME=nodejs24.x` through the Netlify UI, CLI, or API and redeploy; Netlify does not accept that setting from `netlify.toml`. Confirm both the build version and Functions runtime in deploy logs after every Node upgrade.

Do not set `NODE_ENV=production` as a Netlify build environment variable. Netlify would omit `devDependencies` during installation, including the Prisma CLI and `@netlify/nuxt` used by this baseline. Nuxt still produces a production build through `nuxt build`.

Scope environment variables as follows:

- Make the pooled, least-privilege `DATABASE_URL` available to Builds and Functions. The build needs it while loading `prisma.config.ts` for client generation; never expose it through Nuxt public runtime configuration or a `NUXT_PUBLIC_` variable.
- Make provider credentials and internal wake-up secrets available to Functions only unless a documented build step needs them.
- Keep `DIRECT_URL` out of Netlify. Provide it only to the dedicated CI/CD migration job.
- Store production values in Netlify environment variables, not in committed `.env` files or `netlify.toml`.

Review every build plugin because variables scoped to Builds are available to the build process.

### Workload placement

Run Prisma, `pg`, image processing libraries such as Sharp, and all domain services in Node Functions only. Use the platform as follows:

- Nuxt server route: validate requests, create domain and job rows, send a best-effort wake-up, and return quickly.
- Background Function: process a supplied `jobId` or claim queued jobs for a bounded duration.
- Scheduled Function: recover leases, enqueue retention work, and wake queued jobs.
- Netlify Blobs site-wide store: persist source and generated image bytes across deploys.
- PostgreSQL: store all durable state.

Treat every direct HTTP invocation of the background worker as untrusted. Require an internal bearer or HMAC credential for the wake-up endpoint, validate the `jobId` format, and re-read the authoritative job row before doing work. The scheduled database sweep remains the correctness mechanism if an authenticated wake-up is lost.

Edge Functions run on Deno rather than Node.js. They have a 20 MB compressed code limit, 512 MB memory for the deployed set, 50 ms CPU time per request, and a 40-second response-header timeout. Use them only for small request-layer concerns such as redirects, geolocation, or lightweight rate limiting. Do not import Prisma, `pg`, Sharp, the generated Prisma client, or database-backed domain services into an Edge Function.

### Fixed platform limits

Account for these Netlify constraints:

- Synchronous Functions have a non-configurable 60-second execution limit.
- Background Functions have a 15-minute execution limit and return `202` immediately.
- Background Function payloads are limited to 256 KB, so send only a job ID and correlation data.
- Background Functions retry failures after one minute and then two minutes. The database attempt count remains authoritative.
- Background Functions are available on credit-based plans, including Free, Personal, and Pro, and on Enterprise; confirm that expected execution fits the selected plan's usage and billing model.
- Scheduled Functions have a 30-second execution limit and cannot receive caller-supplied payloads or POST data. Netlify supplies a JSON body containing `next_run`. Schedules run automatically only on published deploys; Deploy Previews and branch deploys require a manual **Run now** invocation.
- Scheduled Functions are enabled on all current Netlify plans.
- Buffered request and response payloads are limited to 6 MB. Binary request bodies are base64 encoded internally, reducing the effective binary limit to about 4.5 MB.
- Streamed responses are limited to 20 MB.
- Function memory defaults to 1024 MB. Memory from 1024 MB through 4096 MB, or the corresponding 0.5 through 2 vCPU, is configurable only on eligible credit-based Pro and Enterprise plans and increases cost.
- Functions default to the `cmh` region in Ohio. Function region selection is available on Pro and Enterprise plans; co-locate Functions and PostgreSQL when latency or data-processing requirements justify it.

A scheduled function is a dispatcher and recovery sweep, not the place for long image generation. It must process bounded pages and stop with time to commit its final database updates.

Reject uploads before they reach a Function when the processed image and
multipart envelope could exceed the effective binary request limit. Use a
conservative 4,000,000-byte total multipart request budget, not 4 MiB. Subtract
actual fields/envelope overhead to obtain the image allowance, then apply any
lower provider limit and compress with headroom. The camera playbook's original
20 MiB input ceiling is browser-side only. Larger uploads would require a
separately approved direct-upload architecture. A Blob storage limit does not
override Function ingress limits.

Netlify Blobs is eventually consistent by default. New blobs become globally available immediately; updates and deletions are guaranteed to propagate to all edge locations within 60 seconds. Use strong consistency only for reads that require it. The database state remains authoritative for whether an image is publicly available, so every image-serving route must reject non-`ACTIVE` records before reading the blob.

Use a site-wide Blob store, not a deploy-specific store, for durable application images. Site-wide stores are shared with Deploy Previews and branch deploys, so previews must not run production deletion jobs; use a separate Netlify project or isolated store names for non-production environments. Do not scan Blob storage for retention candidates: `list()` automatically follows all pages by default and can become unbounded. Select bounded candidates from PostgreSQL and operate on known object keys.

Netlify Blobs and Edge Functions are not currently supported as part of Netlify's HIPAA-compliant hosting offering. If HIPAA or another regulated workload is in scope, confirm the complete architecture, region, data-processing terms, and selected Netlify plan before implementation; selecting a Function region alone is not proof of data residency or regulatory compliance.

### Deployment verification

For each release candidate:

1. Install and test under the Node.js version selected by `.node-version`.
2. Run `prisma validate`, `prisma generate`, type checking, tests, and `nuxt build`.
3. Run the application through `nuxt dev` with `@netlify/nuxt`, then test the native functions with Netlify's local function tooling where needed.
4. Inspect the deploy summary and Functions page. Confirm the Nuxt server and job adapters deploy as Node Functions, `job-worker` is marked as background, and `job-sweep` is marked as scheduled.
5. Invoke the scheduled function with **Run now** and submit a test job. Verify enqueue, `202` wake-up, claim, completion, retry, and lease recovery in logs and PostgreSQL.
6. Smoke-test image upload, processing, read, and deletion in the Linux production runtime, including any native image-processing dependency.

## 11. Azure migration path

Keep the Prisma schema provider as `postgresql`. Move the database to Azure Database for PostgreSQL Flexible Server rather than changing to Azure SQL, which would require provider and migration changes.

Recommended Azure mapping:

| Current responsibility | Netlify                       | Azure target                                  |
| ---------------------- | ----------------------------- | --------------------------------------------- |
| Nuxt application       | Netlify Nuxt/Nitro            | Azure App Service or Azure Container Apps     |
| Background execution   | Background Function           | Azure Functions queue trigger                 |
| Scheduled sweep        | Scheduled Function            | Azure Functions timer trigger                 |
| Object storage         | Netlify Blobs                 | Azure Blob Storage                            |
| Database               | Pooled PostgreSQL             | Azure Database for PostgreSQL Flexible Server |
| Logs and metrics       | Netlify logs/provider         | Application Insights and Azure Monitor        |
| Secrets                | Netlify environment variables | Managed identity and Key Vault references     |

For Azure Functions, use the Node.js v4 programming model. Function triggers call the same job services used on Netlify. Queue messages carry a `jobId`, not the whole job payload. Assume duplicate and out-of-order delivery.

Azure Database for PostgreSQL Flexible Server provides built-in PgBouncer on port `6432` for General Purpose and Memory Optimized tiers. It is not available on the Burstable tier. Use:

- port `6432` for `DATABASE_URL` after testing Prisma and prepared-statement compatibility;
- port `5432` for the migration `DIRECT_URL`;
- TLS for every connection;
- pool metrics and alerts for active, waiting, idle, and total connections.

Prefer managed identity for Azure SDK access to Blob Storage and Key Vault. If database authentication remains password-based, expose the secret through a Key Vault reference and rotate it. Adopt Microsoft Entra authentication for PostgreSQL only after testing token acquisition and refresh across warm Prisma pools.

Co-locate the application, functions, object storage, and database in the same Azure region when possible. Use private networking where operationally justified, but preserve a reproducible local and CI connection path.

## 12. Migrations and deployment safety

Development workflow:

```bash
pnpm exec prisma migrate dev --name descriptive_change
pnpm exec prisma generate
pnpm exec prisma validate
```

Production workflow:

1. Build and test the exact release artifact.
2. Run `prisma migrate deploy` once from a dedicated CI/CD migration stage using `DIRECT_URL` and the migration role.
3. Deploy application and worker code after migrations succeed.
4. Run a read/write health check that does not expose secrets.

Do not run `migrate dev`, `db push`, or `migrate reset` in production. Do not modify an applied migration. Commit `prisma/migrations` to source control.

Use expand-and-contract migrations for changes that span deployments:

1. Add nullable columns, new tables, or compatible indexes.
2. Deploy code that can read old and new shapes.
3. Backfill in bounded, restartable jobs.
4. Switch reads and writes to the new shape.
5. Remove old columns or constraints in a later release.

Large PostgreSQL index changes may need a reviewed custom migration using `CREATE INDEX CONCURRENTLY`. Test rollback and recovery procedures before a production migration, even though Prisma Migrate does not generate automatic down migrations.

## 13. Security and privacy

- Keep database URLs and provider credentials out of source control, logs, job payloads, and client responses.
- Use separate least-privilege runtime and migration roles.
- Require TLS for remote PostgreSQL connections.
- Validate authorization in the service layer for every read, update, and deletion.
- Return application IDs only; never reveal sequential internal data or storage keys.
- Avoid storing image bytes, base64 strings, signed URLs, access tokens, or raw webhook bodies in PostgreSQL.
- Apply retention rules to prompts, provider errors, source metadata, jobs, and logs, not only image objects.
- Redact connection strings and query parameters from errors.
- Back up PostgreSQL and test point-in-time recovery.

## 14. Observability

Emit structured events with these fields where applicable:

```text
requestId
jobId
jobKind
aggregateId
attempt
leaseOwner
providerGenerationId
imageId
durationMs
outcome
safeErrorCode
```

Never log prompts, image bytes, signed object URLs, database URLs, tokens, or full provider responses by default.

Track at least:

- queued job count and age of the oldest queued job;
- running jobs with expired leases;
- retry and terminal failure counts by job kind and safe error code;
- generation latency and success rate by model;
- object deletion backlog and oldest expired object;
- database connection usage, waits, timeouts, and query latency;
- migration status and deployment health.

Alert on backlog age, repeated lease recovery, pool exhaustion, failed retention deletion, and migration failure. On Azure, correlate Function invocation IDs through Application Insights. On Netlify, include the invocation/request ID in the same structured fields.

## 15. Verification checklist

Before production:

- [ ] Prisma packages are pinned to the same stable version.
- [ ] Node.js 24 is selected by `.node-version`, `engines.node` requires `>=24.15.0 <25`, and local, CI, Netlify build, and Netlify Functions logs show the expected major version.
- [ ] Nuxt uses Nitro's `netlify` preset and `dist` publish directory; no Prisma-backed route is deployed with `netlify_edge`.
- [ ] Native Netlify functions use the modern Request/Response API rather than deprecated Lambda compatibility mode.
- [ ] `prisma validate`, `prisma generate`, type checking, and tests pass.
- [ ] Runtime and migration database roles are separate.
- [ ] Runtime traffic uses a tested pooler with a measured connection budget.
- [ ] Migrations run once in CI/CD, never in functions.
- [ ] CRUD routes validate input, authorization, and selected response fields.
- [ ] Concurrent updates are covered by optimistic-concurrency tests.
- [ ] Duplicate enqueue and duplicate delivery tests prove idempotency.
- [ ] Worker termination followed by lease recovery is tested.
- [ ] Object deletion followed by database failure is safely retryable.
- [ ] Retention extension prevents a stale deletion job from deleting an image.
- [ ] Cleanup batches stop before Netlify and Azure execution deadlines.
- [ ] Browser uploads stay below the conservative 4 MB application limit, or a reviewed direct-upload architecture is in place.
- [ ] Background and scheduled function badges, manual invocation, retries, and the Node.js runtime are verified on a published deploy.
- [ ] Function plan, memory, region, data residency, and HIPAA requirements have been explicitly reviewed.
- [ ] Deploy Previews and branch deploys cannot delete production objects from a shared site-wide Blob store.
- [ ] No image bytes or public provider URLs are stored in PostgreSQL.
- [ ] Logs and job payloads contain no secrets or personal image data.
- [ ] Restore, migration recovery, and provider outage procedures are exercised.

## 16. Official references

The version and platform guidance in this baseline was checked against current official documentation:

- [Prisma ORM releases and support](https://www.prisma.io/docs/orm/more/releases)
- [Prisma system requirements](https://www.prisma.io/docs/orm/reference/system-requirements)
- [Prisma 7 generators](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
- [Prisma 7 data sources](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/data-sources)
- [Prisma 7 CLI reference](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference)
- [Prisma CRUD](https://www.prisma.io/docs/orm/v7/prisma-client/queries/crud)
- [Prisma transactions and optimistic concurrency](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)
- [Prisma Migrate development and production](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)
- [Netlify Node.js build version](https://docs.netlify.com/build/configure-builds/manage-dependencies/#node-js-and-javascript)
- [Netlify Functions configuration and limits](https://docs.netlify.com/build/functions/configuration/)
- [Netlify Background Functions](https://docs.netlify.com/build/functions/background-functions/)
- [Netlify Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)
- [Netlify Lambda compatibility deprecation](https://docs.netlify.com/build/functions/lambda-compatibility/)
- [Nuxt on Netlify](https://docs.netlify.com/frameworks/nuxt/)
- [Nitro Netlify presets](https://nitro.build/deploy/providers/netlify)
- [Netlify Edge Functions limits](https://docs.netlify.com/build/edge-functions/limits/)
- [Netlify Blobs](https://docs.netlify.com/blobs/overview/)
- [Azure Functions Node.js reference](https://learn.microsoft.com/azure/azure-functions/functions-reference-node)
- [Azure Database for PostgreSQL PgBouncer](https://learn.microsoft.com/azure/postgresql/connectivity/concepts-pgbouncer)

Re-check version numbers and platform limits at implementation time because package releases and hosting limits change independently of this architecture.
