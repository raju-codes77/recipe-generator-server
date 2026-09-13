-- Additive-only migration for Facebook-style profile shares.
-- Existing posts and data are preserved.

ALTER TABLE "CommunityPost"
  ADD COLUMN IF NOT EXISTS "sharedFromId" TEXT;

CREATE INDEX IF NOT EXISTS "CommunityPost_sharedFromId_idx"
  ON "CommunityPost"("sharedFromId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CommunityPost_sharedFromId_fkey'
  ) THEN
    ALTER TABLE "CommunityPost"
      ADD CONSTRAINT "CommunityPost_sharedFromId_fkey"
      FOREIGN KEY ("sharedFromId") REFERENCES "CommunityPost"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
