# Camera and Initial Image Playbook

## Applicability

This is the approved baseline for the implemented M2-M4 camera, source-upload
and provider-upload behavior, and for future changes to those features. Load it
before planning or changing them. Resolve conflicting requirements with the
product owner before implementation. The source verification dates below are
historical; recheck provider capabilities before changing the integration.

This document defines the implementation baseline for capturing, validating,
compressing, and uploading a source image for Leonardo image guidance. It was
checked against Leonardo's official documentation on 2026-09-15.

Use this together with
[Leonardo Integration Playbook](./leonardo-integration-playbook.md).

## Provider constraints

Leonardo's published upload documentation currently confirms:

- Request a presigned upload with
  `POST https://cloud.leonardo.ai/api/rest/v1/init-image`.
- The supported extension values are `jpg`, `jpeg`, `png`, and `webp`.
- The response contains `uploadInitImage.id`, `url`, and serialized `fields`.
- Upload the binary to the presigned URL without the Leonardo authorization
  header.
- A successful presigned upload returns HTTP 204 with no body.
- Use `uploadInitImage.id` as the `UPLOADED` image reference in the v2
  generation request.

The reviewed Leonardo documentation does not publish a maximum upload byte
size, maximum source dimensions, or maximum decoded pixel count for this
endpoint. Do not present an application limit as Leonardo's official limit.
Confirm production limits with Leonardo and inspect the returned presigned POST
policy for a `content-length-range` condition when present.

## Baseline limits

Use conservative application-owned limits until Leonardo publishes or confirms
its provider limit:

```ts
const MEBIBYTE = 1024 * 1024

const INITIAL_IMAGE_LIMITS = {
  maxInboundBytes: 20 * MEBIBYTE,
  maxApplicationRequestBytes: 4_000_000,
  maxDecodedPixels: 16_000_000,
  maxDimension: 8_192,
  maxLeonardoUploadBytes: 5 * MEBIBYTE,
  targetLeonardoUploadBytes: 4 * MEBIBYTE,
  maxProcessedDimension: 1_600,
  minProcessedDimension: 768,
  initialJpegQuality: 0.85,
  minimumJpegQuality: 0.5,
} as const
```

These values are an implementation baseline, not Leonardo guarantees:

- `maxInboundBytes` rejects unusually large input before decoding.
- `maxApplicationRequestBytes` limits the entire processed-image multipart
  request through the Nitro capture endpoint, including fields and envelope.
  It is 4 MB in decimal bytes, not 4 MiB. The original file is processed in the
  browser; the 20 MiB inbound ceiling is not a server request allowance.
- `maxDecodedPixels` and `maxDimension` limit decompression-bomb exposure.
- `maxLeonardoUploadBytes` is the application's hard upload ceiling.
- `targetLeonardoUploadBytes` is only an upper target, further reduced by the
  deployment ingress budget and any stricter provider policy.
- Pixel limits apply to decoded dimensions, not only compressed file size.

Keep these settings in server-controlled configuration. A future confirmed
Leonardo limit may change them without changing camera behavior.

If the presigned POST policy contains a lower `content-length-range` maximum,
use the lower value:

```ts
const effectiveHardLimit = Math.min(
  INITIAL_IMAGE_LIMITS.maxLeonardoUploadBytes,
  INITIAL_IMAGE_LIMITS.maxApplicationRequestBytes - multipartOverheadBytes,
  providerPolicyMaxBytes ?? Number.POSITIVE_INFINITY,
)

const effectiveTarget = Math.min(
  INITIAL_IMAGE_LIMITS.targetLeonardoUploadBytes,
  Math.floor(effectiveHardLimit * 0.9),
)
```

Reject the upload if the policy cannot accommodate a useful image. Do not
silently upload below `minProcessedDimension` or below the minimum JPEG quality.

Compute `multipartOverheadBytes` from the actual fields and serialized envelope,
not a guessed constant. Reject a non-positive remaining allowance. Enforce the
total request budget independently on the server while reading the body. The
effective processed-image target is therefore below 4 MB on this deployment;
neither the 5 MiB ceiling nor the 4 MiB upper target overrides Function ingress.

