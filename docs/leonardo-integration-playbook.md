# Leonardo Integration Playbook

## Applicability

This is the approved baseline for the implemented M4 Leonardo integration and
future changes to image-generation behavior. Read it with the
[camera playbook](./camera-and-initial-image-playbook.md) and
[data and jobs playbook](./prisma-data-and-jobs-playbook.md). Resolve conflicts
before implementation. Verification dates are historical: recheck model
schemas, prices, and provider operations before changing this integration.

This document defines the implementation baseline for a standalone Leonardo
image-generation integration. It was checked against Leonardo's official
documentation on 2026-09-22.

## Scope and API contract

Use Leonardo's v2 API for all generation submissions. The model identifiers below
were rechecked against the authenticated `GET /models` response and official
v2 model guides on 2026-09-22; recheck both before changing the configured
model:

- Base URL: `https://cloud.leonardo.ai/api/rest/v2`
- Generation endpoint: `POST /generations`
- Model discovery: `GET /models`
- Completion status: `GET /api/rest/v1/generations/{generationId}`
- Request shape: `{ "model": "<model-identifier>", "parameters": { ... } }`
- Nano recipe response shape:
  `{ "generate": { "generationId": "<id>", "apiCreditCost": null } }`
- The v2 OpenAPI documents the same fields at the top level. Accept both shapes;
  `apiCreditCost` may be a non-negative integer, `null`, or omitted.
- The completion response wraps `id`, `status`, and `generated_images` in
  `generations_by_pk`. Accept a generated output only for `COMPLETE` and only
  from the approved Leonardo CDN host.

The implemented model discriminator is `nano-banana-2-lite`. The Flare material
below records evaluated provider behavior but is not an enabled adapter.
Authenticated model discovery identifies Flare as
`59fdceca-7d29-4d41-87ec-19f4f53bd7e3`, while its documented request
discriminator is `openai/gpt-image-2.5-flare`. Do not enable Flare or another
model without its own server-side configuration, runtime-validated schema,
tests, live contract check, and cost review. Never select a more expensive model
automatically or accept arbitrary client-supplied model names.

GPT Image 2.5 Flare supports `UPLOADED`, `URL`, and `BASE64` source images. Nano
Banana 2 Lite accepts only `UPLOADED` and `GENERATED` references. The required
ID-based workflow obtains an `UPLOADED` ID through
`POST /api/rest/v1/init-image`, then submits the generation to v2. Isolate this
provider-required upload operation behind a dedicated adapter; all generation
operations remain v2. Flare can alternatively avoid the provider upload by
using an application-owned `URL` reference.

The official setup requirements are also easy to miss:

- Production API credits are purchased separately from Leonardo web-app plans.
- Create and name an API key in the Leonardo API Access page.
- Keep the API key out of client-side code.
- A webhook callback URL and callback API key can optionally be configured when
  creating the production API key.

## Target lifecycle

Treat an image request as a stateful job:

1. Upload the source and persist the returned `initImageId` internally.
2. Submit a v2 generation with that ID as an `UPLOADED` image reference.
3. On successful completion, download the generated image from Leonardo's
   output URL into application-owned object storage.
4. Create an opaque application `imageId`; expose only that ID and an
   application URL such as `/api/images/{imageId}` to the user.
5. After the generated image is durably stored, enqueue deletion of the
   original source.
6. Serve subsequent reads from application storage or its CDN, without calling
   Leonardo.
7. Delete the cached generated image after its configured `deleteAfter` time.

### Requirement coverage

| Requirement                                           | Status and constraint                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Upload source and get an ID                           | Covered by the presigned upload flow; persist `initImageId` internally                                                    |
| Generate from the uploaded image ID                   | Implemented with a v2 `UPLOADED` image reference for Nano Banana; Flare remains evaluated reference material              |
| Delete the original after success or terminal failure | Application-owned and dedicated Leonardo source cleanup are implemented; live provider verification remains required      |
| Give the user an application-owned image ID           | Covered by opaque `imageId`; never expose `generationId` or Leonardo's CDN URL                                            |
| Cache the generated image in the application          | Covered by one-time ingestion into application object storage before the image becomes available                          |
| Delete generated images after a configured delay      | Application cache and metadata deletion are covered; Leonardo-side generation deletion is unverified in the published API |

