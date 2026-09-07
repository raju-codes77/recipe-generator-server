-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "additionalImages" JSONB,
    "recipeId" TEXT,
    "tags" TEXT[],
    "isChallengeEntry" BOOLEAN NOT NULL DEFAULT false,
    "challengeName" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReview" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "flavorRating" INTEGER,
    "easeRating" INTEGER,
    "presentationRating" INTEGER,
    "comment" TEXT NOT NULL,
    "cookingTips" TEXT,
    "madeItPhoto" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunitySavedPost" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunitySavedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMadeIt" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMadeIt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStory" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "tag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityConversation" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachedPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "targetPostId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityPost_authorId_idx" ON "CommunityPost"("authorId");

-- CreateIndex
CREATE INDEX "CommunityPost_recipeId_idx" ON "CommunityPost"("recipeId");

-- CreateIndex
CREATE INDEX "CommunityPost_createdAt_idx" ON "CommunityPost"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_createdAt_idx" ON "CommunityComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_userId_idx" ON "CommunityComment"("userId");

-- CreateIndex
CREATE INDEX "CommunityComment_parentId_idx" ON "CommunityComment"("parentId");

-- CreateIndex
CREATE INDEX "CommunityReaction_userId_idx" ON "CommunityReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReaction_postId_userId_type_key" ON "CommunityReaction"("postId", "userId", "type");

-- CreateIndex
CREATE INDEX "CommunityReview_userId_idx" ON "CommunityReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReview_postId_userId_key" ON "CommunityReview"("postId", "userId");

-- CreateIndex
CREATE INDEX "CommunitySavedPost_collectionId_idx" ON "CommunitySavedPost"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunitySavedPost_postId_userId_key" ON "CommunitySavedPost"("postId", "userId");

-- CreateIndex
CREATE INDEX "CommunityCollection_userId_idx" ON "CommunityCollection"("userId");

-- CreateIndex
CREATE INDEX "CommunityFollow_followingId_idx" ON "CommunityFollow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityFollow_followerId_followingId_key" ON "CommunityFollow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "CommunityMadeIt_userId_idx" ON "CommunityMadeIt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMadeIt_postId_userId_key" ON "CommunityMadeIt"("postId", "userId");

-- CreateIndex
CREATE INDEX "CommunityStory_authorId_idx" ON "CommunityStory"("authorId");

-- CreateIndex
CREATE INDEX "CommunityStory_expiresAt_idx" ON "CommunityStory"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityConversation_pairKey_key" ON "CommunityConversation"("pairKey");

-- CreateIndex
CREATE INDEX "CommunityConversationMember_userId_idx" ON "CommunityConversationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityConversationMember_conversationId_userId_key" ON "CommunityConversationMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "CommunityMessage_conversationId_createdAt_idx" ON "CommunityMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityMessage_recipientId_createdAt_idx" ON "CommunityMessage"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_status_createdAt_idx" ON "CommunityReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReport_postId_reporterId_key" ON "CommunityReport"("postId", "reporterId");

-- CreateIndex
CREATE INDEX "CommunityNotification_userId_read_createdAt_idx" ON "CommunityNotification"("userId", "read", "createdAt");

-- Keep Community tables private from direct Supabase Data API access.
-- Community access is handled by the authenticated Express API.
ALTER TABLE "CommunityPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityReaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunitySavedPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityCollection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityFollow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityMadeIt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityStory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityConversationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunityNotification" ENABLE ROW LEVEL SECURITY;