## Camera lifecycle

Model camera behavior explicitly:

```ts
type CameraState =
  | 'idle'
  | 'requesting_permission'
  | 'streaming'
  | 'counting_down'
  | 'capturing'
  | 'previewing'
  | 'compressing'
  | 'ready'
  | 'error'
```

The normal flow is:

1. After the visitor selects a theme, query camera permission. If it is already
   granted, start the camera automatically; otherwise show an **Activate camera**
   action and request permission only after that explicit user action.
2. Verify `navigator.mediaDevices?.getUserMedia` exists and the page is in a
   secure context.
3. Request the preferred camera with non-mandatory constraints.
4. Wait for video metadata and non-zero `videoWidth` and `videoHeight`.
5. Enable **Take photo** only when the stream is live and the video has non-zero
   dimensions.
6. When the person selects **Take photo**, start a three-second countdown.
7. Capture exactly one frame when the countdown deadline is reached, using the
   displayed crop or framing rules.
8. Encode to a `Blob`, show a preview, and let the user retake or accept it.
9. Compress the accepted image to the effective byte target.
10. Send the processed binary to the server for authoritative validation and
    upload.
11. Stop every media track after capture, leaving or cancelling the camera flow,
    navigation, error, and component cleanup. Cancelling only the countdown
    returns to the live preview and keeps its stream.

Recommended baseline constraints:

```ts
const constraints: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'user' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
}
```

Treat these as preferences. Retry with `{ video: true, audio: false }` when a
browser rejects the detailed constraints. Do not identify mobile devices from
the user-agent string.

For camera switching, query `enumerateDevices()` after a camera stream has been
approved and show a switch control only when at least two `videoinput` devices
are available. Hide the control when enumeration is unavailable or fails. Stop
the current video track before requesting the other facing mode. Pass the next
facing mode directly to the request instead of relying on an asynchronous state
update.

Mirror the front-camera preview only when desired for user familiarity. Define
whether the saved frame matches the mirrored preview and test that behavior.
Do not accidentally mirror only the CSS preview while capturing a different
composition.

### Activation rules

- Never call `getUserMedia()` before theme selection. After theme selection,
  call it automatically only when the browser reports camera permission as
  `granted`; otherwise wait for the **Activate camera** action.
- Explain why the camera is needed before opening the browser permission prompt.
- Keep one active stream. Reuse it while the person remains in the camera flow
  instead of requesting permission for each photo.
- Treat permission state as advisory. The actual `getUserMedia()` result is the
  source of truth because browser permission can change between visits.
- Handle `NotAllowedError`, `NotFoundError`, `NotReadableError`,
  `OverconstrainedError`, insecure context, and missing media-device support as
  distinct failure categories.
- Listen for the active track's `ended` event. Cancel any countdown and return
  to a recoverable camera-unavailable state when the stream ends unexpectedly.
- Do not leave the camera active behind another application screen. Stop all
  tracks when leaving the camera flow.

### Three-second photobooth countdown

The three seconds run from the accepted **Take photo** click to capture. Show
`3`, `2`, and `1`, then capture at or after the three-second deadline. Do not
capture on the transition to `1`.

Use a deadline derived from a monotonic clock instead of assuming three
one-second timer callbacks will fire on time:

```ts
const COUNTDOWN_DURATION_MS = 3_000

const startedAt = performance.now()
const captureAt = startedAt + COUNTDOWN_DURATION_MS

function getCountdownValue(now: number): number {
  return Math.max(0, Math.ceil((captureAt - now) / 1_000))
}
```

Schedule updates against `captureAt` and recalculate from `performance.now()` on
every tick. Timer callbacks can drift or be delayed. Capture once when
`performance.now() >= captureAt`; never capture early and never add three seconds
of callback drift.

Countdown behavior:

- Enter `counting_down` atomically so rapid clicks cannot start multiple timers.
- Keep the live preview visible and place a large, high-contrast number over it.
- Disable camera switching, capture, submission, and other conflicting actions.
- Offer a clear **Cancel countdown** action. Escape may invoke the same action.
- On cancellation, clear the scheduled timer, invalidate the countdown token,
  and return to `streaming` without taking a frame.
