import type { AdminAvailabilityResponse } from '@bouvet-team-photobooth/contracts'
import { getAdminAvailability } from '../../utils/admin-sessions'

export default defineEventHandler((event): AdminAvailabilityResponse =>
  getAdminAvailability(event),
)
