import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const serverEntryUrl = pathToFileURL(
  resolve(scriptDirectory, '../apps/web/.output/server/index.mjs'),
).href

globalThis._importMeta_ = { env: process.env, url: serverEntryUrl }

await import(serverEntryUrl)
