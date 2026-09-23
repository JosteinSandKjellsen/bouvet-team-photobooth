ALTER TABLE "GeneratedImage"
ADD COLUMN "publishedAt" TIMESTAMPTZ(3);

CREATE INDEX "GeneratedImage_status_publishedAt_id_idx"
ON "GeneratedImage"("status", "publishedAt", "id");

CREATE TABLE "EventAggregate" (
    "id" TEXT NOT NULL,
    "completedPhotoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventAggregate_pkey" PRIMARY KEY ("id")
);

UPDATE "GeneratedImage"
SET "publishedAt" = "createdAt"
WHERE "status" = 'ACTIVE';

INSERT INTO "EventAggregate" ("id", "completedPhotoCount", "updatedAt")
SELECT 'current', COUNT(*), CURRENT_TIMESTAMP
FROM "GeneratedImage"
WHERE "status" = 'ACTIVE';