Leonardo's current [v1 delete-init-image contract](https://docs.leonardo.ai/v1.0/reference/deleteinitimagebyid)
defines authenticated `DELETE /init-image/{id}` with a nullable
`delete_init_images_by_pk.id` response. The M7 cleanup worker calls this only
after durable output success or confirmed terminal failure, and validates a
matching returned ID before marking cleanup complete. It retains the external ID
for uncertain, failed, or exhausted cleanup. Repeated-delete semantics remain
unverified and require live confirmation before launch. The published API still
does not expose deletion of generated images. A Flare application-owned `URL`
source avoids creating `initImageId`, but does not prove erasure of bytes fetched
or generated by Leonardo.

Keep provider artifacts separate from application-owned artifacts:

| Artifact                         | Source                                                              | Purpose                                        | Documented deletion                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Short-lived source URL or base64 | Application storage/input; Flare only                               | v2 `URL` or `BASE64` reference                 | Delete the application-owned object; no Leonardo upload ID exists                                                            |
| `initImageId`                    | v1 `POST /init-image`; used by the implemented Nano Banana workflow | v2 `UPLOADED` reference                        | Authenticated v1 `DELETE /init-image/{id}` through the durable M7 worker; live repeated-delete verification remains required |
| `generationId`                   | v2 `POST /generations`                                              | Correlates completion, persistence, and output | No current v2 deletion endpoint is published in the reviewed docs index                                                      |
| `imageId`                        | Application database                                                | Internal row ID; never expose it               | Delete or tombstone with the application retention record                                                                    |
| `publicId`                       | Application database                                                | Opaque public result/gallery lookup ID         | Stop serving when the application retention record expires                                                                   |
| Generated-image object           | Application object storage                                          | Cached bytes served to users                   | Delete after `deleteAfter`; purge any application CDN copy                                                                   |

Never interchange these IDs. Accept generation asynchronously:

```ts
interface GenerationAccepted {
  jobId: string
  statusUrl: string
}

interface GeneratedImageResult {
  publicId: string
  imageUrl: string
  deleteAfter: string
}
```

`GeneratedImageResult.imageUrl` must point to the application, for example
`/api/images/{imageId}`, and never to Leonardo. Keep `initImageId`,
`generationId`, and Leonardo's output URL server-side. Generate `imageId` from
a cryptographically random identifier and authorize every read; do not expose
sequential database IDs. Do not infer provider IDs from URL shape. The current
published v2 reference contains no deletion endpoint for generated images. Use
the documented v1 init-image deletion operation for uploaded sources; do not
guess a generation-deletion path.

## Connection rules

1. Keep `LEONARDO_API_KEY` on the server. Send it to Leonardo's API as
   `Authorization: Bearer <key>` and never expose it to the browser.
2. Centralize the v2 base URL and generation defaults in server configuration.
   Keep Nano Banana 2 Lite server-owned. Do not accept unregistered model or
   quality overrides from clients, and do not treat the evaluated Flare example
   as an enabled model.
3. Add an explicit timeout and cancellation signal to every outbound request.
   A stalled request must not consume the full serverless execution budget.
4. Validate provider responses at runtime. At minimum, validate upload fields,
   the v2 response's top-level or Nano-recipe-nested `generationId` and nullable
   optional `apiCreditCost`, and authenticated webhook payloads rather than
   relying only on static types.
5. Keep provider errors structured internally: operation, HTTP status,
   provider request ID, whether the operation is safe to retry, and
   `Retry-After` when present. Return sanitized errors to the client.

