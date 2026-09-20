import type { HealthResponse } from '@bouvet-team-photobooth/contracts'

export default defineEventHandler((): HealthResponse => ({ status: 'ok' }))
