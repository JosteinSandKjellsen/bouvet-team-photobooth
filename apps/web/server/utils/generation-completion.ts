import { db } from './db'

export async function recordGenerationCompletion(
  providerGenerationId: string,
  providerOutputUrl: string,
) {
  await db.$transaction(async (transaction) => {
    const generation = await transaction.imageGeneration.findUnique({
      where: { providerGenerationId },
      select: { id: true, providerOutputUrl: true, status: true },
    })
    if (generation?.status !== 'SUBMITTED') return

    if (
      generation.providerOutputUrl &&
      generation.providerOutputUrl !== providerOutputUrl
    ) {
      return
    }

    if (!generation.providerOutputUrl) {
      await transaction.imageGeneration.update({
        where: { id: generation.id },
        data: { providerOutputUrl },
      })
    }

    await transaction.backgroundJob.upsert({
      where: {
        idempotencyKey: `reconcile-generation:${generation.id}`,
      },
      update: {},
      create: {
        aggregateId: generation.id,
        idempotencyKey: `reconcile-generation:${generation.id}`,
        kind: 'RECONCILE_GENERATION',
      },
    })
  })
}