Validate `LEONARDO_API_KEY` when constructing the Leonardo client, not while
importing unrelated modules.

## Supplying the original image

### GPT Image 2.5 Flare: v2-only path

Prefer a short-lived HTTPS URL from application-controlled object storage. The
v2 Flare schema also accepts base64, but that increases request size and memory
use. A URL reference has this shape:

```json
{
  "image": {
    "url": "<short-lived-signed-source-url>",
    "type": "URL"
  }
}
```

For inline bytes, use the separate `data` field with raw base64-encoded image
bytes, not the `url` or `id` field:

```json
{
  "image": {
    "data": "<base64-encoded-image-bytes>",
    "type": "BASE64"
  }
}
```

Set the URL lifetime long enough for Leonardo to retrieve it, but keep it as
short as operationally practical. Delete the application-owned source object
after output ingestion succeeds, with durable fallback cleanup for failed or
abandoned jobs under a retention policy agreed before implementation. This
avoids creating a Leonardo `initImageId`, but is not a provider erasure guarantee.

### Uploaded image ID path: documented compatibility upload

Use this path when the workflow requires an `initImageId`. Nano Banana 2 Lite
requires it for new source uploads; Flare also accepts it. The current official
uploaded-image recipe uses this hybrid sequence:

1. Call `POST https://cloud.leonardo.ai/api/rest/v1/init-image` with an
   extension such as `jpg`, `jpeg`, `png`, or `webp`.
2. Read `uploadInitImage.id`, `uploadInitImage.url`, and
   `uploadInitImage.fields`.
3. JSON-decode `fields` because Leonardo returns it as a serialized object.
4. Build `FormData` with every returned S3 field, then append the file last.
5. POST the multipart body directly to the presigned URL. Do not attach the
   Leonardo bearer token. Let the multipart client supply its required content
   type and boundary.
6. Retain `uploadInitImage.id` as `initImageId` in the durable job state.

The expected successful presigned-upload response is HTTP 204 with no body.
The image ID comes from the preceding `/init-image` response, not from the
storage upload response.

Decode and inspect the input, enforce decoded byte and pixel limits, remove
metadata if required, and transcode to the declared format. A `Content-Length`
check alone does not protect chunked requests, and base64 increases request
size.

Persist the resulting `initImageId` separately from `generationId`. Because the
current documentation index does not publish a deletion operation for this
uploaded artifact, provider-side source deletion is an unresolved requirement.
Do not claim deletion guarantees until Leonardo confirms a supported endpoint
and response contract. Skip the compatibility upload when the generation does
not use a source image.

## Creating a generation

Submit one of the two initial baseline requests below to
`POST /api/rest/v2/generations`. Validate it against the selected model's
schema before sending it. Do not derive provider parameters from arbitrary
client input.

### Model reference baseline

Both current candidates use `POST /api/rest/v2/generations` and accept an
uploaded source image under `parameters.guidances.image_reference`:

| Capability               | GPT Image 2.5 Flare                                   | Nano Banana 2 Lite             |
| ------------------------ | ----------------------------------------------------- | ------------------------------ |
| Model identifier         | `openai/gpt-image-2.5-flare`                          | `nano-banana-2-lite`           |
| Reference images         | Up to 16                                              | Up to 6                        |
| Reference types          | `UPLOADED`, `GENERATED`, `VARIATION`, `URL`, `BASE64` | `UPLOADED`, `GENERATED`        |
| Per-reference strength   | Not supported                                         | `LOW`, `MID`, or `HIGH`        |
| Input-matched dimensions | Not supported; choose valid discrete dimensions       | Use `width: 0` and `height: 0` |
| Style presets            | One `style_ids` value                                 | One `style_ids` value          |

