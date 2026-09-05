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

function parseRecipeSteps(instructions: string | null): Array<{ stepNumber: number; instruction: string; durationMinutes?: number; tip?: string }> {
  if (!instructions) return [];
  try {
    const parsed: unknown = JSON.parse(instructions);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((step, index) => {
        if (typeof step === "string") return [{ stepNumber: index + 1, instruction: step }];
        if (!step || typeof step !== "object") return [];
        const data = step as Record<string, unknown>;
        if (typeof data.instruction !== "string" || !data.instruction.trim()) return [];
        return [{
          stepNumber: typeof data.stepNumber === "number" ? data.stepNumber : index + 1,
          instruction: data.instruction,
          ...(typeof data.durationMinutes === "number" ? { durationMinutes: data.durationMinutes } : {}),
          ...(typeof data.tip === "string" && data.tip.trim() ? { tip: data.tip } : {}),
        }];
      });
    }
  } catch {
    // Older community recipes store newline-separated instructions.
  }
  return instructions.split("\n").map((instruction, index) => ({ stepNumber: index + 1, instruction })).filter((step) => step.instruction.trim());
}

export class CommunityService {
  private async notifyPostOwner(postId: string, actorId: string, type: string, text: string) {
    const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post || post.authorId === actorId) return;
    await prisma.communityNotification.create({
      data: { userId: post.authorId, actorId, type, text, targetPostId: postId },
    });
  }

  async listPosts(
    viewerId?: string | null,
    options: { authorId?: string; postIds?: string[]; take?: number; skip?: number } = {},
  ) {
    const take = Math.min(Math.max(options.take ?? 20, 1), 50);
    const skip = Math.max(options.skip ?? 0, 0);
    const posts = await prisma.communityPost.findMany({
      where: {
        ...(options.authorId ? { authorId: options.authorId } : {}),
        ...(options.postIds ? { id: { in: options.postIds } } : {}),
      },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take,
      skip,
    });
    if (posts.length === 0) return [];

    const postIds = posts.map((post) => post.id);
    const authorIds = [...new Set(posts.map((post) => post.authorId))];
    const recipeIds = posts.flatMap((post) => (post.recipeId ? [post.recipeId] : []));
    // These reads are independent. Promise.all reduces API latency while the
    // PrismaPg pool (max: 5) keeps database concurrency bounded.
    const [
      users,
      recipes,
      commentCounts,
      reactionCounts,
      reviewStats,
      saveCounts,
      madeItCounts,
      follows,
      followerCounts,
      viewerReactions,
      viewerSaves,
      viewerMadeIts,
    ] = await Promise.all([
      usersById(authorIds),
      prisma.recipe.findMany({ where: { id: { in: recipeIds } }, include: { ingredients: true } }),
      prisma.communityComment.groupBy({
        by: ["postId"],
        where: { postId: { in: postIds } },
        _count: { _all: true },
      }),
      prisma.communityReaction.groupBy({
        by: ["postId"],
        where: { postId: { in: postIds }, type: "LIKE" },
        _count: { _all: true },
      }),
      prisma.communityReview.groupBy({
        by: ["postId"],
        where: { postId: { in: postIds } },
        _count: { _all: true },
        _avg: { rating: true, flavorRating: true, easeRating: true, presentationRating: true },
      }),
      prisma.communitySavedPost.groupBy({
        by: ["postId"],
        where: { postId: { in: postIds } },
        _count: { _all: true },
      }),
      prisma.communityMadeIt.groupBy({
        by: ["postId"],
        where: { postId: { in: postIds } },
        _count: { _all: true },
      }),
      viewerId
        ? prisma.communityFollow.findMany({ where: { followerId: viewerId, followingId: { in: authorIds } } })
        : [],
      prisma.communityFollow.groupBy({
        by: ["followingId"],
        where: { followingId: { in: authorIds } },
        _count: { _all: true },
      }),
      viewerId
        ? prisma.communityReaction.findMany({ where: { postId: { in: postIds }, userId: viewerId, type: "LIKE" } })
        : [],
      viewerId
        ? prisma.communitySavedPost.findMany({ where: { postId: { in: postIds }, userId: viewerId } })
        : [],
      viewerId
        ? prisma.communityMadeIt.findMany({ where: { postId: { in: postIds }, userId: viewerId } })
        : [],
    ]);
    const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const following = new Set(follows.map((follow) => follow.followingId));
    const followersByUserId = new Map(followerCounts.map((item) => [item.followingId, item._count._all]));
    const commentsByPostId = new Map(commentCounts.map((item) => [item.postId, item._count._all]));
    const reactionsByPostId = new Map(reactionCounts.map((item) => [item.postId, item._count._all]));
    const reviewsByPostId = new Map(reviewStats.map((item) => [item.postId, item]));
    const savesByPostId = new Map(saveCounts.map((item) => [item.postId, item._count._all]));
    const madeItsByPostId = new Map(madeItCounts.map((item) => [item.postId, item._count._all]));
    const viewerLikedPostIds = new Set(viewerReactions.map((item) => item.postId));
    const viewerSavedPostIds = new Set(viewerSaves.map((item) => item.postId));
    const viewerMadeItPostIds = new Set(viewerMadeIts.map((item) => item.postId));
    const recipesByAuthorId = new Map<string, number>();
    for (const post of posts) {
      if (post.recipeId) recipesByAuthorId.set(post.authorId, (recipesByAuthorId.get(post.authorId) || 0) + 1);
    }

    return posts.map((post) => {
      const author = users.get(post.authorId);
      const recipe = post.recipeId ? recipeMap.get(post.recipeId) : undefined;
      const review = reviewsByPostId.get(post.id);
      const average = (value: number | null | undefined) => (value ? Number(value.toFixed(1)) : 0);
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
          recipesCount: recipesByAuthorId.get(post.authorId) || 0,
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
              steps: parseRecipeSteps(recipe.instructions),
              nutrition: { calories: recipe.calories, protein: 0, carbs: 0, fat: 0 },
              sourceType: "community" as const,
            }
          : undefined,
        rating: {
          overall: average(review?._avg.rating),
          flavor: average(review?._avg.flavorRating),
          ease: average(review?._avg.easeRating),
          presentation: average(review?._avg.presentationRating),
          totalReviews: review?._count._all || 0,
        },
        likesCount: reactionsByPostId.get(post.id) || 0,
        isLiked: viewerLikedPostIds.has(post.id),
        savesCount: savesByPostId.get(post.id) || 0,
        isSaved: viewerSavedPostIds.has(post.id),
        commentsCount: commentsByPostId.get(post.id) || 0,
        comments: [],
        reviews: [],
        madeItCount: madeItsByPostId.get(post.id) || 0,
        hasMadeIt: viewerMadeItPostIds.has(post.id),
        tags: post.tags,
        createdAt: timeAgo(post.createdAt),
        isChallengeEntry: post.isChallengeEntry,
        challengeName: post.challengeName || undefined,
        isPinned: post.isPinned,
      };
    });
  }

  async listSuggestedChefs(viewerId?: string | null) {
    type SuggestedChefRow = {
      id: string;
      name: string;
      email: string;
      image: string | null;
      recipesCount: number;
      followersCount: number;
      activityCount: number;
    };

    const rows = await prisma.$queryRaw<SuggestedChefRow[]>`
      WITH activity AS (
        SELECT "authorId" AS user_id, 3::int AS activity_score, 1::int AS post_count FROM "CommunityPost"
        UNION ALL SELECT "userId", 1::int, 0::int FROM "CommunityComment"
        UNION ALL SELECT "userId", 1::int, 0::int FROM "CommunityReaction"
        UNION ALL SELECT "userId", 1::int, 0::int FROM "CommunityReview"
        UNION ALL SELECT "userId", 1::int, 0::int FROM "CommunitySavedPost"
        UNION ALL SELECT "userId", 1::int, 0::int FROM "CommunityMadeIt"
        UNION ALL SELECT "authorId", 2::int, 0::int FROM "CommunityStory"
        UNION ALL SELECT "followerId", 1::int, 0::int FROM "CommunityFollow"
        UNION ALL SELECT "senderId", 1::int, 0::int FROM "CommunityMessage"
      ),
      activity_stats AS (
        SELECT user_id, SUM(activity_score)::int AS activity_score, SUM(post_count)::int AS post_count, COUNT(*)::int AS activity_count
        FROM activity
        GROUP BY user_id
      ),
      recipe_stats AS (
        SELECT "authorId" AS user_id, COUNT(*) FILTER (WHERE "recipeId" IS NOT NULL)::int AS recipes_count
        FROM "CommunityPost"
        GROUP BY "authorId"
      ),
      follower_stats AS (
        SELECT "followingId" AS user_id, COUNT(*)::int AS followers_count
        FROM "CommunityFollow"
        GROUP BY "followingId"
      )
      SELECT
        u."id" AS id,
        u."name" AS name,
        u."email" AS email,
        u."image" AS image,
        COALESCE(rs.recipes_count, 0)::int AS "recipesCount",
        COALESCE(fs.followers_count, 0)::int AS "followersCount",
        a.activity_count AS "activityCount"
      FROM activity_stats a
      INNER JOIN "User" u ON u."id" = a.user_id
      LEFT JOIN recipe_stats rs ON rs.user_id = u."id"
      LEFT JOIN follower_stats fs ON fs.user_id = u."id"
      ORDER BY a.post_count DESC, a.activity_score DESC, a.activity_count DESC, u."name" ASC
      LIMIT 50
    `;

    const followingIds = viewerId
      ? new Set(
          (await prisma.communityFollow.findMany({
            where: { followerId: viewerId, followingId: { in: rows.map((row) => row.id) } },
            select: { followingId: true },
          })).map((follow) => follow.followingId),
        )
      : new Set<string>();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      username: (row.email.split("@")[0] || "community_cook").replace(/[^a-zA-Z0-9_]/g, "_"),
      avatar: row.image || "",
      role: "user" as const,
      followersCount: Number(row.followersCount) || 0,
      isFollowing: followingIds.has(row.id),
      recipesCount: Number(row.recipesCount) || 0,
    }));
  }

  async getPublicProfile(
    userId: string,
    viewerId?: string | null,
    options: { take?: number; skip?: number } = {},
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error("Community user not found"), { statusCode: 404 });

    const take = Math.min(Math.max(options.take ?? 6, 1), 20);
    const skip = Math.max(options.skip ?? 0, 0);
    const [pagePosts, stories, profileStatsRows] = await Promise.all([
      this.listPosts(viewerId, { authorId: userId, take: take + 1, skip }),
      this.listStories(userId),
      prisma.$queryRaw<Array<{
        postsTotal: number;
        recipesTotal: number;
        likesTotal: number;
        followersCount: number;
        followingCount: number;
        isFollowing: boolean;
      }>>`
        SELECT
          COUNT(*)::int AS "postsTotal",
          COUNT(*) FILTER (WHERE "recipeId" IS NOT NULL)::int AS "recipesTotal",
          COALESCE((
            SELECT COUNT(*)::int
            FROM "CommunityReaction" AS reaction
            INNER JOIN "CommunityPost" AS reacted_post ON reacted_post.id = reaction."postId"
            WHERE reacted_post."authorId" = ${userId}
              AND reaction.type = 'LIKE'
          ), 0)::int AS "likesTotal",
          (SELECT COUNT(*)::int FROM "CommunityFollow" WHERE "followingId" = ${userId}) AS "followersCount",
          (SELECT COUNT(*)::int FROM "CommunityFollow" WHERE "followerId" = ${userId}) AS "followingCount",
          EXISTS(
            SELECT 1 FROM "CommunityFollow"
            WHERE "followerId" = ${viewerId}
              AND "followingId" = ${userId}
          ) AS "isFollowing"
        FROM "CommunityPost"
        WHERE "authorId" = ${userId}
      `,
    ]);
    const hasMorePosts = pagePosts.length > take;
    const posts = pagePosts.slice(0, take);
    const [profileStats] = profileStatsRows;
    if (!profileStats) throw new Error("Unable to load community profile statistics");

    return {
      user: {
        id: user.id,
        name: user.name,
        username: (user.email.split("@")[0] || "community_cook").replace(/[^a-zA-Z0-9_]/g, "_"),
        avatar: user.image || "",
        bio: user.bio || "",
        location: user.location || "",
        interests: user.interests,
        coverImage: user.coverImage || "",
        role: "user" as const,
        followersCount: profileStats.followersCount,
        isFollowing: profileStats.isFollowing,
        recipesCount: profileStats.recipesTotal,
      },
      posts,
      postsTotal: profileStats.postsTotal,
      likesTotal: viewerId === userId ? profileStats.likesTotal : undefined,
      hasMorePosts,
      stories,
      followingCount: profileStats.followingCount,
    };
  }

  async getPostInteractions(
    postId: string,
    options: { commentsTake?: number; commentsSkip?: number; reviewsTake?: number; reviewsSkip?: number } = {},
  ) {
    const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw Object.assign(new Error("Post not found"), { statusCode: 404 });

    const commentsTake = Math.min(Math.max(options.commentsTake ?? 8, 0), 20);
    const commentsSkip = Math.max(options.commentsSkip ?? 0, 0);
    const reviewsTake = Math.min(Math.max(options.reviewsTake ?? 5, 0), 10);
    const reviewsSkip = Math.max(options.reviewsSkip ?? 0, 0);

    const comments = commentsTake
      ? await prisma.communityComment.findMany({
          where: { postId },
          orderBy: { createdAt: "asc" },
          take: commentsTake,
          skip: commentsSkip,
        })
      : [];
    const reviews = reviewsTake
      ? await prisma.communityReview.findMany({
          where: { postId },
          orderBy: { createdAt: "desc" },
          take: reviewsTake,
          skip: reviewsSkip,
        })
      : [];
    const users = await usersById([...comments.map((comment) => comment.userId), ...reviews.map((review) => review.userId)]);

    return {
      comments: comments.map((comment) => {
        const user = users.get(comment.userId);
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
      reviews: reviews.map((review) => {
        const user = users.get(review.userId);
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
    };
  }

  async createPost(user: AuthenticatedCommunityUser, input: CreateCommunityPostInput) {
    const createdPost = await prisma.$transaction(async (tx) => {
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
            instructions: input.recipe.steps?.length ? JSON.stringify(input.recipe.steps) : null,
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
      return tx.communityPost.create({
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

    return {
      id: createdPost.id,
      author: {
        id: user.id,
        name: user.name,
        username: (user.email.split("@")[0] || "community_cook").replace(/[^a-zA-Z0-9_]/g, "_"),
        avatar: user.image || "",
        role: "user" as const,
        followersCount: 0,
        isFollowing: false,
        recipesCount: input.recipe ? 1 : 0,
      },
      caption: createdPost.caption,
      imageUrl: createdPost.imageUrl,
      additionalImages: Array.isArray(createdPost.additionalImages) ? createdPost.additionalImages : [],
      recipe: input.recipe
        ? {
            title: input.recipe.title || "Community Recipe",
            cuisine: input.recipe.cuisine || "Community",
            difficulty: input.recipe.difficulty || "Easy",
            prepTimeMinutes: Number(input.recipe.prepTimeMinutes || 0),
            cookTimeMinutes: Number(input.recipe.cookTimeMinutes || 0),
            servings: Number(input.recipe.servings || 2),
            dietaryTags: input.recipe.dietaryTags || [],
            ingredients: (input.recipe.ingredients || []).map((ingredient) => ({ name: ingredient.name, amount: ingredient.amount })),
            steps: (input.recipe.steps || []).map((step, index) => ({
              stepNumber: step.stepNumber || index + 1,
              instruction: step.instruction,
            })),
            nutrition: {
              calories: Number(input.recipe.nutrition?.calories || 0),
              protein: Number(input.recipe.nutrition?.protein || 0),
              carbs: Number(input.recipe.nutrition?.carbs || 0),
              fat: Number(input.recipe.nutrition?.fat || 0),
            },
            sourceType: input.recipe.sourceType || "community",
          }
        : undefined,
      rating: { overall: 0, flavor: 0, ease: 0, presentation: 0, totalReviews: 0 },
      likesCount: 0,
      isLiked: false,
      savesCount: 0,
      isSaved: false,
      commentsCount: 0,
      comments: [],
      reviews: [],
      madeItCount: 0,
      hasMadeIt: false,
      tags: createdPost.tags,
      createdAt: timeAgo(createdPost.createdAt),
      isChallengeEntry: createdPost.isChallengeEntry,
      challengeName: createdPost.challengeName || undefined,
      isPinned: createdPost.isPinned,
    };
  }

  async updatePost(userId: string, postId: string, data: { caption?: string; tags?: string[]; isPinned?: boolean }) {
    const post = await prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post || post.authorId !== userId) throw Object.assign(new Error("Post not found"), { statusCode: 404 });
    await prisma.$transaction(async (tx) => {
      if (data.isPinned === true) {
        await tx.communityPost.updateMany({ where: { authorId: userId, isPinned: true, id: { not: postId } }, data: { isPinned: false } });
      }
      await tx.communityPost.update({ where: { id: postId }, data });
    });
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
    const collectionIds = collections.map((collection) => collection.id);
    const savedCounts = collectionIds.length
      ? await prisma.communitySavedPost.groupBy({
          by: ["collectionId"],
          where: { collectionId: { in: collectionIds } },
          _count: { _all: true },
        })
      : [];
    const savedCountByCollection = new Map(savedCounts.map((item) => [item.collectionId, item._count._all]));

    return collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        description: collection.description || "",
        coverImage: collection.coverImage || "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600",
        recipeCount: savedCountByCollection.get(collection.id) || 0,
        isPrivate: collection.isPrivate,
      }));
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

  async listStories(authorId?: string) {
    const stories = await prisma.communityStory.findMany({
      where: { expiresAt: { gt: new Date() }, ...(authorId ? { authorId } : {}) },
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

  async listSavedPosts(userId: string, options: { take?: number; skip?: number } = {}) {
    const take = Math.min(Math.max(options.take ?? 12, 1), 30);
    const skip = Math.max(options.skip ?? 0, 0);
    const savedRows = await prisma.communitySavedPost.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      skip,
      select: { postId: true },
    });
    const hasMore = savedRows.length > take;
    const savedPostIds = savedRows.slice(0, take).map((row) => row.postId);
    if (savedPostIds.length === 0) return { posts: [], hasMore };

    const posts = await this.listPosts(userId, { postIds: savedPostIds, take: savedPostIds.length });
    const postsById = new Map(posts.map((post) => [post.id, post]));
    return {
      posts: savedPostIds.flatMap((postId) => {
        const post = postsById.get(postId);
        return post ? [post] : [];
      }),
      hasMore,
    };
  }

  async recordStoryView(viewerId: string, storyId: string) {
    const story = await prisma.communityStory.findFirst({
      where: { id: storyId, expiresAt: { gt: new Date() } },
      select: { id: true, authorId: true },
    });
    if (!story) throw Object.assign(new Error("Story not found"), { statusCode: 404 });
    if (story.authorId === viewerId) return { alreadyRecorded: true };

    const result = await prisma.communityStoryView.createMany({
      data: [{ storyId, viewerId }],
      skipDuplicates: true,
    });
    return { alreadyRecorded: result.count === 0 };
  }

  async listStoryViewers(authorId: string, storyId: string) {
    const story = await prisma.communityStory.findFirst({ where: { id: storyId, authorId }, select: { id: true } });
    if (!story) throw Object.assign(new Error("Story not found"), { statusCode: 404 });

    const views = await prisma.communityStoryView.findMany({
      where: { storyId },
      orderBy: { viewedAt: "desc" },
      take: 100,
      select: { viewerId: true, viewedAt: true },
    });
    const users = await usersById(views.map((view) => view.viewerId));
    return views.map((view) => {
      const viewer = users.get(view.viewerId);
      return { id: view.viewerId, name: viewer?.name || "Community Cook", avatar: viewer?.image || "", viewedAt: view.viewedAt };
    });
  }

  async updateProfile(userId: string, input: unknown) {
    const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const interests = Array.isArray(body.interests)
      ? body.interests.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20)
      : undefined;
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: typeof body.name === "string" ? body.name.trim().slice(0, 120) || undefined : undefined,
        image: typeof body.image === "string" ? body.image.trim().slice(0, 2000) : undefined,
        bio: typeof body.bio === "string" ? body.bio.trim().slice(0, 500) : undefined,
        location: typeof body.location === "string" ? body.location.trim().slice(0, 120) : undefined,
        interests,
        coverImage: typeof body.coverImage === "string" ? body.coverImage.trim().slice(0, 2000) : undefined,
      },
      select: { id: true, name: true, image: true, bio: true, location: true, interests: true, coverImage: true },
    });
    return user;
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

  async listContacts(userId: string, includeUserId?: string) {
    const followedUsers = await prisma.communityFollow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const contactIds = new Set(followedUsers.map((follow) => follow.followingId));

    // A direct-message action from a post may target someone the viewer does not follow yet.
    // Include only that intentional recipient; the normal list remains limited to followed cooks.
    if (includeUserId && includeUserId !== userId) contactIds.add(includeUserId);
    if (contactIds.size === 0) return [];

    const users = await prisma.user.findMany({
      where: { id: { in: [...contactIds] } },
      orderBy: { name: "asc" },
      take: 50,
    });
    const userIds = users.map((user) => user.id);
    const messages = userIds.length
      ? await prisma.communityMessage.findMany({
          where: {
            OR: [
              { senderId: userId, recipientId: { in: userIds } },
              { senderId: { in: userIds }, recipientId: userId },
            ],
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const latestByUser = new Map<string, (typeof messages)[number]>();
    for (const message of messages) {
      const otherUserId = message.senderId === userId ? message.recipientId : message.senderId;
      if (!latestByUser.has(otherUserId)) latestByUser.set(otherUserId, message);
    }

    return users.map((user) => {
        const latest = latestByUser.get(user.id);
        return {
          id: user.id,
          name: user.name,
          username: user.email.split("@")[0],
          avatar: user.image || "",
          online: false,
          lastMessage: latest?.text || "Start a cooking conversation",
          lastMessageTime: latest ? timeAgo(latest.createdAt) : "",
        };
      });
  }

  async listMessages(userId: string, otherUserId: string, options: { take?: number; skip?: number } = {}) {
    const pairKey = [userId, otherUserId].sort().join(":");
    const conversation = await prisma.communityConversation.findUnique({ where: { pairKey } });
    if (!conversation) return { messages: [], hasMore: false };

    const take = Math.min(Math.max(options.take ?? 20, 1), 50);
    const skip = Math.max(options.skip ?? 0, 0);
    const result = await prisma.communityMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      skip,
    });
    const hasMore = result.length > take;
    const messages = result
      .slice(0, take)
      .reverse()
      .map((message) => ({ ...message, timestamp: timeAgo(message.createdAt) }));

    return { messages, hasMore };
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
