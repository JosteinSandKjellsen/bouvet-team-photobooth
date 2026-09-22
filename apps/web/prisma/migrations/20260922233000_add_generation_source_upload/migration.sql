ALTER TYPE "GenerationStatus" ADD VALUE 'UPLOADING';
ALTER TYPE "GenerationStatus" ADD VALUE 'READY_TO_SUBMIT';

ALTER TABLE "ImageGeneration"
ADD COLUMN "providerSourceImageId" TEXT,
ADD COLUMN "providerSourceUploadedAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "ImageGeneration_providerSourceImageId_key"
ON "ImageGeneration"("providerSourceImageId");
