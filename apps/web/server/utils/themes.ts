import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'

export const themes: ThemeDescriptor[] = [
  { id: 'wasteland', image: '/themes/wasteland.svg' },
  { id: 'treehouse', image: '/themes/treehouse.svg' },
  { id: 'block-world', image: '/themes/block-world.svg' },
  { id: 'space-cowboys', image: '/themes/space-cowboys.svg' },
  { id: 'life-simulation', image: '/themes/life-simulation.svg' },
  { id: 'mech-pilots', image: '/themes/mech-pilots.svg' },
  { id: 'kids-on-bikes', image: '/themes/kids-on-bikes.svg' },
  { id: 'red-carpet', image: '/themes/red-carpet.svg' },
  { id: 'samurai', image: '/themes/samurai.svg' },
]

export const isThemeId = (value: string): value is ThemeDescriptor['id'] =>
  themes.some((theme) => theme.id === value)
