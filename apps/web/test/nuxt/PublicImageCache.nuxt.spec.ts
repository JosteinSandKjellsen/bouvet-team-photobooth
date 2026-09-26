import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  createPublicImageThumbnail,
  getPublicImageCacheControl,
} from '../../server/utils/public-image-cache'

describe('getPublicImageCacheControl', () => {
  const now = new Date('2026-09-26T20:00:00.000Z')

  it('caches a public image for at most three hours', () => {
    expect(
      getPublicImageCacheControl(new Date('2026-09-27T20:00:00.000Z'), now),
    ).toBe('public, max-age=10800, s-maxage=10800, must-revalidate')
  })

  it('does not cache beyond the image retention deadline', () => {
    expect(
      getPublicImageCacheControl(new Date('2026-09-26T20:30:00.000Z'), now),
    ).toBe('public, max-age=1800, s-maxage=1800, must-revalidate')
  })

  it('creates a smaller JPEG for gallery display', async () => {
    const source = await sharp({
      create: {
        background: 'white',
        channels: 3,
        height: 768,
        width: 1_024,
      },
    })
      .jpeg()
      .toBuffer()

    const thumbnail = await createPublicImageThumbnail(source)

    expect(thumbnail.byteLength).toBeLessThan(source.byteLength)
    await expect(sharp(thumbnail).metadata()).resolves.toMatchObject({
      format: 'jpeg',
      height: 576,
      width: 768,
    })
  })
})
