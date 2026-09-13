CREATE TABLE "CommunityStoryReaction" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityStoryReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityStoryReaction_storyId_userId_key"
    ON "CommunityStoryReaction"("storyId", "userId");

CREATE INDEX "CommunityStoryReaction_storyId_idx"
    ON "CommunityStoryReaction"("storyId");

CREATE INDEX "CommunityStoryReaction_userId_idx"
    ON "CommunityStoryReaction"("userId");

ALTER TABLE "CommunityStoryReaction" ENABLE ROW LEVEL SECURITY;
