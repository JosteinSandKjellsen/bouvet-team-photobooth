import { describe, expect, it } from 'vitest'
import {
  currentGenerationModelProfileId,
  getGenerationModelProfile,
  nanoBananaDynamicModelProfileId,
  nanoBananaDynamicV2ModelProfileId,
  nanoBananaDynamicV3ModelProfileId,
  nanoBananaIllustrationModelProfileId,
  nanoBananaModelProfileId,
} from '../../server/utils/generation-models'
import {
  getThemeGeneration,
  themeGeneration,
} from '../../server/utils/theme-generation'
import { themes } from '../../server/utils/themes'

describe('theme generation profiles', () => {
  it('assigns approved themes to their Nano Banana profiles', () => {
    expect(Object.keys(themeGeneration).sort()).toEqual(
      themes.map((theme) => theme.id).sort(),
    )

    for (const theme of themes) {
      expect(getThemeGeneration(theme.id).modelProfileId).toBe(
        theme.id === 'samurai' || theme.id === 'kids-on-bikes'
          ? nanoBananaModelProfileId
          : ['space-cowboys', 'treehouse', 'wasteland'].includes(theme.id)
            ? nanoBananaDynamicV3ModelProfileId
            : currentGenerationModelProfileId,
      )
    }
  })

  it('keeps the current profile server-owned and complete', () => {
    expect(
      getGenerationModelProfile(currentGenerationModelProfileId),
    ).toMatchObject({
      creditReservation: 50,
      model: 'openai/gpt-image-2.5-sunburst',
      parameters: { quantity: 1 },
    })
    expect(getGenerationModelProfile('unapproved-model')).toBeUndefined()
    expect(getGenerationModelProfile(nanoBananaModelProfileId)).toMatchObject({
      creditReservation: 50,
      model: 'nano-banana-2-lite',
      parameters: { quantity: 1 },
    })
    expect(
      getGenerationModelProfile(nanoBananaIllustrationModelProfileId),
    ).toMatchObject({
      creditReservation: 50,
      model: 'gemini-2.5-flash-image',
      parameters: {
        quantity: 1,
        style_ids: ['645e4195-f63d-4715-a3f2-3fb1e6eb8c70'],
      },
    })
    expect(
      getGenerationModelProfile(nanoBananaDynamicModelProfileId),
    ).toMatchObject({
      creditReservation: 50,
      model: 'gemini-2.5-flash-image',
      parameters: {
        quantity: 1,
        style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
      },
    })
    expect(
      getGenerationModelProfile(nanoBananaDynamicV2ModelProfileId),
    ).toMatchObject({
      creditReservation: 50,
      model: '4a008a65-8d97-44f5-97a0-66c431612614',
      parameters: {
        height: 768,
        quantity: 1,
        style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
        width: 1344,
      },
    })
    expect(
      getGenerationModelProfile(nanoBananaDynamicV3ModelProfileId),
    ).toMatchObject({
      creditReservation: 50,
      imageReferenceStrength: 'MID',
      model: 'gemini-2.5-flash-image',
      parameters: {
        height: 768,
        quantity: 1,
        style_ids: ['111dc692-d470-4eec-b791-3475abac4c46'],
        width: 1344,
      },
    })
  })
})
