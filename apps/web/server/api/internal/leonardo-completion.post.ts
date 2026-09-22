import { timingSafeEqual } from 'node:crypto'
import { recordGenerationCompletion } from '../../utils/generation-completion'

interface LeonardoCompletion {
  providerGenerationId: string
  providerOutputUrl: string
}

const hasValidWebhookToken = (provided: string, expected: string) => {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  )
}

export default defineEventHandler(async (event) => {
  const { leonardoWebhookToken } = useRuntimeConfig(event)
  const authorization = getRequestHeader(event, 'authorization')
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]

  if (
    typeof leonardoWebhookToken !== 'string' ||
    leonardoWebhookToken.length === 0 ||
    !token ||
    !hasValidWebhookToken(token, leonardoWebhookToken)
  ) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const completion = parseLeonardoCompletion(await readBody<unknown>(event))
  if (!completion) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid completion' })
  }

  await recordGenerationCompletion(
    completion.providerGenerationId,
    completion.providerOutputUrl,
  )
  setResponseStatus(event, 204)
})

function parseLeonardoCompletion(value: unknown): LeonardoCompletion | null {
  if (!value || typeof value !== 'object') return null

  const payload = value as Record<string, unknown>
  if (payload.type !== 'image_generation.complete') return null

  const data = payload.data
  if (!data || typeof data !== 'object') return null
  const object = (data as Record<string, unknown>).object
  if (!object || typeof object !== 'object') return null

  const generation = object as Record<string, unknown>
  if (
    typeof generation.id !== 'string' ||
    generation.id.length === 0 ||
    generation.status !== 'COMPLETE' ||
    !Array.isArray(generation.images) ||
    generation.images.length !== 1
  ) {
    return null
  }

  const image = generation.images[0]
  if (!image || typeof image !== 'object') return null
  const outputUrl = (image as Record<string, unknown>).url
  if (typeof outputUrl !== 'string') return null

  try {
    const url = new URL(outputUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.leonardo.ai') {
      return null
    }
  } catch {
    return null
  }

  return {
    providerGenerationId: generation.id,
    providerOutputUrl: outputUrl,
  }
}
