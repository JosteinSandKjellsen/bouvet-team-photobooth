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

export interface SourceImageUploadResponse {
  height: number
  mimeType: 'image/jpeg'
  processedBytes: number
  sourceId: string
  width: number
}

export interface GenerationAcceptedResponse {
  jobId: string
  status: 'pending'
}

export interface GenerationStatusResponse {
  jobId: string
  resultPath?: string
  status:
    | 'pending'
    | 'submitting'
    | 'submission_unknown'
    | 'submitted'
    | 'succeeded'
    | 'failed'
}

export interface PublicPhotoResponse {
  downloadUrl: string
  height: number
  imageUrl: string
  width: number
}

export interface PublicPhotoListItem {
  height: number
  imageUrl: string
  publishedAt: string
  publicId: string
  width: number
}

export interface PublicPhotoCountResponse {
  completedCount: number
}

export interface PublicPhotoOverviewResponse {
  completedCount: number
  newerCursor?: string
  olderCursor?: string
  photos: PublicPhotoListItem[]
}
