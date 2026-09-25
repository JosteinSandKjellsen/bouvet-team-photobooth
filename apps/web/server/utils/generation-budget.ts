import { db } from './db'

const dailyCreditCap = 10_000
export async function reserveGenerationCredits(
  generationId: string,
  credits: number,
  now = new Date(),
) {
  if (!Number.isSafeInteger(credits) || credits <= 0) {
    throw new Error(
      'Generation credit reservation must be a positive safe integer',
    )
  }
  const budgetDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )

  try {
    return await db.$transaction(async (transaction) => {
      const existing = await transaction.generationCreditReservation.findUnique(
        {
          where: { generationId },
          select: { generationId: true },
        },
      )
      if (existing) return true

      const reserved = await transaction.$queryRaw<{ day: Date }[]>`
        INSERT INTO "DailyGenerationBudget" (
          "day",
          "reservedCredits",
          "updatedAt"
        )
        VALUES (${budgetDay}, ${credits}, ${now})
        ON CONFLICT ("day") DO UPDATE
        SET
          "reservedCredits" = "DailyGenerationBudget"."reservedCredits" + ${credits},
          "updatedAt" = ${now}
        WHERE "DailyGenerationBudget"."reservedCredits" + ${credits} <= ${dailyCreditCap}
        RETURNING "day"
      `
      if (reserved.length === 0) return false

      await transaction.generationCreditReservation.create({
        data: {
          budgetDay,
          credits,
          generationId,
        },
      })
      return true
    })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return Boolean(
        await db.generationCreditReservation.findUnique({
          where: { generationId },
          select: { generationId: true },
        }),
      )
    }
    throw error
  }
}
