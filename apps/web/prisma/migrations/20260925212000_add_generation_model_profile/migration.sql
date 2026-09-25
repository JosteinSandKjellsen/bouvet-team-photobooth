ALTER TABLE "ImageGeneration"
ADD COLUMN "modelProfileId" TEXT;

UPDATE "ImageGeneration"
SET "modelProfileId" = 'gpt-image-2-5-sunburst-v1'
WHERE "modelProfileId" IS NULL;

ALTER TABLE "ImageGeneration"
ALTER COLUMN "modelProfileId" SET NOT NULL;
