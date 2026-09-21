import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

config({ path: new URL('../../.env', import.meta.url).pathname })

const schemaUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!schemaUrl) {
  throw new Error('DIRECT_URL or DATABASE_URL is required')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: schemaUrl,
  },
})
