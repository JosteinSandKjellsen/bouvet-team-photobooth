import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

function getSourcePath(storageKey: string) {
  const directory = process.env.SOURCE_STORAGE_DIR
  if (!directory) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Source storage is unavailable',
    })
  }

  const root = resolve(directory)
  const path = resolve(root, storageKey)
  const pathFromRoot = relative(root, path)
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Source storage is unavailable',
    })
  }

  return path
}

export async function storeSourceImage(storageKey: string, bytes: Uint8Array) {
  const path = getSourcePath(storageKey)

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes, { flag: 'wx' })
}

export async function deleteSourceImage(storageKey: string) {
  await rm(getSourcePath(storageKey), { force: true })
}
