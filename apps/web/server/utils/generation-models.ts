export const currentGenerationModelProfileId = 'gpt-image-2-5-sunburst-v1'
export const nanoBananaModelProfileId = 'nano-banana-2-lite-v1'
export const nanoBananaIllustrationModelProfileId =
  'nano-banana-illustration-v1'
export const nanoBananaDynamicModelProfileId = 'nano-banana-dynamic-v1'
export const nanoBananaDynamicV2ModelProfileId = 'nano-banana-dynamic-v2'
export const nanoBananaDynamicV3ModelProfileId = 'nano-banana-dynamic-v3'

export const generationModelProfiles = {
  [currentGenerationModelProfileId]: {
    creditReservation: 50,
    model: 'openai/gpt-image-2.5-sunburst',
    parameters: {
      height: 768,
      prompt_enhance: 'OFF',
      quality: 'MEDIUM',
      quantity: 1,
      style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
      width: 1376,
    },
  },
  [nanoBananaModelProfileId]: {
    creditReservation: 50,
    model: 'nano-banana-2-lite',
    parameters: {
      height: 768,
      prompt_enhance: 'OFF',
      quantity: 1,
      style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
      width: 1376,
    },
  },
  [nanoBananaIllustrationModelProfileId]: {
    creditReservation: 50,
    model: 'gemini-2.5-flash-image',
    parameters: {
      height: 768,
      prompt_enhance: 'OFF',
      quantity: 1,
      style_ids: ['645e4195-f63d-4715-a3f2-3fb1e6eb8c70'],
      width: 1376,
    },
  },
  [nanoBananaDynamicModelProfileId]: {
    creditReservation: 50,
    model: 'gemini-2.5-flash-image',
    parameters: {
      height: 768,
      prompt_enhance: 'OFF',
      quantity: 1,
      style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
      width: 1376,
    },
  },
  [nanoBananaDynamicV2ModelProfileId]: {
    creditReservation: 50,
    model: '4a008a65-8d97-44f5-97a0-66c431612614',
    parameters: {
      height: 768,
      prompt_enhance: 'OFF',
      quantity: 1,
      style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
      width: 1344,
    },
  },
  [nanoBananaDynamicV3ModelProfileId]: {
    creditReservation: 50,
    imageReferenceStrength: 'MID',
    model: 'gemini-2.5-flash-image',
    parameters: {
      height: 768,
      prompt_enhance: 'OFF',
      quantity: 1,
      style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
      width: 1344,
    },
  },
} as const

export type GenerationModelProfileId = keyof typeof generationModelProfiles

export function getGenerationModelProfile(
  modelProfileId: string,
): (typeof generationModelProfiles)[GenerationModelProfileId] | undefined {
  return generationModelProfiles[modelProfileId as GenerationModelProfileId]
}