- Cancel when the track ends, the component unmounts, navigation starts, the
  selected camera changes, or video dimensions become zero.
- Cancel when the document becomes hidden. Do not take a delayed surprise photo
  immediately when a suspended tab becomes visible again.
- Before capture, recheck that the countdown token is current, the state is
  `counting_down`, the track is live, the document is visible, and video
  dimensions are non-zero.
- Transition to `capturing` before drawing the frame. This makes capture a
  one-time state transition even if two callbacks arrive near the deadline.
- Do not restart the countdown automatically after an error or cancellation.
- Stop the stream after a successful capture. Retake starts a fresh stream and
  requires a new **Take photo** click and three-second countdown.

Use one owned timeout or animation-frame loop and clean it up on every state
exit. Associate each run with an incrementing token or `AbortController`; stale
callbacks must check ownership before updating state or capturing.

Optional sounds may accompany the visible numbers, but the visual countdown is
required. Do not use sound as the only signal, and do not play audio before the
user gesture. Respect mute controls and user preferences. A visual shutter
effect must respect `prefers-reduced-motion` and must not use a seizure-inducing
flash.

## Capture and preview

Use `canvas.toBlob()` or `OffscreenCanvas.convertToBlob()` rather than
`canvas.toDataURL()`:

- A `Blob` exposes the actual binary size through `blob.size`.
- Data URLs add roughly one third base64 overhead.
- Data URLs create large JavaScript strings and increase memory pressure.
- The presigned upload requires binary multipart data, not a data URL.

Capture from the video's real dimensions. Preserve aspect ratio and avoid
upscaling. Scale the longest edge to at most `maxProcessedDimension` before the
first encode.

Use `URL.createObjectURL(blob)` for the preview and revoke the URL when the
preview is replaced or unmounted. Keep the processed bytes only in memory or
short-lived application storage unless the product explicitly requires local
persistence.

The camera preview and captured image must use the same crop. If the preview
uses `object-fit: cover`, calculate and draw the corresponding source rectangle
instead of drawing the full video frame.

Disable capture, retake, and submit controls while their operation is running.
During countdown, expose only safe cancellation alongside the live preview.
Ensure duplicate clicks cannot create duplicate captures, uploads, or
generations.

## Accepted input

The upload sent to Leonardo must be one of:

| MIME type    | Extension |
| ------------ | --------- |
| `image/jpeg` | `jpg`     |
| `image/png`  | `png`     |
| `image/webp` | `webp`    |

Use JPEG for camera photographs unless transparency is required. JPEG usually
provides the smallest practical portrait upload and is the baseline output
format.

Do not trust a filename, extension, browser MIME type, or data-URL prefix.
Decode the image and verify its actual format. Reject SVG and other active
formats. Reject HEIC/HEIF unless the application includes a maintained decoder
and transcodes the result to JPEG, PNG, or WebP before upload.

Decode and re-encode accepted images to normalize orientation and strip EXIF,
GPS, comments, and other metadata. Composite transparent pixels onto a defined
background before JPEG encoding.

## Compression algorithm

Compression must be target-driven. A single JPEG quality setting does not
ensure a byte limit because image entropy varies significantly.

Use this sequence:

1. Reject the input when its compressed bytes, dimensions, or decoded pixel
   count exceed the inbound limits.
2. Decode the image and apply its orientation.
3. Resize without upscaling so the longest edge is at most 1600 pixels.
4. Encode as JPEG at quality 0.85.
5. If the result exceeds `effectiveTarget`, search quality between 0.85 and 0.5
   for at most six additional encodes.
6. If quality reduction is insufficient, reduce both dimensions proportionally
   and repeat the bounded quality search.
7. Stop when the result is at or below `effectiveTarget`.
8. Reject the image if fitting the target would require quality below 0.5 or a
   longest edge below 768 pixels.
9. Verify the final `Blob.size` is no greater than `effectiveHardLimit`.

A useful proportional resize estimate is:

