import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'
import sharp from 'sharp'
import { themePrompts } from './theme-prompts'

const leonardoInitImageUrl = 'https://cloud.leonardo.ai/api/rest/v1/init-image'
const leonardoGenerationUrl =
  'https://cloud.leonardo.ai/api/rest/v2/generations'
const leonardoGenerationStatusUrl =
  'https://cloud.leonardo.ai/api/rest/v1/generations'
const leonardoModel = 'openai/gpt-image-2.5-sunburst'
const leonardoStyle = '111dc692-d470-4eec-b791-3475abac4c46'
const leonardoRequestTimeoutMs = 15_000
const maxGeneratedOutputBytes = 8_000_000
const maxProviderErrorMessageLength = 300

interface GenerationSubmission {
  generationId: string
  providerSourceImageId?: string
  themeId?: ThemeDescriptor['id']
}

export interface GenerationSourceUpload {
  fields: Record<string, string>
  providerSourceImageId: string
  uploadUrl: string
}

export class GenerationSubmissionOutcomeUnknownError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GenerationSubmissionOutcomeUnknownError'
  }
}

export class GenerationSourceDeletionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'GenerationSourceDeletionError'
  }
}

export async function createGenerationSourceUpload(): Promise<GenerationSourceUpload> {
  const apiKey = getLeonardoApiKey()
  let response: Response
  try {
    response = await fetch(leonardoInitImageUrl, {
      body: JSON.stringify({ extension: 'jpg' }),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(leonardoRequestTimeoutMs),
    })
  } catch {
    throw new Error('Generation source upload could not be initialized')
  }

  if (!response.ok) {
    throw new Error(
      `Generation source upload could not be initialized (status=${response.status})`,
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Invalid generation source upload response')
  }
  const upload = parseLeonardoSourceUpload(body)
  if (!upload) throw new Error('Invalid generation source upload response')
  return upload
}

export async function uploadGenerationSource(
  upload: GenerationSourceUpload,
  sourceImage: Uint8Array,
) {
  if (!sourceImage.byteLength) {
    throw new Error('Generation source image is unavailable')
  }

  const body = new FormData()
  for (const [name, value] of Object.entries(upload.fields)) {
    body.append(name, value)
  }
  body.append(
    'file',
    new Blob([Uint8Array.from(sourceImage)], { type: 'image/jpeg' }),
    'source.jpg',
  )

  let response: Response
  try {
    response = await fetch(upload.uploadUrl, {
      body,
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(leonardoRequestTimeoutMs),
    })
  } catch {
    throw new Error('Generation source upload outcome is unknown')
  }
  if (response.status !== 204) {
    throw new Error(
      `Generation source upload failed (status=${response.status})`,
    )
  }
}

export async function deleteGenerationSource(providerSourceImageId: string) {
  const apiKey = getLeonardoApiKey()
  let response: Response
  try {
    response = await fetch(
      `${leonardoInitImageUrl}/${encodeURIComponent(providerSourceImageId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        method: 'DELETE',
        signal: AbortSignal.timeout(leonardoRequestTimeoutMs),
      },
    )
  } catch {
    throw new GenerationSourceDeletionError(
      'Generation source deletion is unavailable',
      true,
    )
  }

  if (!response.ok) {
    throw new GenerationSourceDeletionError(
      `Generation source deletion failed (status=${response.status})`,
      isRetryableProviderStatus(response.status),
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new GenerationSourceDeletionError(
      'Invalid generation source deletion response',
      false,
    )
  }
  if (!isConfirmedGenerationSourceDeletion(body, providerSourceImageId)) {
    throw new GenerationSourceDeletionError(
      'Unconfirmed generation source deletion response',
      false,
    )
  }
}

export async function submitGeneration(submission: GenerationSubmission) {
  if (process.env.GENERATION_PROVIDER === 'deterministic') {
    return {
      providerGenerationId: `deterministic-${submission.generationId}`,
    }
  }

  if (process.env.GENERATION_PROVIDER !== 'leonardo') {
    throw new Error('Generation provider is unavailable')
  }

  const apiKey = process.env.LEONARDO_API_KEY
  if (!apiKey || !submission.providerSourceImageId || !submission.themeId) {
    throw new Error('Generation provider is unavailable')
  }

  let response: Response
  try {
    response = await fetch(leonardoGenerationUrl, {
      body: JSON.stringify({
        model: leonardoModel,
        parameters: {
          guidances: {
            image_reference: [
              {
                image: {
                  id: submission.providerSourceImageId,
                  type: 'UPLOADED',
                },
              },
            ],
          },
          height: 768,
          prompt: themePrompts[submission.themeId],
          prompt_enhance: 'OFF',
          quality: 'MEDIUM',
          quantity: 1,
          style_ids: [leonardoStyle],
          width: 1376,
        },
        public: false,
      }),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(leonardoRequestTimeoutMs),
    })
  } catch {
    throw new GenerationSubmissionOutcomeUnknownError(
      'Generation provider request outcome is unknown',
    )
  }

  if (!response.ok) {
    throw new GenerationSubmissionOutcomeUnknownError(
      `Generation provider request outcome is unknown (status=${response.status})`,
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new GenerationSubmissionOutcomeUnknownError(
      `Invalid generation provider response (status=${response.status}, type=non-json)`,
    )
  }
  const generation = parseLeonardoGenerationResponse(body)
  if (!generation) {
    throw new GenerationSubmissionOutcomeUnknownError(
      `Invalid generation provider response (${describeLeonardoResponse(
        body,
        response.headers.get('x-request-id'),
      )})`,
    )
  }

  return {
    apiCreditCost: generation.apiCreditCost ?? undefined,
    providerGenerationId: generation.generationId,
  }
}

function getLeonardoApiKey() {
  if (process.env.GENERATION_PROVIDER !== 'leonardo') {
    throw new Error('Generation provider is unavailable')
  }
  const apiKey = process.env.LEONARDO_API_KEY
  if (!apiKey) throw new Error('Generation provider is unavailable')
  return apiKey
}

function parseLeonardoSourceUpload(
  value: unknown,
): GenerationSourceUpload | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const upload = (value as Record<string, unknown>).uploadInitImage
  if (!upload || typeof upload !== 'object' || Array.isArray(upload)) return

  const response = upload as Record<string, unknown>
  if (
    typeof response.id !== 'string' ||
    !response.id ||
    typeof response.url !== 'string' ||
    !isHttpsUrl(response.url) ||
    typeof response.fields !== 'string'
  ) {
    return
  }

  let fields: unknown
  try {
    fields = JSON.parse(response.fields)
  } catch {
    return
  }
  if (!isStringRecord(fields)) return

  return {
    fields,
    providerSourceImageId: response.id,
    uploadUrl: response.url,
  }
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((item) => typeof item === 'string')
}

function isConfirmedGenerationSourceDeletion(
  value: unknown,
  providerSourceImageId: string,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const deleted = (value as Record<string, unknown>).delete_init_images_by_pk
  if (!deleted || typeof deleted !== 'object' || Array.isArray(deleted)) {
    return false
  }
  return (deleted as Record<string, unknown>).id === providerSourceImageId
}

function isRetryableProviderStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

type LeonardoGenerationResponse = {
  apiCreditCost?: number | null
  generationId: string
}

function parseLeonardoGenerationResponse(
  value: unknown,
): LeonardoGenerationResponse | undefined {
  if (isLeonardoGenerationResponse(value)) return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return

  const generation = (value as Record<string, unknown>).generate
  return isLeonardoGenerationResponse(generation) ? generation : undefined
}

function isLeonardoGenerationResponse(
  value: unknown,
): value is LeonardoGenerationResponse {
  if (!value || typeof value !== 'object') return false

  const response = value as Record<string, unknown>
  return (
    typeof response.generationId === 'string' &&
    response.generationId.length > 0 &&
    (response.apiCreditCost == null ||
      (Number.isInteger(response.apiCreditCost) &&
        (response.apiCreditCost as number) >= 0))
  )
}

function describeLeonardoResponse(value: unknown, requestId: string | null) {
  const details = requestId ? [`requestId=${requestId}`] : []
  if (value === null) return [...details, 'type=null'].join(', ')
  if (Array.isArray(value)) {
    const firstItem = value[0]
    const firstItemKeys =
      firstItem && typeof firstItem === 'object' && !Array.isArray(firstItem)
        ? Object.keys(firstItem).sort().slice(0, 10).join('|') || 'none'
        : typeof firstItem
    const graphQlError = describeGraphQlError(firstItem)
    return [
      ...details,
      `arrayLength=${value.length}`,
      `firstItemKeys=${firstItemKeys}`,
      ...graphQlError,
    ].join(', ')
  }
  if (typeof value !== 'object') {
    return [...details, `type=${typeof value}`].join(', ')
  }

  const keys = Object.keys(value)
    .sort()
    .slice(0, 10)
    .map((key) => key.slice(0, 50))
  return [...details, `keys=${keys.join('|') || 'none'}`].join(', ')
}

function describeGraphQlError(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  const error = value as Record<string, unknown>
  const details: string[] = []
  if (
    error.extensions &&
    typeof error.extensions === 'object' &&
    !Array.isArray(error.extensions)
  ) {
    const code = (error.extensions as Record<string, unknown>).code
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,49}$/.test(code)) {
      details.push(`errorCode=${code}`)
    }
  }
  if (typeof error.message === 'string') {
    details.push(`errorMessage=${sanitizeProviderErrorMessage(error.message)}`)
  }
  return details
}

function sanitizeProviderErrorMessage(value: string) {
  return value
    .replace(/(['"]).*?\1/g, '<redacted>')
    .replace(/https?:\/\/\S+/gi, '<redacted-url>')
    .replace(/\bBearer\s+\S+/gi, 'Bearer <redacted>')
    .replace(/[A-Za-z0-9+/=_-]{40,}/g, '<redacted-value>')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxProviderErrorMessageLength)
}

export async function getGenerationCompletion(providerGenerationId: string) {
  const apiKey = getLeonardoApiKey()
  let response: Response
  try {
    response = await fetch(
      `${leonardoGenerationStatusUrl}/${encodeURIComponent(providerGenerationId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        method: 'GET',
        signal: AbortSignal.timeout(leonardoRequestTimeoutMs),
      },
    )
  } catch {
    throw new Error('Generation completion status is unavailable')
  }
  if (!response.ok) {
    throw new Error(
      `Generation completion status is unavailable (status=${response.status})`,
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Invalid generation completion response')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid generation completion response')
  }

  const generation = (body as Record<string, unknown>).generations_by_pk
  if (
    !generation ||
    typeof generation !== 'object' ||
    Array.isArray(generation)
  ) {
    throw new Error('Invalid generation completion response')
  }

  const result = generation as Record<string, unknown>
  if (result.id !== providerGenerationId) {
    throw new Error('Invalid generation completion response')
  }
  if (result.status === 'PENDING') return { status: 'PENDING' as const }
  if (result.status === 'FAILED') return { status: 'FAILED' as const }
  if (result.status !== 'COMPLETE' || !Array.isArray(result.generated_images)) {
    throw new Error('Invalid generation completion response')
  }

  const firstImage = result.generated_images[0]
  if (
    !firstImage ||
    typeof firstImage !== 'object' ||
    Array.isArray(firstImage)
  ) {
    throw new Error('Invalid generation completion response')
  }
  const providerOutputUrl = (firstImage as Record<string, unknown>).url
  if (
    typeof providerOutputUrl !== 'string' ||
    !isLeonardoOutputUrl(providerOutputUrl)
  ) {
    throw new Error('Invalid generation completion response')
  }

  return { providerOutputUrl, status: 'COMPLETE' as const }
}

export async function getGeneratedOutput(
  providerGenerationId: string,
  providerOutputUrl?: string,
) {
  if (
    process.env.GENERATION_PROVIDER === 'deterministic' &&
    providerGenerationId.startsWith('deterministic-')
  ) {
    const image = await sharp({
      create: {
        background: { b: 160, g: 90, r: 18 },
        channels: 3,
        height: 768,
        width: 1376,
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer()

    return { contentType: 'image/jpeg', image: new Uint8Array(image) }
  }

  if (
    process.env.GENERATION_PROVIDER !== 'leonardo' ||
    !isLeonardoOutputUrl(providerOutputUrl)
  ) {
    throw new Error('Generation provider is unavailable')
  }

  const response = await fetch(providerOutputUrl, {
    headers: { Accept: 'image/jpeg' },
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(leonardoRequestTimeoutMs),
  })
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]
  const contentLength = response.headers.get('content-length')
  const declaredLength = contentLength ? Number(contentLength) : undefined
  if (
    !response.ok ||
    contentType !== 'image/jpeg' ||
    (declaredLength !== undefined &&
      (!Number.isSafeInteger(declaredLength) ||
        declaredLength < 1 ||
        declaredLength > maxGeneratedOutputBytes)) ||
    !response.body
  ) {
    throw new Error('Invalid generated output')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > maxGeneratedOutputBytes) {
      await reader.cancel()
      throw new Error('Invalid generated output')
    }
    chunks.push(value)
  }

  const image = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    image.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { contentType, image }
}

function isLeonardoOutputUrl(value: string | undefined): value is string {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'cdn.leonardo.ai'
  } catch {
    return false
  }
}
