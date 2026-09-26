import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'
import {
  currentGenerationModelProfileId,
  nanoBananaDynamicV3ModelProfileId,
  nanoBananaModelProfileId,
} from './generation-models'

export const themeGeneration = {
  'block-world': { modelProfileId: currentGenerationModelProfileId },
  'kids-on-bikes': { modelProfileId: nanoBananaModelProfileId },
  'life-simulation': { modelProfileId: nanoBananaModelProfileId },
  'mech-pilots': { modelProfileId: currentGenerationModelProfileId },
  'red-carpet': { modelProfileId: nanoBananaDynamicV3ModelProfileId },
  samurai: { modelProfileId: nanoBananaModelProfileId },
  'space-cowboys': { modelProfileId: nanoBananaDynamicV3ModelProfileId },
  treehouse: { modelProfileId: nanoBananaDynamicV3ModelProfileId },
  wasteland: { modelProfileId: nanoBananaDynamicV3ModelProfileId },
} satisfies Record<ThemeDescriptor['id'], { modelProfileId: string }>

export function getThemeGeneration(themeId: ThemeDescriptor['id']): {
  modelProfileId: string
} {
  return themeGeneration[themeId]
}