```ts
const scale = Math.min(0.9, Math.sqrt(targetBytes / encodedBytes) * 0.95)
```

Clamp each resize step so malformed input cannot cause zero or negative
canvas dimensions. Bound the number of encodes and release intermediate
canvases and bitmaps promptly.

Compression errors are not upload retries. Ask for another photo when the image
cannot meet the byte budget while retaining the minimum dimensions and quality.

## Client and server responsibilities

Client-side processing improves latency and avoids sending unnecessarily large
images, but it is not a security boundary.

The client must:

- Capture and preview the image.
- Check the original file's byte size before decoding.
- Decode, orient, resize, metadata-strip, and compress before submission.
- Submit a binary `Blob` with its declared MIME type, not base64 JSON.
- Display actionable permission, decode, compression, and size-limit errors.

The server must independently:

- Enforce request-body limits before buffering the entire request.
- Authenticate the caller and rate-limit source uploads.
- Sniff and decode the actual image format.
- Recheck dimensions, decoded pixels, and final binary bytes.
- Re-encode when normalization cannot be proven.
- Map the verified MIME type to the Leonardo extension.
- Obtain the Leonardo presigned upload fields server-side.
- Inspect a readable presigned policy for a stricter size condition.
- Upload the processed binary and all returned fields to the presigned URL.
- Never send the Leonardo bearer token to the storage URL.
- Persist `initImageId` only after the storage upload returns HTTP 204.
- Release temporary transfer buffers after upload. Retain any durable source
  object needed by generation until output ingestion succeeds; use durable
  cleanup for failures and abandoned work under an explicit retention policy.

Do not rely only on `Content-Length`; clients can omit or falsify it. Stream to a
bounded temporary object or abort reading when the byte limit is crossed.

## Upload contract

Use a multipart request from the client to the application, then perform the
Leonardo upload from the server. A successful application response is:

```ts
interface InitialImageUploadResult {
  sourceId: string
  processedBytes: number
  width: number
  height: number
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
}
```

Keep `initImageId` strictly internal. Return the opaque application `sourceId`
and resolve it to `initImageId` on the server when creating the generation.

Request the presigned upload only after local validation succeeds. Upload every
field returned by Leonardo, append the binary file last, and let the multipart
implementation set its boundary. Treat only the documented HTTP 204 response as
success.

Do not retry the full camera flow after an upload error. Retry only a classified
transient operation:

- Reuse a presigned URL only while it is known to remain valid.
- Request a new presigned upload after an expired-signature response.
- Do not create a generation until one upload is confirmed.
- Serialize upload attempts for the same application source record.

## Error behavior

Map errors to actions rather than exposing raw provider responses:

| Failure                              | User or system action                                  |
| ------------------------------------ | ------------------------------------------------------ |
| Camera unsupported                   | Explain that this browser cannot use the camera        |
| Permission denied                    | Show browser settings guidance and retry action        |
| Camera unavailable or in use         | Allow retry                                            |
| Empty video dimensions               | Wait for metadata; do not capture a blank frame        |
| Compression cannot meet target       | Explain that the picture could not be prepared; retry  |
| Presigned policy limit is lower      | Recompress against that limit or reject                |
| Leonardo init request is 400/401/403 | Do not retry automatically                             |
| Leonardo or storage returns 429/5xx  | Retry with bounded backoff according to provider rules |
| Storage upload is not HTTP 204       | Do not persist the provider image ID as ready          |

Never include image bytes, data URLs, presigned fields, or bearer tokens in
logs. Log byte counts, dimensions, format, elapsed time, attempt number, and
sanitized failure category.

## Accessibility and privacy

- Label camera activation, switch, capture, retake, use-photo, and cancel
  controls.
- Keep keyboard focus visible and move focus to the preview actions after
  capture.
- Announce permission, countdown values, compression, upload progress, and
  errors through an appropriate live region. Announce each countdown number
  once; do not announce high-frequency timer updates.
- Keep focus on the countdown cancel action while counting down. After
  cancellation, return focus to **Take photo**; after capture, move focus to the
  preview actions.
