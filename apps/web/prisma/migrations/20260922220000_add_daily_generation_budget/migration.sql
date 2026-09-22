CREATE TABLE "DailyGenerationBudget" (
    "day" DATE NOT NULL,
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyGenerationBudget_pkey" PRIMARY KEY ("day")
);

CREATE TABLE "GenerationCreditReservation" (
    "generationId" UUID NOT NULL,
    "budgetDay" DATE NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationCreditReservation_pkey" PRIMARY KEY ("generationId")
);

CREATE INDEX "GenerationCreditReservation_budgetDay_idx"
ON "GenerationCreditReservation"("budgetDay");
