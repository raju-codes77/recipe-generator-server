import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import type { AuthenticatedCommunityUser, CreateCommunityPostInput } from "./community.types";

function timeAgo(value: Date): string {
  const seconds = Math.max(1, Math.floor((Date.now() - value.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function usersById(ids: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } } });
  return new Map(users.map((user) => [user.id, user]));
}

export class CommunityService {
  private async notifyPostOwner(postId: string, actorId: string, type: string, text: string) {
    const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post || post.authorId === actorId) return;
    await prisma.communityNotification.create({
      data: { userId: post.authorId, actorId, type, text, targetPostId: postId },
    });
  }

  async listPosts(viewerId?: string | null) {
    const posts = await prisma.communityPost.findMany({ orderBy: { createdAt: "desc" } });
    const postIds = posts.map((post) => post.id);
    const recipeIds = posts.flatMap((post) => (post.recipeId ? [post.recipeId] : []));
    const [users, recipes, comments, reactions, reviews, saves, madeIts, follows, followerCounts] = await Promise.all([
      usersById(posts.map((post) => post.authorId)),
      prisma.recipe.findMany({ where: { id: { in: recipeIds } }, include: { ingredients: true } }),
      prisma.communityComment.findMany({ where: { postId: { in: postIds } }, orderBy: { createdAt: "desc" } }),
      prisma.communityReaction.findMany({ where: { postId: { in: postIds }, type: "LIKE" } }),
      prisma.communityReview.findMany({ where: { postId: { in: postIds } }, orderBy: { createdAt: "desc" } }),
      prisma.communitySavedPost.findMany({ where: { postId: { in: postIds } } }),
      prisma.communityMadeIt.findMany({ where: { postId: { in: postIds } } }),
      viewerId ? prisma.communityFollow.findMany({ where: { followerId: viewerId } }) : Promise.resolve([]),
      prisma.communityFollow.groupBy({
        by: ["followingId"],
        _count: { _all: true },
      }),
    ]);
    const interactionUsers = await usersById([
      ...comments.map((item) => item.userId),
      ...reviews.map((item) => item.userId),
    ]);
    const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const following = new Set(follows.map((follow) => follow.followingId));
    const followersByUserId = new Map(followerCounts.map((item) => [item.followingId, item._count._all]));

    return posts.map((post) => {
      const author = users.get(post.authorId);
      const postComments = comments.filter((item) => item.postId === post.id);
      const postReviews = reviews.filter((item) => item.postId === post.id);
      const postReactions = reactions.filter((item) => item.postId === post.id);
      const postSaves = saves.filter((item) => item.postId === post.id);
      const postMadeIts = madeIts.filter((item) => item.postId === post.id);
      const recipe = post.recipeId ? recipeMap.get(post.recipeId) : undefined;
      const average = (field: "rating" | "flavorRating" | "easeRating" | "presentationRating") => {
        const values = postReviews
          .map((review) => review[field])
          .filter((value): value is number => typeof value === "number");
        return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : 0;
      };
      return {
        id: post.id,
        author: {
          id: post.authorId,
          name: author?.name || "FoodCanvas Cook",
          username: (author?.email.split("@")[0] || "community_cook").replace(/[^a-zA-Z0-9_]/g, "_"),
          avatar: author?.image || "",
          role: "user" as const,
          followersCount: followersByUserId.get(post.authorId) || 0,
          isFollowing: following.has(post.authorId),
          recipesCount: posts.filter((item) => item.authorId === post.authorId && item.recipeId).length,
        },
        caption: post.caption,
        imageUrl: post.imageUrl,
        additionalImages: Array.isArray(post.additionalImages) ? post.additionalImages : [],
        recipe: recipe
          ? {
              title: recipe.title,
              cuisine: recipe.cuisine || "Community",
              difficulty: ((recipe.instructions as unknown as { difficulty?: string } | null)?.difficulty || "Easy") as
                | "Easy"
                | "Medium"
                | "Hard",
              prepTimeMinutes: Math.max(0, Math.floor(recipe.time / 3)),
              cookTimeMinutes: Math.max(0, recipe.time - Math.floor(recipe.time / 3)),
              servings: 2,
              dietaryTags: recipe.category ? [recipe.category] : ["Community Recipe"],
              ingredients: recipe.ingredients.map((item) => ({ name: item.name, amount: item.measure || "As needed" })),
              steps:
                typeof recipe.instructions === "string"
                  ? recipe.instructions
                      .split("\n")
                      .filter(Boolean)
                      .map((instruction, index) => ({ stepNumber: index + 1, instruction }))
                  : [],
              nutrition: { calories: recipe.calories, protein: 0, carbs: 0, fat: 0 },
              sourceType: "community" as const,
            }
          : undefined,
        rating: {
          overall: average("rating"),
          flavor: average("flavorRating"),
          ease: average("easeRating"),
          presentation: average("presentationRating"),
          totalReviews: postReviews.length,
        },
        likesCount: postReactions.length,
        isLiked: Boolean(viewerId && postReactions.some((item) => item.userId === viewerId)),
        savesCount: postSaves.length,
        isSaved: Boolean(viewerId && postSaves.some((item) => item.userId === viewerId)),
        commentsCount: postComments.length,
        comments: postComments.map((comment) => {
          const user = interactionUsers.get(comment.userId);
          return {
            id: comment.id,
            userId: comment.userId,
            userName: user?.name || "Community Cook",
            userAvatar: user?.image || "",
            content: comment.content,
            createdAt: timeAgo(comment.createdAt),
            likesCount: 0,
          };
        }),
        reviews: postReviews.map((review) => {
          const user = interactionUsers.get(review.userId);
          return {
            id: review.id,
            userId: review.userId,
            userName: user?.name || "Community Cook",
            userAvatar: user?.image || "",
            userBadge: "Community Cook",
            rating: review.rating,
            flavorRating: review.flavorRating || undefined,
            easeRating: review.easeRating || undefined,
            presentationRating: review.presentationRating || undefined,
            comment: review.comment,
            cookingTips: review.cookingTips || undefined,
            createdAt: timeAgo(review.createdAt),
            likesCount: 0,
          };
        }),
        madeItCount: postMadeIts.length,
        hasMadeIt: Boolean(viewerId && postMadeIts.some((item) => item.userId === viewerId)),
        tags: post.tags,
        createdAt: timeAgo(post.createdAt),
        isChallengeEntry: post.isChallengeEntry,
        challengeName: post.challengeName || undefined,
        isPinned: post.isPinned,
      };
    });
  }

  async createPost(user: AuthenticatedCommunityUser, input: CreateCommunityPostInput) {
    await prisma.$transaction(async (tx) => {
      let recipeId: string | undefined;
      if (input.recipe) {
        const recipe = await tx.recipe.create({
          data: {
            mealId: `community_${randomUUID()}`,
            title: input.recipe.title || "Community Recipe",
            category: input.recipe.dietaryTags?.join(", ") || "Community Recipe",
            cuisine: input.recipe.cuisine,
            time: Number(input.recipe.prepTimeMinutes || 0) + Number(input.recipe.cookTimeMinutes || 0),
            calories: Number(input.recipe.nutrition?.calories || 0),
            image: input.imageUrl,
            instructions: input.recipe.steps?.map((step) => step.instruction).join("\n") || null,
            tabType: "Community Recipes",
            userId: user.id,
            ingredients: {
              create: (input.recipe.ingredients || []).map((ingredient) => ({
                name: ingredient.name,
                measure: ingredient.amount,
              })),
            },
          },
        });
        recipeId = recipe.id;
      }
      await tx.communityPost.create({
        data: {
          authorId: user.id,
          caption: input.caption,
          imageUrl: input.imageUrl,
          additionalImages: input.additionalImages || [],
          recipeId,
          tags: input.tags || [],
          isChallengeEntry: Boolean(input.isChallengeEntry),
          challengeName: input.challengeName,
        },
      });
    });
    return (await this.listPosts(user.id))[0];
  }

  async updatePost(userId: string, postId: string, data: { caption?: string; tags?: string[] }) {
    const post = await prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post || post.authorId !== userId) throw Object.assign(new Error("Post not found"), { statusCode: 404 });
    await prisma.communityPost.update({ where: { id: postId }, data });
  }

  async deletePost(userId: string, postId: string) {
    const post = await prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post || post.authorId !== userId) throw Object.assign(new Error("Post not found"), { statusCode: 404 });
    await prisma.$transaction([
      prisma.communityComment.deleteMany({ where: { postId } }),
      prisma.communityReaction.deleteMany({ where: { postId } }),
      prisma.communityReview.deleteMany({ where: { postId } }),
      prisma.communitySavedPost.deleteMany({ where: { postId } }),
      prisma.communityMadeIt.deleteMany({ where: { postId } }),
      prisma.communityPost.delete({ where: { id: postId } }),
    ]);
  }

  async toggleRecord(model: "reaction" | "madeIt", userId: string, postId: string) {
    if (model === "reaction") {
      const where = { postId_userId_type: { postId, userId, type: "LIKE" } };
      const existing = await prisma.communityReaction.findUnique({ where });
      if (existing) await prisma.communityReaction.delete({ where });
      else await prisma.communityReaction.create({ data: { postId, userId, type: "LIKE" } });
      if (!existing) await this.notifyPostOwner(postId, userId, "LIKE", "liked your Community recipe");
      return { active: !existing };
    }
    const where = { postId_userId: { postId, userId } };
    const existing = await prisma.communityMadeIt.findUnique({ where });
    if (existing) await prisma.communityMadeIt.delete({ where });
    else await prisma.communityMadeIt.create({ data: { postId, userId } });
    if (!existing) await this.notifyPostOwner(postId, userId, "MADE_IT", "made your Community recipe");
    return { active: !existing };
  }

  async addComment(userId: string, postId: string, content: string, parentId?: string) {
    const comment = await prisma.communityComment.create({ data: { userId, postId, content, parentId } });
    await this.notifyPostOwner(postId, userId, "COMMENT", "commented on your Community post");
    return comment;
  }

  async updateComment(userId: string, commentId: string, content: string) {
    const comment = await prisma.communityComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.userId !== userId) throw Object.assign(new Error("Comment not found"), { statusCode: 404 });
    return prisma.communityComment.update({ where: { id: commentId }, data: { content } });
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await prisma.communityComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.userId !== userId) throw Object.assign(new Error("Comment not found"), { statusCode: 404 });
    await prisma.communityComment.delete({ where: { id: commentId } });
  }

  async saveReview(userId: string, postId: string, data: Record<string, unknown>) {
    const review = await prisma.communityReview.upsert({
      where: { postId_userId: { postId, userId } },
      update: data,
      create: { postId, userId, ...data } as never,
    });
    await this.notifyPostOwner(postId, userId, "REVIEW", "reviewed your Community recipe");
    return review;
  }

  async deleteReview(userId: string, postId: string) {
    await prisma.communityReview.delete({ where: { postId_userId: { postId, userId } } });
  }

  async toggleFollow(followerId: string, followingId: string) {
    if (followerId === followingId) throw Object.assign(new Error("You cannot follow yourself"), { statusCode: 400 });
    const where = { followerId_followingId: { followerId, followingId } };
    const existing = await prisma.communityFollow.findUnique({ where });
    if (existing) await prisma.communityFollow.delete({ where });
    else await prisma.communityFollow.create({ data: { followerId, followingId } });
    if (!existing)
      await prisma.communityNotification.create({
        data: { userId: followingId, actorId: followerId, type: "FOLLOW", text: "started following you" },
      });
    return { active: !existing };
  }

  async listCollections(userId: string) {
    const collections = await prisma.communityCollection.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      collections.map(async (collection) => ({
        id: collection.id,
        name: collection.name,
        description: collection.description || "",
        coverImage: collection.coverImage || "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600",
        recipeCount: await prisma.communitySavedPost.count({ where: { collectionId: collection.id } }),
        isPrivate: collection.isPrivate,
      })),
    );
  }

  createCollection(userId: string, name: string, description?: string) {
    return prisma.communityCollection.create({ data: { userId, name, description } });
  }

  async savePost(userId: string, postId: string, collectionId?: string) {
    const existing = await prisma.communitySavedPost.findUnique({ where: { postId_userId: { postId, userId } } });
    if (existing && !collectionId) {
      await prisma.communitySavedPost.delete({ where: { postId_userId: { postId, userId } } });
      return { active: false };
    }
    await prisma.communitySavedPost.upsert({
      where: { postId_userId: { postId, userId } },
      update: { collectionId },
      create: { postId, userId, collectionId },
    });
    return { active: true };
  }

  async listStories() {
    const stories = await prisma.communityStory.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    const users = await usersById(stories.map((story) => story.authorId));
    return stories.map((story) => {
      const author = users.get(story.authorId);
      return {
        id: story.id,
        author: {
          id: story.authorId,
          name: author?.name || "FoodCanvas Cook",
          username: author?.email.split("@")[0] || "cook",
          avatar: author?.image || "",
          role: "user" as const,
          followersCount: 0,
          recipesCount: 0,
        },
        imageUrl: story.imageUrl,
        caption: story.caption,
        tag: story.tag || undefined,
        timestamp: timeAgo(story.createdAt),
      };
    });
  }

  createStory(userId: string, imageUrl: string, caption: string, tag?: string) {
    return prisma.communityStory.create({
      data: { authorId: userId, imageUrl, caption, tag, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
  }

  async deleteStory(userId: string, storyId: string) {
    const story = await prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story || story.authorId !== userId) throw Object.assign(new Error("Story not found"), { statusCode: 404 });
    await prisma.communityStory.delete({ where: { id: storyId } });
  }

  async listNotifications(userId: string) {
    const notifications = await prisma.communityNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const users = await usersById(notifications.map((item) => item.actorId));
    return notifications.map((item) => ({
      id: item.id,
      type: item.type.toLowerCase(),
      user: {
        id: item.actorId,
        name: users.get(item.actorId)?.name || "Community Cook",
        username: users.get(item.actorId)?.email.split("@")[0] || "cook",
        avatar: users.get(item.actorId)?.image || "",
        role: "user",
        followersCount: 0,
        recipesCount: 0,
      },
      text: item.text,
      targetPostId: item.targetPostId,
      timeAgo: timeAgo(item.createdAt),
      read: item.read,
    }));
  }

  markNotificationRead(userId: string, notificationId: string) {
    return prisma.communityNotification.updateMany({ where: { id: notificationId, userId }, data: { read: true } });
  }

  async listContacts(userId: string) {
    const users = await prisma.user.findMany({ where: { id: { not: userId } }, orderBy: { name: "asc" }, take: 50 });
    return Promise.all(
      users.map(async (user) => {
        const latest = await prisma.communityMessage.findFirst({
          where: {
            OR: [
              { senderId: userId, recipientId: user.id },
              { senderId: user.id, recipientId: userId },
            ],
          },
          orderBy: { createdAt: "desc" },
        });
        return {
          id: user.id,
          name: user.name,
          username: user.email.split("@")[0],
          avatar: user.image || "",
          online: false,
          lastMessage: latest?.text || "Start a cooking conversation",
          lastMessageTime: latest ? timeAgo(latest.createdAt) : "",
        };
      }),
    );
  }

  async listMessages(userId: string, otherUserId: string) {
    const pairKey = [userId, otherUserId].sort().join(":");
    const conversation = await prisma.communityConversation.findUnique({ where: { pairKey } });
    if (!conversation) return [];
    const messages = await prisma.communityMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return messages.map((message) => ({ ...message, timestamp: timeAgo(message.createdAt) }));
  }

  async sendMessage(userId: string, recipientId: string, text: string, attachedPostId?: string) {
    const pairKey = [userId, recipientId].sort().join(":");
    const conversation = await prisma.communityConversation.upsert({
      where: { pairKey },
      update: {},
      create: { pairKey },
    });
    await prisma.communityConversationMember.createMany({
      data: [
        { conversationId: conversation.id, userId },
        { conversationId: conversation.id, userId: recipientId },
      ],
      skipDuplicates: true,
    });
    const message = await prisma.communityMessage.create({
      data: { conversationId: conversation.id, senderId: userId, recipientId, text, attachedPostId },
    });
    await prisma.communityNotification.create({
      data: {
        userId: recipientId,
        actorId: userId,
        type: "MESSAGE",
        text: "sent you a direct message",
        targetPostId: attachedPostId,
      },
    });
    return message;
  }
}

export const communityService = new CommunityService();
