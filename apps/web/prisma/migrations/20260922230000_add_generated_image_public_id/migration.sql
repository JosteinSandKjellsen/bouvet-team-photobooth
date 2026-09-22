CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "GeneratedImage"
ADD COLUMN "publicId" TEXT NOT NULL DEFAULT rtrim(
    translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'),
    '='
);

ALTER TABLE "GeneratedImage"
ALTER COLUMN "publicId" DROP DEFAULT;

CREATE UNIQUE INDEX "GeneratedImage_publicId_key"
ON "GeneratedImage"("publicId");
