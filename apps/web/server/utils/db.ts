import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const adapter = new PrismaPg({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX ?? '3'),
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
})

export const db = new PrismaClient({ adapter })
