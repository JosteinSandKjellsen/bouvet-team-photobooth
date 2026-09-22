export async function submitGeneration(generationId: string) {
  if (process.env.GENERATION_PROVIDER !== 'deterministic') {
    throw new Error('Generation provider is unavailable')
  }

  return { providerGenerationId: `deterministic-${generationId}` }
}
