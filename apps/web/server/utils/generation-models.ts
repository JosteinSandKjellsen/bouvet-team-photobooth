export const currentGenerationModelProfileId = 'gpt-image-2-5-sunburst-v1'

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
} as const

export type GenerationModelProfileId = keyof typeof generationModelProfiles

export function getGenerationModelProfile(
  modelProfileId: string,
): (typeof generationModelProfiles)[GenerationModelProfileId] | undefined {
  return generationModelProfiles[modelProfileId as GenerationModelProfileId]
}
