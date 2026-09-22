ALTER TYPE "GenerationStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "GenerationStatus" ADD VALUE 'FAILED';
ALTER TYPE "GenerationStatus" ADD VALUE 'SUBMITTING';
ALTER TYPE "GenerationStatus" ADD VALUE 'SUBMISSION_UNKNOWN';

ALTER TABLE "ImageGeneration"
ADD COLUMN "providerGenerationId" TEXT;

CREATE UNIQUE INDEX "ImageGeneration_providerGenerationId_key"
ON "ImageGeneration"("providerGenerationId");
