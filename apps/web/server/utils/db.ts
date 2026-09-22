import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

let client: PrismaClient | undefined

function getClient() {
  if (client) return client

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
  client = new PrismaClient({ adapter })
  return client
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const target = getClient()
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  },
})