- Explain why camera access is requested before triggering the browser prompt.
- Do not start the camera automatically before theme selection. After selection,
  automatic startup is permitted only for already-granted camera permission.
- Show the exact preview that will be submitted.
- Stop camera tracks as soon as they are no longer needed.
- Do not persist the source longer than the generation workflow requires.

## Required tests

Cover at least:

- Camera permission granted auto-starts after theme selection; prompt, denied,
  dismissed, unavailable, and unsupported states retain the explicit activation
  action and recovery behavior.
- Front and rear camera switching without leaked media tracks.
- Component unmount, navigation, retake, and cancel all stop tracks.
- Capture waits for non-zero video dimensions.
- Take-photo click displays `3`, `2`, `1` and cannot capture before 3000
  milliseconds have elapsed on the monotonic clock.
- Timer drift still results in one capture at or after the original deadline.
- Rapid clicks create one countdown and one captured frame.
- Cancel button, Escape, hidden document, ended track, camera switch,
  navigation, and unmount prevent capture from stale timer callbacks.
- Successful capture stops the stream; retake starts a new stream and a new
  three-second countdown.
- Countdown announcements occur once per displayed second and reduced-motion
  mode avoids a flashing shutter effect.
- Preview crop and front-camera mirroring match the submitted frame.
- Exact-boundary and one-byte-over inbound and upload limits.
- JPEG, PNG, WebP, corrupt bytes, spoofed MIME, SVG, and unsupported HEIC.
- Very large dimensions with a small compressed file.
- High-entropy image that requires iterative quality and dimension reduction.
- Image that cannot meet the target without crossing minimum quality or size.
- EXIF orientation and GPS metadata removal.
- Client validation bypass followed by server rejection.
- Presigned policy lower than the application hard limit.
- Presigned upload HTTP 204, expiration, 429, and 5xx behavior.
- Duplicate submit and retry do not create multiple ready source records.
- Temporary source cleanup after success, failure, and process restart.

## Implementation constraints

```text
- Capture and compress to a binary Blob before sending the image to the server.
- Do not use base64 or data URLs as the upload transport.
- Use a 5 MiB provider-facing ceiling and 4 MiB upper compression target, both
  reduced by the 4,000,000-byte total application request budget, actual
  multipart overhead, and any lower provider policy limit.
- Treat those numbers as configurable application limits, not documented
  Leonardo limits.
- Inspect the presigned POST policy and obey a lower provider limit when present.
- Enforce compressed bytes, decoded pixels, and dimensions again on the server.
- Accept only decoded JPEG, PNG, or WebP and make extension match the bytes.
- Use iterative quality reduction followed by proportional resizing.
- Never reduce below quality 0.5 or a 768-pixel longest edge silently.
- Strip metadata and normalize orientation before upload.
- Request the Leonardo presigned upload only after validation and compression.
- Do not send Leonardo authorization to the presigned storage URL.
- Persist initImageId only after the storage upload returns HTTP 204.
- Start the camera automatically only after theme selection when permission is
  already granted; otherwise activate it only after an explicit user action.
  Keep at most one active stream.
- Start an uncached three-second countdown for each accepted Take photo action.
- Display 3, 2, 1 and capture once at or after the monotonic deadline.
- Cancel the countdown on user cancellation, hidden document, ended track,
  camera switch, navigation, error, or unmount; stale callbacks must be inert.
- Stop all tracks on capture, leaving/cancelling the camera flow, error,
  switching, and unmount. Countdown cancellation alone returns to streaming.
- Never log or persist source bytes longer than required.
```

## Official sources checked

- [Upload an Image and Print the Image ID](https://docs.leonardo.ai/recipes/uploading-an-image), updated 2026-01-20
- [General API FAQs](https://docs.leonardo.ai/docs/api-faq), including supported upload extensions
- [GPT Image 2.5 Flare](https://docs.leonardo.ai/docs/gpt-image-25-flare), updated 2026-09-09
- [Nano Banana 2 Lite](https://docs.leonardo.ai/docs/nano-banana-2-lite), updated 2026-07-07
