import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'
import { blockWorldPrompt } from './block-world'
import { kidsOnBikesPrompt } from './kids-on-bikes'
import { lifeSimulationPrompt } from './life-simulation'
import { mechPilotsPrompt } from './mech-pilots'
import { redCarpetPrompt } from './red-carpet'
import { samuraiPrompt } from './samurai'
import { spaceCowboysPrompt } from './space-cowboys'
import { treehousePrompt } from './treehouse'
import { wastelandPrompt } from './wasteland'

export const themePrompts: Record<ThemeDescriptor['id'], string> = {
  'block-world': blockWorldPrompt,
  'kids-on-bikes': kidsOnBikesPrompt,
  'life-simulation': lifeSimulationPrompt,
  'mech-pilots': mechPilotsPrompt,
  'red-carpet': redCarpetPrompt,
  samurai: samuraiPrompt,
  'space-cowboys': spaceCowboysPrompt,
  treehouse: treehousePrompt,
  wasteland: wastelandPrompt,
}
