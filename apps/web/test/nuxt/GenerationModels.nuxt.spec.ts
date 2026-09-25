import { describe, expect, it } from 'vitest'
import {
  currentGenerationModelProfileId,
  getGenerationModelProfile,
} from '../../server/utils/generation-models'
import {
  getThemeGeneration,
  themeGeneration,
} from '../../server/utils/theme-generation'
import { themes } from '../../server/utils/themes'

describe('theme generation profiles', () => {
  it('assigns every configured theme to the current approved model profile', () => {
    expect(Object.keys(themeGeneration).sort()).toEqual(
      themes.map((theme) => theme.id).sort(),
    )

    for (const theme of themes) {
      expect(getThemeGeneration(theme.id).modelProfileId).toBe(
        currentGenerationModelProfileId,
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
  })
})
