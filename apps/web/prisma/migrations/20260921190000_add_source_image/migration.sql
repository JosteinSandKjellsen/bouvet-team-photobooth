-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateTable
CREATE TABLE "SourceImage" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleteAfter" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SourceImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceImage_sessionId_key" ON "SourceImage"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceImage_storageKey_key" ON "SourceImage"("storageKey");

-- CreateIndex
CREATE INDEX "SourceImage_status_deleteAfter_idx" ON "SourceImage"("status", "deleteAfter");

-- AddForeignKey
ALTER TABLE "SourceImage" ADD CONSTRAINT "SourceImage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
