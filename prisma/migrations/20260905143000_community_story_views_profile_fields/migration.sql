-- Additive-only Community migration.
-- This migration does not drop, truncate, reset, or delete any existing data.

ALTER TABLE "User"
    ADD COLUMN "bio" TEXT,
    ADD COLUMN "location" TEXT,
    ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "coverImage" TEXT;

CREATE TABLE "CommunityStoryView" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityStoryView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityStoryView_storyId_viewerId_key"
    ON "CommunityStoryView"("storyId", "viewerId");

CREATE INDEX "CommunityStoryView_storyId_viewedAt_idx"
    ON "CommunityStoryView"("storyId", "viewedAt");

CREATE INDEX "CommunityStoryView_viewerId_idx"
    ON "CommunityStoryView"("viewerId");

-- Community data is accessed through the authenticated Express API.
ALTER TABLE "CommunityStoryView" ENABLE ROW LEVEL SECURITY;
