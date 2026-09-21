ALTER TYPE "AssetStatus" ADD VALUE 'DELETE_PENDING';

CREATE TYPE "BackgroundJobKind" AS ENUM ('DELETE_SOURCE_IMAGE');

CREATE TYPE "BackgroundJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "BackgroundJob" (
    "id" UUID NOT NULL,
    "kind" "BackgroundJobKind" NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'QUEUED',
    "aggregateId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackgroundJob_idempotencyKey_key" ON "BackgroundJob"("idempotencyKey");
CREATE INDEX "BackgroundJob_status_nextAttemptAt_createdAt_idx" ON "BackgroundJob"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "BackgroundJob_status_leaseExpiresAt_idx" ON "BackgroundJob"("status", "leaseExpiresAt");
CREATE INDEX "BackgroundJob_kind_aggregateId_idx" ON "BackgroundJob"("kind", "aggregateId");
