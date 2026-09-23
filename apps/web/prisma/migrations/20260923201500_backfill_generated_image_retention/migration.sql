UPDATE "GeneratedImage"
SET "deleteAfter" = "publishedAt" + INTERVAL '30 days'
WHERE "status" = 'ACTIVE'
  AND "publishedAt" IS NOT NULL
  AND "deleteAfter" <> "publishedAt" + INTERVAL '30 days';
