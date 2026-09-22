import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../server/generated/prisma/client'

let client: PrismaClient | undefined

// Direct Prisma access for e2e tests that must observe or backdate
// cleanup-job state the public API intentionally never exposes.
export function getTestDb() {
  if (!client) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is required')
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    })
  }
  return client
}
