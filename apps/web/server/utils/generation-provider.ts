import sharp from 'sharp'

export async function submitGeneration(generationId: string) {
  if (process.env.GENERATION_PROVIDER !== 'deterministic') {
    throw new Error('Generation provider is unavailable')
  }

  return { providerGenerationId: `deterministic-${generationId}` }
}

export async function getGeneratedOutput(providerGenerationId: string) {
  if (
    process.env.GENERATION_PROVIDER !== 'deterministic' ||
    !providerGenerationId.startsWith('deterministic-')
  ) {
    throw new Error('Generation provider is unavailable')
  }

  const image = await sharp({
    create: {
      background: { b: 160, g: 90, r: 18 },
      channels: 3,
      height: 768,
      width: 1376,
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer()

  return { contentType: 'image/jpeg', image: new Uint8Array(image) }
}
