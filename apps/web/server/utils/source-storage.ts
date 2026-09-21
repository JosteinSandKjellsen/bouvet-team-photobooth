import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export async function storeSourceImage(storageKey: string, bytes: Uint8Array) {
  const directory = process.env.SOURCE_STORAGE_DIR
  if (!directory) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Source storage is unavailable',
    })
  }

  const path = resolve(directory, storageKey)
  const root = resolve(directory)
  if (!path.startsWith(`${root}/`)) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Source storage is unavailable',
    })
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes, { flag: 'wx' })
}