Use an `UPLOADED` reference for the required ID-based workflow with either
baseline model. Start with the settings in the baseline requests below. Do not
automatically select another model, additional outputs, higher quality, or
other cost-increasing options. If avoiding a v1 upload or guaranteeing source
deletion is more important than using an upload ID, Flare may use the same
model with an application-owned `URL` reference. This avoids an uploaded ID,
not every provider-held copy; confirmed provider erasure remains a separate gate.

Always send `quantity: 1`. Treat dimensions, prompt enhancement, style, and
optional Nano reference strength as server-side configuration based on the
provided examples. These settings may be revised later through configuration
and testing. Any change that can increase credit usage requires an explicit
product decision and cost review.

Nano Banana 2 Lite request:

```json
{
  "model": "nano-banana-2-lite",
  "parameters": {
    "prompt": "Create a superhero portrait of the person in the reference image within a landscape composition...",
    "width": 1376,
    "height": 768,
    "quantity": 1,
    "prompt_enhance": "OFF",
    "style_ids": ["111dc692-d470-4eec-b791-3475abac4c46"],
    "guidances": {
      "image_reference": [
        {
          "image": {
            "id": "<initImageId>",
            "type": "UPLOADED"
          }
        }
      ]
    }
  },
  "public": false
}
```

GPT Image 2.5 Flare request:

```json
{
  "model": "openai/gpt-image-2.5-flare",
  "parameters": {
    "prompt": "Create a superhero portrait of the person in the reference image within a landscape composition...",
    "width": 1376,
    "height": 768,
    "quantity": 1,
    "prompt_enhance": "AUTO",
    "guidances": {
      "image_reference": [
        {
          "image": {
            "id": "<initImageId>",
            "type": "UPLOADED"
          }
        }
      ]
    }
  },
  "public": false
}
```

This request is derived from the supplied Leonardo page payload as follows:

| Supplied page field                                       | API representation                         |
| --------------------------------------------------------- | ------------------------------------------ |
| Flare discovery ID `59fdceca-7d29-4d41-87ec-19f4f53bd7e3` | Metadata lookup only; do not send as model |
| Flare discriminator `openai/gpt-image-2.5-flare`          | Root `model`                               |
| `generationType: image`                                   | Selected by the generations endpoint; omit |
| `mode: fast`                                              | No documented Flare v2 field; omit         |
| `width: 1376`, `height: 768`                              | `parameters.width` and `parameters.height` |
| `aspectRatio: 16:9`                                       | Already represented by width and height    |
| `quantity: 1`                                             | `parameters.quantity`                      |
| `isPublic: false`                                         | Root `public: false`                       |
| `promptEnhance: AUTO`                                     | `parameters.prompt_enhance: AUTO`          |
| `negativePromptEnabled: false`                            | No negative prompt; omit                   |
| `seedEnabled: false`                                      | No seed; omit                              |
| `guidanceCount: 1`                                        | One real `guidances.image_reference` entry |
| `collectionCount: 0`                                      | Leonardo page state; omit                  |
| `costOfGeneration: 23`                                    | Monitoring baseline; never send in request |
| Balances, `tokenType`, `path`, and `platform`             | Account or page telemetry; omit            |

The prompt and uploaded image ID are not present in the supplied page payload,
but the generation API requires the prompt and the workflow requires the actual
reference object. They are therefore represented by placeholders in the API
example. Do not translate `mode: "fast"` into a `quality` value without a
documented Leonardo mapping. Omitting `quality` is intentional and avoids
silently selecting a more expensive tier.

#### Request construction rules

- Build requests only from the documented v2 schema returned by `GET /models`.
- Keep `model` and `public` at the request root; put model parameters under
  `parameters`.
- Set `quantity: 1` explicitly and reject larger values.
- Use the baseline width, height, prompt enhancement and style for the initial
  implementation. Omit optional reference strength until deliberately tested.
- Send actual `guidances.image_reference` objects, not reference counts.
- Use only `AUTO`, `ON`, or `OFF` for `prompt_enhance`.
- Do not expose a quality selector or add a Flare `quality` override. The
  baseline request intentionally uses the documented default.
