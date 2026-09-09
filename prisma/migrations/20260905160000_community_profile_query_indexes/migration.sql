-- Additive-only performance indexes for community profile reads.
-- This migration does not drop, truncate, reset, or delete existing data.

CREATE INDEX "CommunityPost_authorId_isPinned_createdAt_idx"
    ON "CommunityPost"("authorId", "isPinned", "createdAt");

CREATE INDEX "CommunityStory_authorId_expiresAt_idx"
    ON "CommunityStory"("authorId", "expiresAt");
