import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'
import { currentGenerationModelProfileId } from './generation-models'

export const themeGeneration = {
  'block-world': { modelProfileId: currentGenerationModelProfileId },
  'kids-on-bikes': { modelProfileId: currentGenerationModelProfileId },
  'life-simulation': { modelProfileId: currentGenerationModelProfileId },
  'mech-pilots': { modelProfileId: currentGenerationModelProfileId },
  'red-carpet': { modelProfileId: currentGenerationModelProfileId },
  samurai: { modelProfileId: currentGenerationModelProfileId },
  'space-cowboys': { modelProfileId: currentGenerationModelProfileId },
  treehouse: { modelProfileId: currentGenerationModelProfileId },
  wasteland: { modelProfileId: currentGenerationModelProfileId },
} satisfies Record<ThemeDescriptor['id'], { modelProfileId: string }>

export function getThemeGeneration(themeId: ThemeDescriptor['id']): {
  modelProfileId: string
} {
  return themeGeneration[themeId]
}
