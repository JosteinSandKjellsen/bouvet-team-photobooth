import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { getStore } from '@netlify/blobs'

function unavailableStorage() {
  return new SourceStorageUnavailableError()
}

class SourceStorageUnavailableError extends Error {
  constructor() {
    super('Source storage is unavailable')
    this.name = 'SourceStorageUnavailableError'
  }
}

function getStorageDriver() {
  const driver = process.env.SOURCE_STORAGE_DRIVER ?? 'local'
  if (driver !== 'local' && driver !== 'netlify') {
    throw unavailableStorage()
  }

  return driver
}

function getNetlifySourceStore() {
  const name = process.env.SOURCE_STORAGE_BLOB_STORE_NAME
  if (!name) throw unavailableStorage()

  return getStore(name)
}

function toBlobBody(bytes: Uint8Array) {
  const body = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(body).set(bytes)
  return body
}

function getSourcePath(storageKey: string) {
  const directory = process.env.SOURCE_STORAGE_DIR
  if (!directory) {
    throw unavailableStorage()
  }

  const root = resolve(directory)
  const path = resolve(root, storageKey)
  const pathFromRoot = relative(root, path)
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw unavailableStorage()
  }

  return path
}

export async function storeSourceImage(storageKey: string, bytes: Uint8Array) {
  if (getStorageDriver() === 'netlify') {
    const result = await getNetlifySourceStore().set(
      storageKey,
      new Blob([toBlobBody(bytes)]),
      { onlyIfNew: true },
    )
    if (!result.modified) throw unavailableStorage()
    return
  }

  const path = getSourcePath(storageKey)

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes, { flag: 'wx' })
}

export async function storeGeneratedImage(
  storageKey: string,
  bytes: Uint8Array,
) {
  if (getStorageDriver() === 'netlify') {
    await getNetlifySourceStore().set(storageKey, new Blob([toBlobBody(bytes)]))
    return
  }

  const path = getSourcePath(storageKey)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
}

export async function getSourceImage(storageKey: string) {
  if (getStorageDriver() === 'netlify') {
    const image = await getNetlifySourceStore().get(storageKey, {
      type: 'arrayBuffer',
    })
    if (!image) throw unavailableStorage()
    return new Uint8Array(image)
  }

  try {
    return new Uint8Array(await readFile(getSourcePath(storageKey)))
  } catch {
    throw unavailableStorage()
  }
}

export async function deleteSourceImage(storageKey: string) {
  if (getStorageDriver() === 'netlify') {
    await getNetlifySourceStore().delete(storageKey)
    return
  }

  await rm(getSourcePath(storageKey), { force: true })
}

export async function deleteGeneratedImage(storageKey: string) {
  await deleteSourceImage(storageKey)
}
