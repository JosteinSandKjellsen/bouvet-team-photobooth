import type { AdminSessionResponse } from '@bouvet-team-photobooth/contracts'
import { loginAdmin } from '../../utils/admin-sessions'

export default defineEventHandler(
  async (event): Promise<AdminSessionResponse> => loginAdmin(event),
)
