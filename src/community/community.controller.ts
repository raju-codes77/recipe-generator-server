import type { NextFunction, Request, Response } from "express";
import { getOptionalCommunityUser, requireCommunityUser } from "./community.auth";
import { communityService } from "./community.service";
import { uploadCommunityImage } from "./community-storage.service";
import { parsePostInput, parseRating, parseRequiredText } from "./community.validation";
import { prisma } from "../lib/prisma";

type Handler = (req: Request, res: Response) => Promise<unknown>;

export const handle =
  (handler: Handler) =>
  (req: Request, res: Response, next: NextFunction) =>
    handler(req, res).catch(next);

const param = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

export const communityController = {
  listPosts: handle(async (req, res) => {
    const user = await getOptionalCommunityUser(req);
    const rawTake = Number(req.query.take);
    const rawSkip = Number(req.query.skip);
    res.json({
      posts: await communityService.listPosts(user?.id, {
        take: Number.isFinite(rawTake) ? rawTake : undefined,
        skip: Number.isFinite(rawSkip) ? rawSkip : undefined,
      }),
    });
  }),

  getPostInteractions: handle(async (req, res) => {
    const parseQueryNumber = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    res.json({
      interactions: await communityService.getPostInteractions(param(req.params.postId), {
        commentsTake: parseQueryNumber(req.query.commentsTake),
        commentsSkip: parseQueryNumber(req.query.commentsSkip),
        reviewsTake: parseQueryNumber(req.query.reviewsTake),
        reviewsSkip: parseQueryNumber(req.query.reviewsSkip),
      }),
    });
  }),

  createPost: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    res.status(201).json({
      post: await communityService.createPost(user, parsePostInput(req.body)),
    });
  }),

  updatePost: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    await communityService.updatePost(user.id, param(req.params.postId), {
      caption: req.body.caption ? parseRequiredText(req.body.caption, "Caption", 3000) : undefined,
      tags: Array.isArray(req.body.tags) ? req.body.tags.map(String).slice(0, 12) : undefined,
    });

    res.json({ success: true });
  }),

  deletePost: handle(async (req, res) => {
    const user = await requireCommunityUser(req);
    await communityService.deletePost(user.id, param(req.params.postId));

    res.status(204).end();
  }),

  toggleLike: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    res.json(
      await communityService.toggleRecord("reaction", user.id, param(req.params.postId))
    );
  }),

  toggleMadeIt: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    res.json(
      await communityService.toggleRecord("madeIt", user.id, param(req.params.postId))
    );
  }),

  addComment: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    const comment = await communityService.addComment(
      user.id,
      param(req.params.postId),
      parseRequiredText(req.body.content, "Comment"),
      req.body.parentId
    );

    res.status(201).json({ comment });
  }),

  updateComment: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    res.json({
      comment: await communityService.updateComment(
        user.id,
        param(req.params.commentId),
        parseRequiredText(req.body.content, "Comment")
      ),
    });
  }),

  deleteComment: handle(async (req, res) => {
    const user = await requireCommunityUser(req);
    await communityService.deleteComment(user.id, param(req.params.commentId));

    res.status(204).end();
  }),

  saveReview: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    const review = await communityService.saveReview(user.id, param(req.params.postId), {
      rating: parseRating(req.body.rating),
      flavorRating: req.body.flavorRating ? parseRating(req.body.flavorRating) : null,
      easeRating: req.body.easeRating ? parseRating(req.body.easeRating) : null,
      presentationRating: req.body.presentationRating
        ? parseRating(req.body.presentationRating)
        : null,
      comment: parseRequiredText(req.body.comment, "Review"),
      cookingTips: req.body.cookingTips ? String(req.body.cookingTips).trim().slice(0, 1000) : null,
    });

    res.status(201).json({ review });
  }),

  deleteReview: handle(async (req, res) => {
    const user = await requireCommunityUser(req);
    await communityService.deleteReview(user.id, param(req.params.postId));

    res.status(204).end();
  }),

  toggleFollow: handle(async (req, res) => {
    const user = await requireCommunityUser(req);
    res.json(await communityService.toggleFollow(user.id, param(req.params.userId)));
  }),

  getPublicProfile: handle(async (req, res) => {
    const viewer = await getOptionalCommunityUser(req);
    res.json({ profile: await communityService.getPublicProfile(param(req.params.userId), viewer?.id) });
  }),

  listCollections: handle(async (req, res) => {
    const user = await requireCommunityUser(req);
    res.json({ collections: await communityService.listCollections(user.id) });
  }),

  createCollection: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    const collection = await communityService.createCollection(
      user.id,
      parseRequiredText(req.body.name, "Collection name", 120),
      req.body.description
    );

    res.status(201).json({ collection });
  }),

  savePost: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    res.json(
      await communityService.savePost(user.id, param(req.params.postId), req.body.collectionId)
    );
  }),

  listStories: handle(async (_req, res) => {
    res.json({ stories: await communityService.listStories() });
  }),

  createStory: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    const story = await communityService.createStory(
      user.id,
      parseRequiredText(req.body.imageUrl, "Story image"),
      parseRequiredText(req.body.caption, "Caption", 500),
      req.body.tag
    );

    res.status(201).json({ story });
  }),

  deleteStory: handle(async (req, res) => {
    const user = await requireCommunityUser(req);
    await communityService.deleteStory(user.id, param(req.params.storyId));

    res.status(204).end();
  }),

  listNotifications: handle(async (req, res) => {
    const user = await requireCommunityUser(req);
    res.json({ notifications: await communityService.listNotifications(user.id) });
  }),

  markNotificationRead: handle(async (req, res) => {
    const user = await requireCommunityUser(req);
    await communityService.markNotificationRead(user.id, param(req.params.notificationId));

    res.json({ success: true });
  }),

  listContacts: handle(async (req, res) => {
    const user = await requireCommunityUser(req);
    res.json({ contacts: await communityService.listContacts(user.id) });
  }),

  listMessages: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    res.json({
      messages: await communityService.listMessages(user.id, param(req.params.userId)),
    });
  }),

  sendMessage: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    const message = await communityService.sendMessage(
      user.id,
      param(req.params.userId),
      parseRequiredText(req.body.text, "Message"),
      req.body.attachedPostId
    );

    res.status(201).json({ message });
  }),

  reportPost: handle(async (req, res) => {
    const user = await requireCommunityUser(req);

    const report = await prismaReport(
      param(req.params.postId),
      user.id,
      req.body.reason,
      req.body.details
    );

    res.status(201).json({ report });
  }),

  upload: handle(async (req, res) => {
    await requireCommunityUser(req);

    const folder = req.body.folder === "stories" ? "stories" : "posts";

    res.status(201).json({
      url: await uploadCommunityImage(
        parseRequiredText(req.body.dataUrl, "Image", 9_000_000),
        folder
      ),
    });
  }),
};

async function prismaReport(
  postId: string,
  reporterId: string,
  reason: unknown,
  details: unknown
) {
  return prisma.communityReport.upsert({
    where: { postId_reporterId: { postId, reporterId } },
    update: {
      reason: parseRequiredText(reason, "Reason", 80),
      details: details ? String(details).slice(0, 2000) : null,
      status: "PENDING",
    },
    create: {
      postId,
      reporterId,
      reason: parseRequiredText(reason, "Reason", 80),
      details: details ? String(details).slice(0, 2000) : null,
    },
  });
}
