ALTER TABLE "CommunityMessage"
ADD COLUMN "attachedStoryId" TEXT;

CREATE INDEX "CommunityMessage_attachedStoryId_idx"
ON "CommunityMessage"("attachedStoryId");
