import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { deleteBlob, getStore, setBlob } = vi.hoisted(() => ({
  deleteBlob: vi.fn(),
  getStore: vi.fn(),
  setBlob: vi.fn(),
}))

vi.mock('@netlify/blobs', () => ({
  getStore,
}))

const { deleteSourceImage, getSourceImage, storeSourceImage } =
  await import('../../server/utils/source-storage')

const sourceStorageDriver = process.env.SOURCE_STORAGE_DRIVER
const sourceStorageBlobStoreName = process.env.SOURCE_STORAGE_BLOB_STORE_NAME
const sourceStorageDir = process.env.SOURCE_STORAGE_DIR
let localStorageDir: string | undefined

afterEach(async () => {
  vi.clearAllMocks()
  process.env.SOURCE_STORAGE_DRIVER = sourceStorageDriver
  process.env.SOURCE_STORAGE_BLOB_STORE_NAME = sourceStorageBlobStoreName
  process.env.SOURCE_STORAGE_DIR = sourceStorageDir
  if (localStorageDir) {
    await rm(localStorageDir, { force: true, recursive: true })
    localStorageDir = undefined
  }
})

describe('source storage', () => {
  it('rejects storage without its required configuration', async () => {
    process.env.SOURCE_STORAGE_DRIVER = 'netlify'
    delete process.env.SOURCE_STORAGE_BLOB_STORE_NAME

    await expect(
      storeSourceImage('sources/session.jpg', Uint8Array.of(1, 2, 3)),
    ).rejects.toThrow('Source storage is unavailable')
  })

  it('stores and removes source images in the configured local directory', async () => {
    localStorageDir = await mkdtemp(join(tmpdir(), 'photobooth-sources-'))
    process.env.SOURCE_STORAGE_DRIVER = 'local'
    process.env.SOURCE_STORAGE_DIR = localStorageDir

    await storeSourceImage('sources/session.jpg', Uint8Array.of(1, 2, 3))

    await expect(
      readFile(join(localStorageDir, 'sources/session.jpg')),
    ).resolves.toEqual(Buffer.from([1, 2, 3]))
    await expect(getSourceImage('sources/session.jpg')).resolves.toEqual(
      Uint8Array.of(1, 2, 3),
    )

    await deleteSourceImage('sources/session.jpg')

    await expect(
      readFile(join(localStorageDir, 'sources/session.jpg')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('uses the configured site-wide Netlify Blob store', async () => {
    process.env.SOURCE_STORAGE_DRIVER = 'netlify'
    process.env.SOURCE_STORAGE_BLOB_STORE_NAME = 'photobooth-sources'
    getStore.mockReturnValue({ delete: deleteBlob, set: setBlob })
    setBlob.mockResolvedValue({ modified: true })
    deleteBlob.mockResolvedValue(undefined)

    await storeSourceImage('sources/session.jpg', Uint8Array.of(1, 2, 3))
    await deleteSourceImage('sources/session.jpg')

    expect(getStore).toHaveBeenCalledWith('photobooth-sources')
    expect(setBlob).toHaveBeenCalledWith(
      'sources/session.jpg',
      expect.any(Blob),
      { onlyIfNew: true },
    )
    expect(deleteBlob).toHaveBeenCalledWith('sources/session.jpg')
  })
})
