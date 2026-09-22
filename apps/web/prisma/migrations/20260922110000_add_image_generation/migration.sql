CREATE TYPE "GenerationStatus" AS ENUM ('PENDING');

ALTER TYPE "BackgroundJobKind" ADD VALUE 'GENERATE_IMAGE';

CREATE TABLE "ImageGeneration" (
    "id" UUID NOT NULL,
    "sourceImageId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImageGeneration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageGeneration_sourceImageId_key" ON "ImageGeneration"("sourceImageId");
CREATE UNIQUE INDEX "ImageGeneration_idempotencyKey_key" ON "ImageGeneration"("idempotencyKey");
CREATE INDEX "ImageGeneration_status_createdAt_idx" ON "ImageGeneration"("status", "createdAt");

ALTER TABLE "ImageGeneration" ADD CONSTRAINT "ImageGeneration_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "SourceImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
