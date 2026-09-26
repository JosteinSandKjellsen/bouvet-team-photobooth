ALTER TYPE "BackgroundJobKind" ADD VALUE 'DELETE_PUBLIC_PHOTO';

CREATE TABLE "AdminSession" (
    "id" UUID NOT NULL,
    "capabilityHash" TEXT NOT NULL,
    "pageTokenHash" TEXT NOT NULL,
    "credentialVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminSession_capabilityHash_key" ON "AdminSession"("capabilityHash");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

CREATE TABLE "AdminLoginBucket" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AdminLoginBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "AdminLoginBucket_expiresAt_idx" ON "AdminLoginBucket"("expiresAt");

CREATE TABLE "PhotoDeletion" (
    "id" UUID NOT NULL,
    "operationId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "imageId" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "storageKey" TEXT,
    "providerGenerationId" TEXT,
    "providerDeleteStartedAt" TIMESTAMPTZ(3),
    "providerDeletedAt" TIMESTAMPTZ(3),
    "localDeletedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoDeletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhotoDeletion_operationId_key" ON "PhotoDeletion"("operationId");
CREATE UNIQUE INDEX "PhotoDeletion_publicId_key" ON "PhotoDeletion"("publicId");
CREATE UNIQUE INDEX "PhotoDeletion_imageId_key" ON "PhotoDeletion"("imageId");
CREATE INDEX "PhotoDeletion_completedAt_idx" ON "PhotoDeletion"("completedAt");
