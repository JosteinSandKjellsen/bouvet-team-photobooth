import {
  adminCookieName,
  requireAdminSession,
} from '../../utils/admin-sessions'
import { db } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await requireAdminSession(event)
  await db.adminSession.deleteMany({ where: { id: session.id } })
  deleteCookie(event, adminCookieName, { path: '/api/admin' })
  setResponseStatus(event, 204)
})
