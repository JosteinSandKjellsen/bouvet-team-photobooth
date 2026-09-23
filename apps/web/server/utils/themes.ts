import type { ThemeDescriptor } from '@bouvet-team-photobooth/contracts'

export const themes: ThemeDescriptor[] = [
  { id: 'space-cowboys', image: '/themes/space-cowboys.jpg' },
  { id: 'treehouse', image: '/themes/treehouse.jpg' },
  { id: 'block-world', image: '/themes/block-world.jpg' },
  { id: 'wasteland', image: '/themes/wasteland.jpg' },
  { id: 'life-simulation', image: '/themes/life-simulation.jpg' },
  { id: 'mech-pilots', image: '/themes/mech-pilots.jpg' },
  { id: 'kids-on-bikes', image: '/themes/kids-on-bikes.jpg' },
  { id: 'red-carpet', image: '/themes/red-carpet.jpg' },
  { id: 'samurai', image: '/themes/samurai.jpg' },
]

export const isThemeId = (value: string): value is ThemeDescriptor['id'] =>
  themes.some((theme) => theme.id === value)
