ALTER TYPE "AssetStatus" ADD VALUE 'PENDING' BEFORE 'ACTIVE';
ALTER TYPE "GenerationStatus" ADD VALUE 'SUCCEEDED';
ALTER TYPE "BackgroundJobKind" ADD VALUE 'RECONCILE_GENERATION';
ALTER TYPE "BackgroundJobKind" ADD VALUE 'DELETE_GENERATED_IMAGE';

CREATE TABLE "GeneratedImage" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "deleteAfter" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeneratedImage_generationId_key" ON "GeneratedImage"("generationId");
CREATE UNIQUE INDEX "GeneratedImage_storageKey_key" ON "GeneratedImage"("storageKey");
CREATE INDEX "GeneratedImage_status_deleteAfter_idx" ON "GeneratedImage"("status", "deleteAfter");

ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ImageGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
