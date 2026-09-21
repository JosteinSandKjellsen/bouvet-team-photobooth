export interface HealthResponse {
  status: 'ok'
}

export interface ThemeDescriptor {
  id:
    | 'wasteland'
    | 'treehouse'
    | 'block-world'
    | 'space-cowboys'
    | 'life-simulation'
    | 'mech-pilots'
    | 'kids-on-bikes'
    | 'red-carpet'
    | 'samurai'
  image: string
}

export interface ThemesResponse {
  themes: ThemeDescriptor[]
}

export interface SessionResponse {
  expiresAt: string
  themeId: ThemeDescriptor['id']
}