- Do not expose arbitrary model, style, dimension, quantity, or strength
  parameters to clients. Add future options through validated server-side
  configuration.
- Runtime-validate the response's optional `apiCreditCost`. M4 does not persist
  that value; add durable capture and monitoring before using it for production
  cost reporting.
- Reject unknown fields rather than forwarding arbitrary client input.

For this Flare configuration, the supplied page payload reported
`costOfGeneration: 23`. It is reference telemetry, not an implemented billing
record. The current ledger reserves a fixed server-owned credit amount before
submission. Before production cost reporting, persist the response's
`apiCreditCost` when present and alert when it differs unexpectedly from the
configured reservation. Do not retry a completed generation to improve image
quality without an explicit user action and a new cost acknowledgement.

The v2 model guides demonstrate `UPLOADED` references but do not replace the
separate upload recipe, which currently creates uploaded image IDs through the
v1 `/init-image` presigned-upload flow. Keep upload and generation as separate
client operations, and do not rename the uploaded image ID to a generation ID.

## Completion and reconciliation

Use Leonardo's authenticated webhook as the primary completion channel. The
official Nano Banana recipe and a live contract check on 2026-09-22 confirm
that the accepted generation ID can also be reconciled through authenticated
`GET /api/rest/v1/generations/{generationId}`. Runtime-validate the
`generations_by_pk` wrapper, matching generation ID, status, and first output
URL. Do not infer success from an HTTP 200 response alone.

A delayed or missing callback does not mean generation failed. Do not submit
another paid generation automatically. Persist the job as pending, return
`202 Accepted` with an application job ID, and let the client query the
application's status endpoint. This also allows the workflow to survive a
serverless process restart.

Leonardo's official production guidance recommends a webhook instead of
polling. The callback URL must use HTTPS. If a webhook callback API key is
configured with the Leonardo production key, Leonardo sends it as
`Authorization: Bearer <webhook-callback-api-key>`. Authenticate callbacks,
deduplicate them by generation ID and event, return quickly, and retain polling
through a provider-confirmed endpoint as a reconciliation fallback for missed
callbacks.

Polling and output ingestion have separate retry accounting. `PENDING` moves
the next status check forward without consuming a generated-output ingestion
attempt. `COMPLETE` records the validated CDN URL through the same idempotent
completion path as the webhook, after which the worker may claim ingestion.
`FAILED` is terminal for that provider generation. Never submit a replacement
generation from the polling path.

For a successful completion event:

1. Resolve the internal job by `generationId` and validate the output URL.
2. Fetch the generated bytes once, without forwarding the Leonardo API token to
   the CDN host.
3. Enforce an HTTPS host allowlist, redirect policy, timeout, maximum byte size,
   and expected image content type.
4. Store the bytes under an application-owned object key and record content
   type, byte size, checksum or ETag, and `deleteAfter`.
5. Create the opaque `imageId` and atomically mark the image available only
   after the stored object is readable.
6. Enqueue original-source cleanup. Do not delay the webhook response while
   cleanup runs.

If output ingestion fails, retry ingestion of the same `generationId`; never
submit another generation. Make the ingestion operation idempotent so duplicate
webhooks cannot create multiple cached objects or public image records.

## Retry policy

Have one retry owner per operation and use this classification:

| Failure                                              | Action                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Invalid input, 400/422                               | Do not retry                                                                     |
| Authentication/authorization, 401/403                | Do not retry; alert configuration owner                                          |
| Rate limit, 429                                      | Respect `Retry-After`; otherwise exponential backoff with jitter                 |
| Concurrency or pending-queue exhaustion              | Apply backpressure; do not increase submission concurrency                       |
| Provider 5xx, network failure before acceptance      | Retry within a small elapsed-time budget                                         |
| Network failure with uncertain submission outcome    | Reconcile by idempotency key or application job record before resubmitting       |
| Completion delay or transient reconciliation failure | Keep the same `generationId`; do not regenerate                                  |
| Generated-output ingestion failure                   | Retry caching the same output; do not regenerate                                 |
| Provider status `FAILED`                             | Mark terminal; regenerate only after an explicit product decision or user action |

