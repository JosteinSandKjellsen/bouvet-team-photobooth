import { Buffer } from 'node:buffer'
import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'
import sharp from 'sharp'

const leonardoGenerationUrl =
  'https://cloud.leonardo.ai/api/rest/v2/generations'
const leonardoModel = 'openai/gpt-image-2.5-flare'
const leonardoRequestTimeoutMs = 15_000
const maxGeneratedOutputBytes = 8_000_000

const themePrompts: Record<ThemeDescriptor['id'], string> = {
  'block-world':
    'Reimagine the people in the reference photo as a cheerful block-built adventure team in a colorful landscape. Keep every person recognizable and preserve the group composition.',
  'kids-on-bikes':
    'Reimagine the people in the reference photo as a close-knit 1980s mystery-adventure team with bicycles, flashlights and cinematic small-town atmosphere. Keep every person recognizable and preserve the group composition.',
  'life-simulation':
    'Reimagine the people in the reference photo as a playful life-simulation household in a bright stylized neighborhood. Keep every person recognizable and preserve the group composition.',
  'mech-pilots':
    'Reimagine the people in the reference photo as an elite team of futuristic mech pilots in a cinematic hangar. Keep every person recognizable and preserve the group composition.',
  'red-carpet':
    'Reimagine the people in the reference photo as a glamorous ensemble arriving together on a film-premiere red carpet. Keep every person recognizable and preserve the group composition.',
  samurai:
    'Reimagine the people in the reference photo as a dignified samurai team in a cinematic historical landscape. Keep every person recognizable and preserve the group composition.',
  'space-cowboys':
    'Reimagine the people in the reference photo as a charismatic crew of space cowboys on a vivid frontier planet. Keep every person recognizable and preserve the group composition.',
  treehouse:
    'Reimagine the people in the reference photo as an inventive woodland team gathered around an extraordinary treehouse. Keep every person recognizable and preserve the group composition.',
  wasteland:
    'Reimagine the people in the reference photo as a resilient post-apocalyptic survivor team in a cinematic wasteland. Keep every person recognizable and preserve the group composition.',
}

interface GenerationSubmission {
  generationId: string
  sourceImage?: Uint8Array
  themeId?: ThemeDescriptor['id']
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
  if (!apiKey || !submission.sourceImage?.byteLength || !submission.themeId) {
    throw new Error('Generation provider is unavailable')
  }

  const response = await fetch(leonardoGenerationUrl, {
    body: JSON.stringify({
      model: leonardoModel,
      parameters: {
        guidances: {
          image_reference: [
            {
              image: {
                data: Buffer.from(submission.sourceImage).toString('base64'),
                type: 'BASE64',
              },
            },
          ],
        },
        height: 768,
        prompt: themePrompts[submission.themeId],
        prompt_enhance: 'AUTO',
        quantity: 1,
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

  if (!response.ok) throw new Error('Generation provider request failed')

  const body: unknown = await response.json()
  if (!isLeonardoGenerationResponse(body)) {
    throw new Error('Invalid generation provider response')
  }

  return {
    apiCreditCost: body.apiCreditCost,
    providerGenerationId: body.generationId,
  }
}

function isLeonardoGenerationResponse(
  value: unknown,
): value is { apiCreditCost?: number; generationId: string } {
  if (!value || typeof value !== 'object') return false

  const response = value as Record<string, unknown>
  return (
    typeof response.generationId === 'string' &&
    response.generationId.length > 0 &&
    (response.apiCreditCost === undefined ||
      (Number.isInteger(response.apiCreditCost) &&
        (response.apiCreditCost as number) >= 0))
  )
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
