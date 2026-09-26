import type { AdminSessionResponse } from '@bouvet-team-photobooth/contracts'
import {
  adminLeaseMs,
  requireAdminSession,
} from '../../../utils/admin-sessions'
import { db } from '../../../utils/db'

export default defineEventHandler(
  async (event): Promise<AdminSessionResponse> => {
    const session = await requireAdminSession(event)
    const expiresAt = new Date(Date.now() + adminLeaseMs)
    const updated = await db.adminSession.updateMany({
      where: { id: session.id, expiresAt: { gt: new Date() } },
      data: { expiresAt },
    })
    if (!updated.count) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Admin session expired',
      })
    }
    return { expiresAt: expiresAt.toISOString() }
  },
)