Apply a cap and jitter to backoff, honor cancellation, and record each attempt.
If Leonardo supports an idempotency key, use one derived from the application
job. Otherwise store submission state before calling the provider and serialize
submission for that job. A database uniqueness constraint or expired worker
lease does not prove an external paid request was rejected. Hold uncertain
outcomes for provider-confirmed reconciliation or explicit review; never
automatically resubmit merely because a worker retries.

Leonardo distinguishes generation concurrency, pending queue capacity, and API
request rate limits. Size and throttle each independently. The official guide
does not guarantee that a `Retry-After` header is present, so honor it when
available and otherwise use the bounded fallback policy above.

Preserve provider rate limits as HTTP 429 and emit a `Retry-After` response
header when returning the error to a client.

## Cleanup and retention

Original uploads contain the most sensitive data. Application-owned source
cleanup and deletion of Leonardo's uploaded `initImageId` are separate durable
operations. Trigger application-owned source cleanup after the generated output
has been validated and durably stored, subject to the bounded retention policy:

1. For a Flare `URL` reference, persist the application storage key and delete
   that object through the storage provider after output ingestion succeeds.
   Also let the signed URL expire. Make this durable and idempotent.
2. For Flare `BASE64`, retain no application copy beyond the request unless the
   product explicitly requires one. Do not log the encoded content.
3. For an `UPLOADED` reference, delete any application-owned source copy after
   output ingestion succeeds or its retention expires. Persist `initImageId`
   until provider cleanup is confirmed. Never report that the provider source
   was deleted merely because the local copy was removed.
4. Delete the provider upload through authenticated
   `DELETE /api/rest/v1/init-image/{initImageId}`. Await it within a bounded
   timeout and runtime-validate HTTP 200 with a matching
   `delete_init_images_by_pk.id`. The response object is nullable, and repeated
   deletion remains unverified; treat a null, mismatched, or repeated-delete
   result as unconfirmed until live verification establishes safe idempotent
   semantics.
5. Enqueue failed provider cleanup durably and retry only classified transient
   failures.

Every confirmed Leonardo `initImageId` must enter a dedicated, idempotent
provider-cleanup workflow as the final action after either:

- the generated output has been validated and durably stored; or
- the generation reaches a confirmed terminal failure after its permitted
  generation or output-ingestion retries are exhausted.

Do not delete the provider source while generation is pending or submitted. A
`SUBMISSION_UNKNOWN` outcome is not a confirmed terminal failure: retain the
`initImageId` and cleanup state until reconciliation or an approved manual
decision establishes that deletion is safe. If provider-cleanup retries are
exhausted, keep the external ID in a cleanup ledger, alert operators, and require
manual resolution rather than silently marking it deleted.

The v1 init-image delete operation was not implemented by M4; M7 adds a dedicated
durable cleanup job. Leonardo's current FAQ says API-generated images do not
expire, while the published v2 reference does not list a delete-generation
operation for these models. `public: false` controls visibility; it is not
deletion. Persist provider IDs, local retention deadlines, and explicit
remote-deletion state. Delete local records and storage according to policy, but
do not claim that a Leonardo copy was deleted without a confirmed response.

If confirmed remote deletion is a privacy or compliance requirement, implementing
and live-verifying init-image deletion is a production-readiness gate. Generated
image deletion remains unsupported in the reviewed public API and may still
block launch under that policy.

Do not delete the database record after a failed remote deletion unless a
separate cleanup ledger retains the external ID.

Run provider calls outside database transactions. Use a scheduled worker that
claims a bounded batch, deletes with limited concurrency, and then marks or
removes only confirmed records.

