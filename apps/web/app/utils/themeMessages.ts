import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'

export const themeMessages: Record<
  ThemeDescriptor['id'],
  { name: string; label: string; description: string }
> = {
  wasteland: {
    name: 'themes.wasteland.name',
    label: 'themes.wasteland.label',
    description: 'themes.wasteland.description',
  },
  treehouse: {
    name: 'themes.treehouse.name',
    label: 'themes.treehouse.label',
    description: 'themes.treehouse.description',
  },
  'block-world': {
    name: 'themes.blockWorld.name',
    label: 'themes.blockWorld.label',
    description: 'themes.blockWorld.description',
  },
  'space-cowboys': {
    name: 'themes.spaceCowboys.name',
    label: 'themes.spaceCowboys.label',
    description: 'themes.spaceCowboys.description',
  },
  'life-simulation': {
    name: 'themes.lifeSimulation.name',
    label: 'themes.lifeSimulation.label',
    description: 'themes.lifeSimulation.description',
  },
  'mech-pilots': {
    name: 'themes.mechPilots.name',
    label: 'themes.mechPilots.label',
    description: 'themes.mechPilots.description',
  },
  'kids-on-bikes': {
    name: 'themes.kidsOnBikes.name',
    label: 'themes.kidsOnBikes.label',
    description: 'themes.kidsOnBikes.description',
  },
  'red-carpet': {
    name: 'themes.redCarpet.name',
    label: 'themes.redCarpet.label',
    description: 'themes.redCarpet.description',
  },
  samurai: {
    name: 'themes.samurai.name',
    label: 'themes.samurai.label',
    description: 'themes.samurai.description',
  },
}
