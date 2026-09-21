import { afterEach, describe, expect, it, vi } from 'vitest'

const { deleteBlob, getStore, setBlob } = vi.hoisted(() => ({
  deleteBlob: vi.fn(),
  getStore: vi.fn(),
  setBlob: vi.fn(),
}))

vi.mock('@netlify/blobs', () => ({
  getStore,
}))

const { deleteSourceImage, storeSourceImage } =
  await import('../../server/utils/source-storage')

const sourceStorageDriver = process.env.SOURCE_STORAGE_DRIVER
const sourceStorageBlobStoreName = process.env.SOURCE_STORAGE_BLOB_STORE_NAME

afterEach(() => {
  vi.clearAllMocks()
  process.env.SOURCE_STORAGE_DRIVER = sourceStorageDriver
  process.env.SOURCE_STORAGE_BLOB_STORE_NAME = sourceStorageBlobStoreName
})

describe('source storage', () => {
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