For generated-image retention, assign `deleteAfter` when the cached output is
created. A scheduled worker must:

1. Claim a bounded batch where `deleteAfter <= now`.
2. Delete the generated object from application storage and purge its CDN key.
3. Tombstone the public result so reads return `410 Gone` and cannot repopulate the
   cache from Leonardo.
4. Attempt provider-side generation deletion only through a documented,
   confirmed API. Retain the internal `generationId` and cleanup state if that
   attempt fails.
5. Remove or minimize metadata only after all required cleanup is confirmed.

Make the retention duration configurable and test it with a short interval.
The normal read path must never extend `deleteAfter`.

## Serving generated images

Expose a public application endpoint such as `GET /api/photos/{publicId}` for a
published, unexpired result. Private session status and mutation endpoints use
the anonymous session capability instead. The public read path is:

1. Resolve the opaque `publicId`; do not require or expose a private session.
2. Reject expired or tombstoned records with `410 Gone`.
3. Stream the cached object from application storage, or redirect to a
   short-lived signed application-storage URL.

Do not call Leonardo on this path and do not expose its URL. The Leonardo output
URL is ingestion-only and remains internal. A cache miss for an available image
is a storage consistency failure; enqueue repair if recovery is supported, but
do not turn every user request into a Leonardo fallback.

Return the stored content type, ETag, and conditional `304 Not Modified`
responses. For private images, use private or authenticated CDN caching. Bound
all browser and CDN cache lifetimes by the remaining time until `deleteAfter`.

## Recommended application job

Keep enough state to resume work and prove cleanup:

```ts
type GenerationState =
  | 'uploading'
  | 'submitted'
  | 'awaiting_completion'
  | 'caching_output'
  | 'available'
  | 'failed'
  | 'expired'

interface ImageGenerationJob {
  id: string
  state: GenerationState
  sourceObjectKey?: string
  initImageId?: string
  generationId?: string
  providerImageUrl?: string
  applicationImageId?: string
  outputObjectKey?: string
  submitAttempts: number
  reconciliationAttempts: number
  outputIngestionAttempts: number
  sourceCleanupAttempts: number
  retentionCleanupAttempts: number
  lastProviderStatus?: number
  nextAttemptAt?: Date
  sourceDeletedAt?: Date
  deleteAfter?: Date
}

interface CachedGeneratedImage {
  id: string // Opaque application imageId
  jobId: string
  objectKey: string
  contentType: string
  byteSize: number
  etag: string
  deleteAfter: Date
  deletedAt?: Date
}
```

Log the application job ID, provider operation, generation ID, attempt number,
elapsed time, and terminal outcome. Do not log the source base64, bearer token,
presigned upload fields, or unnecessary personal data. Leonardo may return a
GraphQL error array with HTTP 200. Treat that as an uncertain submission rather
than acceptance or a retryable rejection. Diagnostics may include the request
ID, a constrained `extensions.code`, response key names, and a bounded error
message only after quoted values, URLs, bearer values, and long token-like runs
have been redacted.

## Harness rules

Use the following as implementation constraints for an AI coding harness:

```text
- Implement Leonardo behind a server-only typed client.
- Use v2 for all generation submissions. The implemented and live-checked model
  is nano-banana-2-lite; the Flare example is deferred reference material.
- Isolate the provider-required v1 init-image compatibility call for UPLOADED
  references behind its own adapter. All generation operations remain v2.
- Discover v2 model capabilities with GET /api/rest/v2/models instead of
  hard-coding undocumented model parameters.
- Use the documented init-image adapter and an UPLOADED image_reference for the
  implemented Nano Banana workflow.
- Use the documented baseline payloads as the initial server-side
  configuration.
- Always request exactly one output. Do not expose model, quality, dimensions,
  style, quantity, or reference-strength controls to clients.
- Allow future models through an explicit server-side registry entry,
  model-specific schema, tests, and cost review. Never upgrade a request to a
  higher-priced model or quality tier automatically.
- Runtime-validate apiCreditCost. M4 does not persist it; add durable capture and
  alerts before using it for production cost reporting.
- Keep initImageId and generationId as distinct domain fields.
- Keep initImageId, generationId, and Leonardo output URLs internal.
- Return an opaque application imageId and application URL to the user; never
  parse IDs from URLs or expose Leonardo URLs.
- Normalize, validate, size-limit, and metadata-strip source images before upload.
- Add AbortSignal deadlines to all Leonardo and presigned-storage requests.
- Submit a generation at most once per application job unless reconciliation
  proves that Leonardo did not accept the previous submission.
- Prefer authenticated, idempotent webhooks for completion. Reconcile accepted
  IDs through the confirmed v1 get-generation endpoint, and never regenerate
  because completion is delayed.
- Retry only classified transient failures, respect Retry-After, and use capped
  exponential backoff with jitter.
- Persist uploaded IDs before generation and use durable, idempotent cleanup.
- After durable output ingestion or confirmed terminal failure, run provider
  source cleanup as the final action. Keep uncertain submissions quarantined
  until deletion is known to be safe.
- Cache each completed output once in application storage before marking it
  available; serve every user read from that cache without calling Leonardo.
- Delete the application-owned source only after output ingestion succeeds.
- Short-lived application-owned URL references for Flare avoid an initImageId,
  but do not prove erasure of provider-fetched or generated bytes.
- Delete Nano uploads through the documented v1 init-image endpoint after a safe
  terminal state. Generated-image deletion remains unverified; do not guess a
  generation-deletion endpoint.
- Make remote deletion support a launch gate when policy requires guaranteed
  provider-side erasure.
- Do not make external network calls inside database transactions.
- Do not forward the Leonardo bearer token to generated-image CDN URLs.
- Enforce deleteAfter in a scheduled cleanup worker; delete cached bytes, purge
  the application CDN, and tombstone the application imageId.
- Cover upload failure, 429, delayed completion, provider FAILED, cleanup retry,
  output-cache failure, duplicate webhook, expired-image reads, duplicate
  submission, and process-restart recovery in tests.
```

## Official sources checked

- [Create Async Generation](https://docs.leonardo.ai/reference/creategeneration), v2 OpenAPI updated 2026-09-01
- [Get Available Models](https://docs.leonardo.ai/reference/getmodels), v2 OpenAPI updated 2026-04-23
- [GPT Image 2.5 Flare](https://docs.leonardo.ai/docs/gpt-image-25-flare), updated 2026-09-09
- [Nano Banana 2 Lite](https://docs.leonardo.ai/docs/nano-banana-2-lite), updated 2026-07-07
- [Upload an Image and Print the Image ID](https://docs.leonardo.ai/recipes/uploading-an-image), updated 2026-01-20
- [Delete init image](https://docs.leonardo.ai/v1.0/reference/deleteinitimagebyid), v1 OpenAPI updated 2026-06-03
- [Generate with Nano Banana 2 Using an Uploaded Image](https://docs.leonardo.ai/recipes/generate-with-nano-banana-2-model-using-uploaded-image), hybrid v1-upload/v2-generation recipe updated 2026-03-04
- [General API FAQs](https://docs.leonardo.ai/docs/api-faq), including upload guidance and generated-image non-expiry, updated 2026-02-23
- [Webhook Callback Guide](https://docs.leonardo.ai/docs/guide-to-the-webhook-callback-feature), updated 2026-01-21
- [Concurrency, Queue, and Rate Limit Guide](https://docs.leonardo.ai/docs/guide-to-concurrency-queue-and-rate-limit), updated 2025-09-03
- [API Error Messages](https://docs.leonardo.ai/docs/api-error-messages), updated 2026-01-28
- [Deprecations and Changes](https://docs.leonardo.ai/docs/deprecations-changes), updated 2026-07-09
