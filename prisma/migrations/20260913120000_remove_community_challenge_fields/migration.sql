-- Remove only the legacy challenge metadata from CommunityPost.
-- Dedicated Challenge tables and routes are intentionally untouched.
ALTER TABLE "CommunityPost"
  DROP COLUMN IF EXISTS "isChallengeEntry",
  DROP COLUMN IF EXISTS "challengeName";
