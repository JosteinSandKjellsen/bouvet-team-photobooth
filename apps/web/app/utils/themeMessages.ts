import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'

export const themeMessages: Record<
  ThemeDescriptor['id'],
  { name: string; description: string }
> = {
  wasteland: {
    name: 'themes.wasteland.name',
    description: 'themes.wasteland.description',
  },
  treehouse: {
    name: 'themes.treehouse.name',
    description: 'themes.treehouse.description',
  },
  'block-world': {
    name: 'themes.blockWorld.name',
    description: 'themes.blockWorld.description',
  },
  'space-cowboys': {
    name: 'themes.spaceCowboys.name',
    description: 'themes.spaceCowboys.description',
  },
  'life-simulation': {
    name: 'themes.lifeSimulation.name',
    description: 'themes.lifeSimulation.description',
  },
  'mech-pilots': {
    name: 'themes.mechPilots.name',
    description: 'themes.mechPilots.description',
  },
  'kids-on-bikes': {
    name: 'themes.kidsOnBikes.name',
    description: 'themes.kidsOnBikes.description',
  },
  'red-carpet': {
    name: 'themes.redCarpet.name',
    description: 'themes.redCarpet.description',
  },
  samurai: {
    name: 'themes.samurai.name',
    description: 'themes.samurai.description',
  },
}
